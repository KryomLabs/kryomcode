# KryomCode Security

What the app protects, where the boundaries are, and what remains the
user's responsibility. This documents the implemented controls, not
aspirations.

## Secret handling

- The Meta API key resolves through the secret allowlist
  (`electron/services/settings/secrets.service.cjs`): the process
  environment first (`MODEL_API_KEY`, from `.env` in development or
  the user environment when packaged), then the OS-encrypted
  credential vault. `getSecret` serves only allowlisted names and
  throws for any other name.
- User-owned keys entered in Settings → Providers are encrypted with
  Electron `safeStorage` (DPAPI / Keychain / libsecret) and stored in
  `kryomcode-credentials.json` under the Electron userData folder by
  `electron/services/settings/credential-vault.cjs`. Decrypted values
  live in main-process memory only; when OS encryption is unavailable
  the vault refuses to write (no plaintext fallback) and says so.
- The key is never exposed to the renderer: keys travel renderer →
  main only (`provider:set-key`), and every response carries presence
  info alone (configured/not-configured, credential source). No
  preload method returns key material; settings storage holds
  preferences only; sessions and logs never contain secrets.
- An environment key always wins over a vault key, so development
  `.env` setups keep working untouched, and a development key is never
  copied into the vault automatically.
- Terminal and Git child processes receive a scrubbed environment
  (`buildChildEnv` deletes allowlisted secret keys).
- The logger (`electron/utils/logger.cjs`) redacts `Bearer` tokens and
  secret-shaped keys/values from text and objects.
- `.env` is Git-ignored; `.env.example` contains placeholders only; the
  packaged app excludes `.env` files from its file set.
- A repository scan during Phase 3 found no hardcoded keys: matches
  were limited to `test-key` fixtures, env plumbing, and redaction
  patterns.

## Renderer isolation

- `BrowserWindow` uses `contextIsolation: true`, `nodeIntegration:
  false`, and `sandbox: true`.
- The renderer reaches the main process only through the
  `window.kryom` bridge. No Node APIs, no `require`, no raw IPC.
- New windows are denied (`setWindowOpenHandler`) and navigation is
  restricted to the exact dev-server origin in development and to the `kryom://app/index.html` entry document in packaged builds; `file:` URLs are denied and subframe navigation is denied (`electron/main.cjs` navigation guards, `electron/security/renderer-urls.cjs`, `electron/security/protocol-handler.cjs`).

## IPC authorization

Every `ipcMain.handle` callback first calls `isTrustedSender(event)`,
which requires the sender to be the app's own live main window. Payload
shapes and lengths are then validated with
`electron/security/validate-input.cjs`. Only the error message crosses
back to the renderer; coded errors (`electron/utils/errors.cjs`) stay
in the main process.

## IPC audit record (2026-10-30, Level 2A.1.4)

All 12 `electron/ipc/*.ipc.cjs` domain modules were audited
handler by handler (60 handlers at 2A.1.4, plus
`agent:checkpoints` and `agent:undo` under 2B.3, `git:cancel`
under 2B.4, and `terminal:classify` under 2B.5, all following the
same pattern): every handler calls `isTrustedSender(event)` first
and throws on an untrusted sender.
Every payload-bearing handler validates before acting, through one
of three mechanisms:

- `assert*` validators from `validate-input.cjs` (most channels);
- strict inline checks or coercions (`chat:save`,
  `filesystem:save-as`, `git:diff`, `git:changed-files`,
  `intelligence:context`, `ui:context`, `ui:set` scalars);
- delegation to a service that validates every argument
  (`ai:chat` → `ai.service.chat`, `terminal:run` →
  `terminal.service.runCommand`, `workspace:read-file`/`save-file` →
  `file.service`, `agent:apply` deep-checks in `agent.service`).

No handler passes raw renderer input to a file, process, network,
or Git sink. Residual note (accepted, consistent with the
"services validate every argument" convention): the four
delegation channels above rely on service-layer rather than
IPC-layer validation; a future pass may add IPC-layer asserts for
defense in depth without changing behavior.

## IPC audit record (2026-10-30, Level 3C)

The 26 new handlers added by Level 3C follow the same pattern and
are covered by the integration suite's per-channel unauthorized
sweep: `intelligence:index-status/refresh/freshness/symbols/
symbol/references/search/impact/architecture` (all read-only over
project sources; writes only `.kryom/index/`),
`agent:impl-plan/revise/cancel` (plan persistence only),
`agent:specialist-run/get/cancel/list` (specialists propose;
nothing writes project sources), `agent:orch-start/advance/
approve/retry/cancel/get/list` (merges flow through ownership
checks, change-set analysis, and the guarded `applyEdits` path),
and `diagnostics:quality/get/list` (computed reports; no model
calls). Every handler calls `isTrustedSender(event)` first and
validates payloads with `assert*` validators; services re-validate
(all paths resolve through `resolveWorkspacePath`, all storage
through `storage-path.cjs`). No new network, terminal, or Git
execution surfaces were added: specialists and the orchestrator
can only reach the configured AI provider, and the coding
specialist's proposals still require explicit per-task approval
before `applyEdits` touches the disk.

## IPC audit record (2026-10-30, Level 4A)

The 51 new handlers added by Level 4A follow the same pattern
and are covered by the integration suite's per-channel
unauthorized sweep plus end-to-end channel-flow tests:
`provider:list/get/selection/configure/models/model/test`
(selection and redacted connection checks — secrets stay in
the environment allowlist and never cross IPC),
`permission:list/grants/check/grant/revoke` and `audit:list`
(explicit grants, secret-free events),
`extension:list/get/pick-directory/install/enable/disable/
activate/deactivate/uninstall/command` (local folders only;
installs land disabled; commands run inside the vm sandbox),
`skill:list/get/save/delete/set-enabled/run` (validation on
save, grant + approval gates on run), `workflow:list/get/
save/delete/start/advance/approve/resume/cancel/get-run/runs`
(no autonomous execution — every transition is an explicit
call), `integration:list/status/connect/disconnect/
repositories/history` (GitHub = local git; no tokens), and
`template:list/get/pick-destination/preview/generate`
(preview before confirm; setup commands are instructions,
never executed). Every handler calls `isTrustedSender(event)`
first and validates payloads with `assert*` validators. No
untrusted code executes without a user action, and revoking a
grant stops the next execution-boundary check.

## Permission reference (Level 4A)

Twelve granular permissions, no wildcard. Trust levels
(`builtin`, `user`, `third-party`, `untrusted`) never
auto-grant — every grant is an explicit user action recorded
in the audit log.

| Permission | Risk | Grants |
|---|---|---|
| `workspace.metadata` | low | Project name, file listing, index status |
| `workspace.read` | medium | File contents inside the open project |
| `workspace.write` | high | Create/modify project files (approvals still apply) |
| `terminal.execute` | high | Commands through the guarded terminal service |
| `network.access` | high | Outbound requests to declared hosts |
| `ai.provider` | medium | Prompts to the configured AI provider |
| `ai.tools` | medium | Analysis, planning, and specialist tools |
| `git.read` | low | Status, history, remotes, diffs |
| `git.write` | high | Stage/commit/push/pull (approvals still apply) |
| `integrations.external` | high | Connected third-party integrations |
| `templates.generate` | medium | New projects from templates |
| `workflows.execute` | medium | Multi-step workflows (approvals still apply) |

Checks happen at the execution boundary
(`requirePermission`), never only in the renderer. Subjects
look like `extension:<id>`, `skill:<scope>:<id>`,
`workflow:<id>`, or `integration:<id>`.

## Workspace containment

- All file, terminal, Git, diagnostics, and agent operations resolve
  paths through `resolveWorkspacePath`, which rejects traversal outside
  the open root, refuses symlinks (including ancestor symlinks for
  not-yet-existing paths), and rejects operations targeting the root
  itself unless explicitly allowed.
- The file tree, search, and intelligence indexes skip `node_modules`,
  `.git`, build output, and `.env*` files, and report truncation
  instead of silently cutting results.
- Reads and writes are capped at 1 MB per file.

## Approval workflow

| Operation | Approval boundary |
|---|---|
| Terminal command | One explicit `terminal:run` call per command. Warnings are advisory metadata, never a safety verdict. |
| Agent plan | `agent:plan` only proposes. The UI shows diffs; nothing is written during planning. |
| Agent apply | `agent:apply` writes only the caller-supplied edits after re-validating each one, with rollback on failure. Planned commands are never executed. |
| Change-set analysis | `agent:change-set` is read-only: it informs review and ordering but grants no approval and bypasses no check. |
| Implementation plan | `agent:impl-plan` only proposes and persists; revisions create new records. Nothing executes. |
| Specialist run | Specialists propose findings/edits; the coding specialist's edits still need approval. Testing never executes; nothing writes project sources. |
| Orchestrated merge | Runs start from approved plans only. `agent:orch-approve` merges one task after ownership, conflict, change-set, and freshness checks; ambiguous conflicts stop for human review. Parallelism covers proposal generation only — disk writes are strictly sequential. |
| Git commit / push | Separate explicit channels. Push uses ambient Git credentials, which KryomCode never handles. |
| File delete / overwrite | Renderer confirm and conflict dialogs; backend re-validates. |

## User responsibilities

- Terminal commands execute with your OS user permissions. Review every
  command, especially agent-suggested ones, before running it.
- Only open project folders you trust. Git features use standard
  ancestor discovery, so a folder inside another repository reports
  that repository's state.
- Treat AI output as untrusted: review each planned edit before
  approving, and never paste secrets into prompts.
- Keep `.env` and the packaged machine's environment variable private;
  anyone with the key can bill your Meta account.

## Reporting

Suspected vulnerabilities should be reported privately to the KryomLabs
maintainers, not through public issues, until a fix is available.
