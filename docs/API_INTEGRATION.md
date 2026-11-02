# KryomCode API Integration

How KryomCode talks to Meta AI models. All network access happens in
the main process; the renderer only sends prompts and receives answers
through `ai:chat` and `agent:plan`.

## Endpoint and models

- Base URL (fixed in code, not configurable):
  `https://api.meta.ai/v1/chat/completions`
- Supported model IDs (allowlist in
  `electron/services/ai/ai-config.service.cjs`):
  - `muse-spark-1.3` (default)
  - `muse-wonder-1.0`
- Temperature is fixed at `0.2`. Request timeout is 90 seconds.

## Configuration resolution

`getAIConfig()` throws a user-safe error when no key is configured or
when `META_MODEL` names an unsupported model. Otherwise it returns
`{ apiKey, model }`. The key resolves through the secret allowlist:
the `MODEL_API_KEY` environment value first, then the OS-encrypted
credential vault holding the user's own key from Settings →
Providers. Per-request overrides (`payload.model` for chat, settings
`defaultModel` for the UI) are validated by `resolveModel` against
the same allowlist, so neither environment values nor renderer input
can select an arbitrary model.

## Chat flow (`ai:chat`)

`electron/services/ai/ai.service.cjs` enforces the limits, builds the
message list, and delegates to the provider:

| Limit | Value |
|---|---|
| Prompt length | 1–12,000 characters |
| Workspace context | Truncated to 20,000 characters |
| History | Last 12 user/assistant messages, 12,000 chars each |
| System roles | Fixed KryomCode prompt plus an untrusted-context label |

Context and history are labelled as untrusted reference material so
repository text cannot override the system instructions. Only
`{ answer, model }` is returned; empty or malformed provider replies
raise `Meta API returned an empty or unsupported response.`

## Agent planning flow (`agent:plan`)

`electron/services/agent/agent.service.cjs` sends the task plus a
bounded workspace brief (project type, script names, up to 120 indexed
paths, 20,000 chars) and requires the model to reply with a JSON plan:
`{ edits, commands, notes }`. The reply is parsed (code fences
tolerated), then every edit is re-validated: action must be
`create`/`modify`/`delete`, paths must resolve inside the workspace,
content is required for create/modify and capped at 1 MB, at most 20
edits survive. Commands are returned as suggestions only and have no
execution path. See [SECURITY.md](SECURITY.md) for the apply boundary.

## Provider contract

`electron/services/ai/providers/provider.interface.cjs` defines the
interface: `await provider.chat({ model, messages, signal })` returns
`{ answer, model }` and throws `Error` with user-safe messages (no
keys, headers, or echoed prompts).

- `meta-muse.provider.cjs` — the real implementation. Maps 401/403 to
  an authentication hint, 429 to a rate-limit hint, and network
  failures to a connectivity hint. Abort signals distinguish
  cancellation from timeout.
- `mock.provider.cjs` — deterministic test double. Records calls, never
  touches the network, used by the chat, agent, and config tests.

To add a provider, implement `chat`, assert it with
`assertImplementsProvider`, and inject it through the service options
(the services accept `options.provider` for this purpose).

## Verification status

Mocked provider tests cover both models. Live status: re-verified on the
current tree on 2026-11-02 (one exact-marker request per model, both passed;
see [META_LIVE_VERIFICATION.md](META_LIVE_VERIFICATION.md)). The earlier canonical
record is the 2026-10-28 smoke in [backend-limitations.md](backend-limitations.md).
Full VERIFIED LIVE (agent-plan and research-synthesis flows) is still pending.
