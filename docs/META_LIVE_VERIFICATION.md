# Meta AI Live Integration Verification

Scope: narrowly scoped verification of KryomCode's existing Meta AI
integration. No source, dependency, provider, README, release, or Git
changes were made for this check.

## Status: CODE-VERIFIED ONLY (live testing BLOCKED)

- The provider, model allowlist, credential handling, chat flow,
  agent planning flow, research synthesis flow, and error /
  cancellation / timeout / fallback behavior are all implemented and
  were traced through the real code paths (evidence below).
- No live Meta API call was made in this session: there is no working
  command execution in this environment (see Environment), and no
  credential was read, printed, or used. Nothing below claims a live
  result.
- One informational signal only: an unauthenticated GET to the
  configured endpoint path returned HTTP 401, which shows the host
  and path respond to HTTPS. It proves nothing about the POST chat
  flow, authentication, models, or latency.

## Date and environment

- Date (UTC): 2026-10-30.
- Machine: Windows (`C:\Users\LENOVO\Documents\KryomLabs\kryomcode`).
- App version: 0.1.0 (`package.json`), Electron 45, Node 22 pinned by CI.
- Execution: unavailable. The shell sandbox reports
  `windows_elevated setup_required` and every shell command fails
  before starting, so `node`, `npm test`, `npm run dev`, and any
  authenticated request could not be executed here.
- Credentials: presence-checked without opening values (see Phase 1
  below). Neither `.env` contents nor the OS-encrypted vault
  (`kryomcode-credentials.json` under Electron `userData`) was
  opened, and no key material appears in this file.

## Phase 1 attempt (2026-10-30, same session)

Safe checks only; each result reported separately:

1. Credential configuration inspected without revealing secrets:
   key allowlist (`MODEL_API_KEY`, `TAVILY_API_KEY`), env-wins-over-
   vault resolution with presence-only reporting, and the vault path
   logic were re-confirmed in code. PASS (code).
2. `.env` file presence: a `.env` file EXISTS in the project root
   (confirmed by filename-only lookup; contents never opened). It
   contains no `META_MODEL` entry, so the default model
   (`muse-spark-1.3`) would apply. Key presence/value deliberately
   unverified.
3. Node.js/npm availability: BLOCKED. The integrated-terminal check
   (`node --version`, `npm --version`) could not run — the command
   failed before starting with `windows_elevated setup_required`.
   Per tooling rules it was attempted once and not retried.
4. Live probe `testConnection('meta', { live: true })`: located at
   `electron/services/ai/provider-config.cjs:248-332` (15 s timeout,
   minimal `Reply with the single word: ok` prompt, redacted
   results). Execution BLOCKED — no shell (see 3).
5. Per-model provider tests (Spark 1.3, Wonder 1.0): NOT RUN —
   blocked by 3. No responses observed; nothing invented.
6. Chat / agent planning / research synthesis live flows: NOT RUN —
   blocked by 3. Implementation remains code-verified only.

Phase 1 verdict: the project is configured for a live run
(`.env` present, probe implementation located, exact commands
ready below), but no live call was possible in this environment.
Status unchanged: CODE-VERIFIED ONLY.

## Code verification (all implemented, traced)

### 1. Meta provider and endpoint

- `electron/services/ai/providers/meta-muse.provider.cjs:8-11`:
  fixed base `https://api.meta.ai/v1` + `/chat/completions`,
  temperature `0.2`, timeout 90 s. The URL is a constant; renderer
  input and per-request options cannot select another endpoint.
- `chat({ model, messages, signal })` (`:43-130`) POSTs
  `{ model, messages, temperature }` with `Authorization: Bearer`,
  `redirect: 'error'` (keys never follow redirects off-host), and an
  AbortController combining the 90 s timer with caller cancellation.
- Response handling (`:87-104`): non-2xx maps through `mapHttpError`;
  the answer must be `choices[0].message.content` (non-empty
  string) or the call throws `Meta API returned an empty or
  unsupported response.` Returns `{ answer, model }`.

### 2. Supported model IDs and allowlist

- `electron/services/ai/ai-config.service.cjs:5-6`:
  `SUPPORTED_MODELS = ['muse-spark-1.3', 'muse-wonder-1.0']`,
  default `muse-spark-1.3`.
- `resolveModel` (`:15-27`) rejects any other ID with an error
  listing the supported values; `getAIConfig` (`:29-48`) applies the
  same rule to `META_MODEL` and throws setup guidance when no key is
  configured.
- Registry descriptor (`meta-muse.provider.cjs:138-171`): id `meta`,
  both models with honest capabilities
  (`text: true, streaming: false, vision: false, tools: false`,
  `contextWindow: null`), auth kind `api-key` bound to
  `MODEL_API_KEY`.

### 3. API key configuration and storage

- Allowlist: `SECRET_KEYS = ['MODEL_API_KEY', 'TAVILY_API_KEY']`
  (`electron/services/settings/secrets.service.cjs:9`).
- `getSecret` (`:20-26`): process environment wins, then the
  in-memory vault cache; `getSecretSource` (`:28-42`) reports
  `environment` / `vault` / `missing` so the UI shows presence only.
- Vault: safeStorage-encrypted `kryomcode-credentials.json` in
  `userData`, 0600 + atomic write, no plaintext fallback
  (`electron/services/settings/credential-vault.cjs`).
- IPC carries presence only: `provider:set-key` is one-way and
  returns saved/source; `provider:key-status` and `app:get-ai-status`
  return booleans/sources, never key material
  (`electron/ipc/platform.ipc.cjs:155-237`,
  `electron/ipc/app.ipc.cjs:60-75`).
- Keys are scrubbed from terminal/diagnostics child environments and
  from logs (`terminal.service.cjs` `buildChildEnv`,
  `utils/logger.cjs` redaction).

### 4. Chat request flow

`ai:chat` (`electron/ipc/ai.ipc.cjs:24`) →
`electron/services/ai/ai.service.cjs:81-202`:

1. Prompt required, max 12,000 chars; research session id validated.
2. `getAIConfig()` + `resolveModel(payload.model, config.model)`.
3. Messages: fixed system prompt + optional workspace context (max
   20,000 chars) + optional research brief (max 6,000) + last 12
   history messages (12,000 chars each), all labelled untrusted.
4. `provider.chat(...)` under a registered AbortController;
   `ai:cancel` (`ai.ipc.cjs:32`) → `cancelChat()` aborts the
   in-flight call. Single-flight: one active chat controller at a
   time (a second tab's cancel can abort the first tab's request;
   state never corrupts).
5. Empty answers throw; success returns
   `{ answer, model, researchSessionId? }`.

### 5. Agent planning flow

`agent:plan` → `planTask`
(`electron/services/agent/agent.service.cjs:293-516`):

1. Task validated (max 4,000 chars); `researchSessionId` and
   `includeChat` validated; `getAIConfig()` + `resolveModel`.
2. Provider defaults to `MetaMuseProvider` with the configured key;
   tests inject the mock via `options.provider`.
3. Cancellation is armed before the first await; context gathering
   (selected files, workspace brief capped at 20,000 chars with up
   to 120 indexed paths, research context, opt-in chat excerpt)
   checks for cancel between steps.
4. One `provider.chat` call with the planner system prompt; the reply
   is JSON-parsed (code fences tolerated) and re-validated: actions
   `create`/`modify`/`delete`, workspace-contained paths, content
   required for create/modify, at most 20 edits and 10 commands.
5. Returns the plan plus digests, previews, risks, and a persisted
   context snapshot. Commands are suggestions only — the agent
   service has no execution path.

### 6. Research synthesis flow

`research.service.cjs:232-260` (`synthesizeBrief`) + `:346-355`:

1. Without an LLM provider, the session produces the extractive
   brief directly (`via: 'extractive (no LLM configured)'`).
2. With a key, `MetaMuseProvider` chats the synthesis prompt
   (default model `muse-spark-1.3`, caller-cancellable via
   `options.signal`).
3. The reply must pass citation validation
   (`brief.service.cjs:36-66`); failures fall back to the extractive
   brief and record the validation errors. Success records
   `via: 'llm (<model>)'`.

### 7. Errors, cancellation, timeout, fallback

- HTTP mapping (`meta-muse.provider.cjs:14-26`): 401/403 →
  authentication hint; 429 → rate-limit hint; other statuses →
  server detail bounded to 500 chars (`boundDetail`).
- AbortError → `cancelled` vs `timed out` wording depending on
  origin (`:106-112`); network TypeError → connectivity hint
  (`:114-118`).
- Timeouts: 90 s provider default; 15 s live connection test
  (`provider-config.cjs:26`).
- Fallback: routing uses explicit-only standby (`router.cjs:97-105`)
  — without a configured fallback, an unusable provider errors
  instead of silently switching. Research falls back to extractive
  briefs, never to invented claims.
- Built-in live probe: `testConnection(providerId, { live: true })`
  (`provider-config.cjs:248-332`) runs local checks, then sends the
  minimal prompt `Reply with the single word: ok` to the default
  model and reports presence-safe results. This is the mechanism the
  next live run should use first.

## Live test matrix (all NOT RUN)

| # | Case | Expected | Result |
|---|---|---|---|
| L1 | Minimal chat, `muse-spark-1.3` | Non-empty answer, model echo | PASS 2026-11-02T09:08:32Z: 2915 ms, model echo `muse-spark-1.3`, 12-char marker reply, key never printed |
| L2 | Minimal chat, `muse-wonder-1.0` | Non-empty answer, model echo | PASS 2026-11-02T09:08:39Z: 7131 ms, model echo `muse-wonder-1.0`, 12-char marker reply, key never printed |
| L3 | Agent plan (existing workflow) | Valid, previewable JSON plan | NOT RUN — same blocker |
| L4 | Research run with LLM synthesis | Cited brief, `via: 'llm (...)'` | NOT RUN — same blocker |
| L5 | Cancel/timeout/error paths live | Cancelled/timeout/auth wording | NOT RUN — code-traced only |

No latency, response text, or model-identity data was observed in
this session. The prior claim in `docs/backend-limitations.md` (live
smoke passed 2026-10-28) conflicts with `docs/API_INTEGRATION.md`
("No live Meta API call has been made from this repository"); this
session resolves nothing either way and records no new live result.

## Errors and limitations

- Blocking: shell execution unavailable (`windows_elevated
  setup_required`), so no `node`/`npm`/Electron process and no
  authenticated HTTPS call could be made.
- Credentials were intentionally left unverified (presence unknown);
  opening `.env` or the vault would expose secrets without any way
  to use them here.
- Known product warts (unchanged): single-flight chat cancel can
  abort another tab's request; chat/agent/research are single-shot
  (no streaming); research without a key is extractive-only.

## Exact next action (to reach VERIFIED LIVE)

On a machine with a working shell, with the key configured through
the existing secure mechanism only (`.env` from `.env.example` for
dev, or Settings → Providers vault — never paste keys into source,
chat, or docs):

1. `npm ci` (if needed), then run the built-in live probe for the
   default model (15 s timeout, key never printed):
   `node -e "require('dotenv').config();require('./electron/services/ai/provider-config.cjs').testConnection('meta',{live:true}).then(r=>console.log(JSON.stringify(r)))"`
2. Minimal chat per model with latency (L1/L2), e.g.:
   `node -e "require('dotenv').config();(async()=>{const{getAIConfig,resolveModel}=require('./electron/services/ai/ai-config.service.cjs');const{MetaMuseProvider}=require('./electron/services/ai/providers/meta-muse.provider.cjs');for(const m of['muse-spark-1.3','muse-wonder-1.0']){const c=getAIConfig();const p=new MetaMuseProvider({apiKey:c.apiKey});const t=Date.now();const r=await p.chat({model:resolveModel(m,c.model),messages:[{role:'user',content:'Reply with exactly: KRYOMCODE_OK'}]});console.log(m,Date.now()-t+'ms',JSON.stringify({model:r.model,chars:r.answer.length,marker:r.answer.includes('KRYOMCODE_OK')}))}})()"`
3. In-app checks per `docs/TESTING.md` #2-3 and `docs/SMOKE_TEST.md`:
   `npm run dev` → one real-key chat per model (L1/L2), one agent
   plan (L3), one research run showing `via: 'llm (...)'` (L4), plus
   Stop-button cancels (L5).
4. Record the date, per-model latency, success/failure, and any error
   text (redacted) in the matrix above and flip the status line to
   VERIFIED LIVE only if L1–L4 succeed with observed responses.

## Phase G addendum (2026-11-01, docs-only, no live run)

- The doc conflict noted above (backend-limitations vs API_INTEGRATION)
  was resolved on the docs side only: `docs/API_INTEGRATION.md`
  §Verification status now names `docs/backend-limitations.md`
  (2026-10-28 smoke) as the canonical record and states it has NOT
  been re-verified on the current working tree.
- No new live result was recorded: shell execution remains unavailable
  (`windows_elevated setup_required`), so L1–L5 are still NOT RUN.
  Status stays CODE-VERIFIED ONLY.

## Phase 2C addendum (2026-11-02, live L1/L2 PASS)

- Shell execution works in this phase (escalated one-shot approval),
  so the doc's exact L1/L2 one-liner ran against the configured
  provider workflow with `MODEL_API_KEY` resolved from the environment
  (presence-only check; key never printed, answer text never printed —
  only model echo, latency, reply length, and a marker boolean).
- L1 `muse-spark-1.3`: PASS at 2026-11-02T09:08:32Z (2915 ms).
  L2 `muse-wonder-1.0`: PASS at 2026-11-02T09:08:39Z (7131 ms).
  Full per-model evidence lives in `docs/PHASE_2C_OWNER_VERIFICATION_REPORT.md`.
- L3/L4/L5 remain NOT RUN (in-app agent/research/cancel flows need
  GUI interaction, which is blocked this phase). Per the rule in
  "Exact next action", the status line stays CODE-VERIFIED ONLY
  until L1–L4 all succeed with observed responses.
