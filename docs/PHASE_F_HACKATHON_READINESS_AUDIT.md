# KryomCode — Phase F: Hackathon Readiness Audit

Date: 2026-11-01. Baseline: branch `main`, HEAD `c0c5f4a` (as briefed).
Scope: full working-tree static audit. No code, config, test, or doc was
modified for this report except creating this new file.

## 0. Method and environment limits (read first)

- Shell execution is broken in this session: every `powershell` call fails
  with `windows_elevated setup_required` (sandbox enforcement unavailable).
  Consequence: no command was executed here — no `npm test`,
  `test:renderer`, `tsc`, `build`, `pack`, `dist`, `git status`, or app
  launch. The 11-agent parallel workflow also failed with the same
  environment error on all children; this report is a direct inline
  inspection instead.
- All findings below are inspection-verified via file reads and bounded
  content search. Anything requiring execution (test outcomes, build,
  packaging, GUI behavior, live Meta API calls) is marked UNVERIFIED here
  and must be re-run on the owner machine before submission.
- No secrets are printed. Filenames and configuration risks only.
- Existing audit docs were not overwritten. This is a new file.

## 1. Executive summary

KryomCode is a genuinely hardened, review-first desktop IDE. The security
architecture (sandboxed renderer, trusted-sender + main-frame IPC checks,
workspace containment, secret allowlist + OS vault, SSRF-pinned research
fetch, native approval gates) is consistently implemented and tested on
paper. The AI platform is honest (single-shot, `streaming:false`,
explicit-only fallback, allowlisted models). Agent apply is approval-gated
with freshness digests, conflict gates, rollback, and checkpoints. Research
is real (multi-provider search, citation validation, extractive fallback),
not a mock. Docs are unusually honest about limits (Windows-only
validation, untested macOS/Linux packaging, no screenshots yet).

Blockers for a hackathon submission are readiness and verification gaps,
not deep design flaws:

1. The working tree has ~105 uncommitted paths (as briefed) and the last
   executed green run is dated 2026-10-30 — current-tree test/build/pack
   status is unknown and could not be re-verified here (P1).
2. Two doc contradictions about Meta API verification and navigation/CSP
   policy must be fixed before judges read them (P1).
3. No verified screenshots or demo recording exist yet (P1 for presentation).
4. Single-flight global AI/agent cancel can abort a sibling tab's request
   (P2, documented wart L3).
5. Renderer test-count docs (8/8) are stale vs 32 test files on disk (P2).
6. Permission handler grants clipboard-write without origin/frame check
   (P2 hardening gap, low exploitability given navigation lockdown).

No P0 (critical security or data-loss) issue was confirmed by inspection.
Verdict: Ready-with-fixes — fix P1 docs, re-run gates on the owner
machine, capture screenshots/demo, then submit.

## 2. Overall project quality score: 8.0/10

- Architecture and boundaries: 9/10 (clean 3-layer trust model, typed
  bridge, domain services; minus for App.tsx size and hook-disable volume).
- Security: 8.5/10 (strong controls throughout; minus for permission
  origin check, undici-fallback rebinding residual, narrow CI secret scan).
- AI/Agent/Research honesty: 9/10 (allowlist, no silent fallback, real
  providers, citation fail-closed; minus for single-flight cancel).
- Workbench/terminal/Git: 8/10 (containment, conflict detection,
  approval gates; minus for buffered-only terminal vs pty expectations).
- Testing/CI design: 7.5/10 (71-file backend manifest gate, wiring net,
  IPC unauthorized sweep, 3-OS matrix; minus for stale counts and
  unverified current tree).
- Docs accuracy: 7/10 (honest but with 3 contradictions/stale counts).
- Presentation: 6/10 (no screenshots/demo yet; SMOKE_TEST demo flow exists).

Weighted overall: 8.0/10. Code is submission-grade; docs + verification +
demo assets are the gap.

## 3. Architecture assessment

Verified healthy:

- 3-layer trust model holds everywhere inspected: renderer
  (`src/app/App.tsx` + `src/api/kryom.ts`) calls typed `window.kryom`
  methods; `electron/preload.cjs` forwards one method per channel with no
  Node APIs; `electron/ipc/register-handlers.cjs` wires 15 domain modules;
  services own disk/network/secrets. Entry: `package.json` main
  `electron/main.cjs`, `electron/main.cjs:464-479` window options.
- TypeScript: `tsconfig.json:14` `strict:true`, no `any`/`ts-ignore` in
  `src/` (bounded search hit only `eslint-disable` comments), `src/utils`
  and `src/state` pure and tested. `vite.config.ts:18-31` injects CSP from
  the single security source so header and meta cannot drift.
- State/event lifecycle: terminal polling (`src/components/TerminalPanel.tsx:61-74`)
  clears its interval; research polling
  (`src/components/ResearchPanel.tsx:156,182`) clears; AI elapsed timer and
  key listener (`src/components/AiChat.tsx:187,206`) clean up; xterm
  (`src/components/terminal/XtermView.tsx:246-249`) disposes listeners,
  addons, and terminal. Chat merge caps at 50, store caps at 50, 12 sent
  (`src/components/AiChat.tsx:69-83`, `electron/services/ai/chat-store.cjs:29`,
  `electron/services/ai/ai.service.cjs:28`).
- Error handling: `electron/utils/errors.cjs` coded errors stay in main;
  only messages cross IPC; `boundDetail` caps untrusted text; logger
  (`electron/utils/logger.cjs:7-23`) redacts Bearer/keys at every level.
- No dead-code signal: zero TODO/FIXME/HACK in `electron/`+`src/`
  (search hit only fixture `console.log` strings and a keyword tokenizer);
  backend scaffold cleanup is recorded in `docs/backend-limitations.md:72-82`.

Findings:

### F-A1 (P3) App shell is monolithic

- Root cause: `src/app/App.tsx` (~3000+ lines; refs past line 3032)
  owns activity/sidebar/center/bottom/aside/dialogs/menus/restore.
- Repro: read the file; note 4+ `eslint-disable react-hooks/exhaustive-deps`.
- Evidence: `src/app/App.tsx:1-103` imports; `:583,:788,:2074,:2674` disables.
- Impact: review/merge risk, slower onboarding; no runtime defect observed.
- Smallest safe fix: extract one panel area per PR behind existing props
  (no behavior change). Do not refactor before the hackathon.
- Regression test: existing `src/components/PhaseAShell.test.tsx` +
  `check:workbench` must stay green.

### F-A2 (P3) 26 hook-exhaustive-deps disables with no lint gate

- Root cause: effects with intentional dep omissions; CI runs no ESLint.
- Repro: bounded search for `eslint-disable` in `src/` returns 26 hits
  across App/AgentPanel/AgentWorkspace/AiChat/EditorPanel/GitPanel/etc.
- Evidence: search output (e.g. `src/components/GitPanel.tsx:69`,
  `src/components/ResearchPanel.tsx:299,479`).
- Impact: stale-closure risk is invisible to CI; nothing confirmed broken.
- Smallest safe fix: after submission, add `eslint` with
  `react-hooks` recommended and convert disables to justified per-line
  exceptions; for now add nothing.
- Regression test: new lint gate must report the current 26 as its
  baseline before any fix.

## 4. Security findings

Verified healthy (inspection):

- Window: `contextIsolation:true, nodeIntegration:false, sandbox:true`
  (`electron/main.cjs:473-478`); `setWindowOpenHandler deny` (`:524`);
  DevTools blocked when packaged unless `KRYOM_DEVTOOLS=1` (`:538-548`).
- Navigation: parsed-URL main-frame policy, no `file:` URLs, no subframes
  (`electron/main.cjs:550-566`, `electron/security/renderer-urls.cjs:43-84`).
- Protocol: `kryom://app` serves only bundled `dist/`, traversal/host/
  credential/method rejected (`electron/security/protocol-handler.cjs:73-132`).
- CSP: production `default-src 'none'`, no remote hosts, no inline scripts
  (`electron/security/content-security-policy.cjs:14-34`); dev adds only
  inline bootstrap + HMR websocket (`:39-54`).
- IPC: every sampled handler calls `isTrustedSender(event)` first and
  validates payloads (`electron/ipc/terminal.ipc.cjs:22-27`,
  `agent.ipc.cjs` sweep, `ai.ipc.cjs:25-31`, `app.ipc.cjs:80-85`,
  `diagnostics.ipc.cjs:21-27`, `memory.ipc.cjs:72-77`,
  `platform.ipc.cjs:155-176`); trusted sender requires known window AND
  main frame AND allowed URL (`electron/security/trusted-sender.cjs:16-52`).
- Paths: `resolveWorkspacePath` rejects traversal/outside/symlinks/root
  (`electron/security/validate-path.cjs:20-106`); `.kryom` storage layer
  additionally defeats junctions via per-level realpath
  (`electron/security/storage-path.cjs:62-123`); git/file/gitignore agree
  (`.gitignore:5-8` ignores `.env*`+`.kryom/`; `package.json:79-81`
  excludes them from builds; `electron/main.cjs:11-15` loads `.env` in
  dev only).
- Secrets: allowlist (`electron/services/settings/secrets.service.cjs:9`);
  vault OS-encrypted, no plaintext fallback, atomic 0600 writes
  (`electron/services/settings/credential-vault.cjs:158-183,188+`);
  renderer sees presence booleans only (`electron/ipc/app.ipc.cjs:60-74`,
  `platform.ipc.cjs:234-235`); children get scrubbed env
  (`electron/services/terminal/terminal.service.cjs:28-38`,
  `electron/services/git/git.service.cjs:67-71`); git remote userinfo
  redacted (`:449-468`); support bundle collects booleans/counts only
  (`electron/services/diagnostics/support-bundle.cjs:62-120`).
- Terminal/Git: destructive commands face native main-process dialog
  (`electron/ipc/approval.cjs:85-119`, wired in `terminal.ipc.cjs:32-35`
  and `diagnostics.ipc.cjs:41-44`); git uses `shell:false` + arg arrays
  (`electron/services/git/git.service.cjs:76-82`), clone restricted to
  GitHub HTTPS/SSH or local dirs (`:523-577`), refs reject leading dash
  (`:399-413`), pull is `--ff-only` (`:710`); process trees die via
  taskkill (win) or group signal for marked detached children only
  (`electron/services/terminal/process-manager.cjs:67-107`).
- Research fetch: http(s) only, per-hop DNS validation of EVERY address,
  pinned undici transport against rebinding, manual redirects (max 5),
  size/time caps, markup stripped
  (`electron/services/research/url-fetch.service.cjs:28-60,318-442,448-532,632-854`).
- Renderer: no `dangerouslySetInnerHTML`/`eval`/`fetch`/`WebSocket` in
  `src/` (bounded search empty); MarkdownLite renders React text nodes
  only (`src/components/MarkdownLite.tsx:4-10`); external links go through
  validated `app:open-external` (`electron/ipc/app.ipc.cjs:80-90`,
  `src/components/terminal/XtermView.tsx:192-196`); clipboard is
  write-only guarded helper (`src/utils/clipboard.ts:6-27`).
- Extensions/skills/workflows: local folders only, disabled-by-default,
  vm sandbox + worker process isolation, JSON membrane, timeouts,
  12-permission boundary enforcement
  (`electron/services/extensions/runtime.cjs:1-12,173-250`,
  `electron/services/permissions/permission.service.cjs:19-80`,
  `electron/services/skills/skill-runner.cjs:85,156,175`,
  `electron/services/workflows/workflow-engine.cjs:453,601,776-827`).

### F-S1 (P2) Permission handler lacks origin/frame validation

- Root cause: `electron/main.cjs:529-533` allows
  `clipboard-sanitized-write` for any `permission` string match without
  checking `details.requestingUrl` / frame.
- Repro: read the 5-line handler; compare with the strict
  `isTrustedSender` frame check used for IPC.
- Evidence: `electron/main.cjs:529-533` vs
  `electron/security/permissions.cjs:8-14`.
- Impact: low exploitability (navigation locked to app origin, no
  subframes, new windows denied), but a navigated/compromised renderer
  could write clipboard without a per-origin check.
- Smallest safe fix: use the 4-arg handler `(contents, permission,
  callback, details)` and allow only when `shouldAllowPermission` passes
  AND `details.requestingUrl` satisfies `isTrustedAppUrl`; deny otherwise.
- Regression test: extend `electron/security/permissions.test.cjs` with
  requestingUrl allow/deny cases.

### F-S2 (P3) Undici-missing fallback loses rebinding pinning (documented)

- Root cause: `buildPinnedTransport` returns null without undici; caller
  falls back to unpinned fetch (`electron/services/research/url-fetch.service.cjs:513-532`).
- Repro: read `loadUndici`/`buildPinnedTransport`; note warn-only at `:501`.
- Evidence: `:485-532`; residual already disclosed in
  `docs/backend-limitations.md:107-110`.
- Impact: DNS-rebinding SSRF theoretically possible on that path only;
  normal path validates + pins. `undici` is a direct dependency
  (`package.json:40`), so absence means broken install.
- Smallest safe fix: none before submission (docs already honest).
  Post-submission: fail closed (`accessStatus:blocked`) when pinning is
  unavailable instead of warn+proceed.
- Regression test: extend `url-fetch.service.test.cjs` with undici-null
  case asserting blocked status.

### F-S3 (P3) CI secret scan is narrow

- Root cause: `.github/workflows/ci.yml:47-63` scans only for a PEM
  private-key block header and an access-key-ID shape (see `ci.yml:52`).
- Evidence: `ci.yml:52-57`.
- Impact: Meta/Tavily-shaped keys or generic tokens would not trip the
  gate; vault/redaction design mitigates, but the gate over-promises.
- Smallest safe fix: post-submission, add `MODEL_API_KEY\s*=\s*\S` and
  `TAVILY_API_KEY\s*=\s*\S` patterns excluding `.env.example`/fixtures.
- Regression test: negative fixture in scan step.

No P0/P1 security defect confirmed. TOCTOU races are explicitly accepted
for a local single-user IDE (`storage-path.cjs:11-14`,
`backend-limitations.md:111-114`) — noted, not filed.

## 5. AI Chat findings

Verified healthy (inspection):

- Provider: fixed `https://api.meta.ai/v1/chat/completions`, temp 0.2,
  90 s timeout, `redirect:'error'` so Bearer never follows off-host
  (`electron/services/ai/providers/meta-muse.provider.cjs:8-12,66-85`);
  401/403/429 mapped to user-safe hints, TypeError to connectivity hint,
  AbortError split cancel vs timeout (`:14-26,:105-123`).
- Models: allowlist derived from the Meta descriptor single source
  (`electron/services/ai/ai-config.service.cjs:8-12`), unknown IDs rejected
  with supported-values error (`:21-33`); catalog honest
  (`streaming:false`, `contextWindow:null`)
  (`meta-muse.provider.cjs:138-161`, `model-catalog.cjs:53-72,77-98`).
- Routing: explicit-only fallback with `usedFallback` reporting, never
  silent (`electron/services/ai/router.cjs:94-123`); retry at most once,
  same provider/model, transport-only, never after abort
  (`:125-162`, `ai.service.cjs:203-224`); error normalization
  (`router.cjs:25-39`).
- Chat: prompt 1–12000 chars, context sliced 20000 + redacted, history
  last 12 x 12000 chars, research context 6000 + redacted
  (`electron/services/ai/ai.service.cjs:26-30,88-160`); system prompt
  labels context untrusted and forbids false completion claims (`:32-33`).
- Sessions: per-project `.kryom/chat/` + legacy `chat.json` as `general`,
  sanitized both directions, root-bound saves with previous-root slot
  against switch races (`electron/services/ai/chat-store.cjs:28-115`).
- Renderer: model picker from backend catalog with stored-model fallback
  (`src/components/AiChat.tsx:99-108`), cancel classification, elapsed
  status, key-missing guidance; generation guards on unmount (`:309-341`).

### F-C1 (P2) Single-flight global cancel can abort a sibling tab's request

- Root cause: one module-global `activeChatController`
  (`electron/services/ai/ai.service.cjs:38,172-201`); `cancelChat` aborts
  whatever is current regardless of caller.
- Repro: open two Meta AI tabs, send in both, Stop one — the other's
  in-flight request may abort. Already disclosed as wart L3 in
  `docs/FINAL_RELEASE_REPORT.md:100-101`.
- Evidence: `ai.service.cjs:38-51,172-201`.
- Impact: cross-tab cancellation, confusing but state-safe (each tab
  classifies its own outcome).
- Smallest safe fix: post-submission, key controllers by a caller-
  supplied request id (`ai:cancel` takes `{requestId}`); reject unknown ids.
- Regression test: new `ai.service` multi-flight test (two overlapping
  mock-provider chats, cancel one, assert the other resolves).

### F-C2 (P1-docs) Live-verification contradiction (see §11 F-D1)

- `docs/API_INTEGRATION.md:76-82` says no live call was ever made, while
  `docs/backend-limitations.md:8-12` records a 2026-10-28 live smoke per
  model. One of them is stale. Must reconcile before submission; the
  endpoint/models behavior itself could NOT be verified here (no network/
  shell) and must not be claimed beyond what the owner re-runs.

## 6. Agent findings

Verified healthy (inspection):

- Planning proposes only: `planTask` gathers bounded context (8 files /
  32 KB each / 96 KB total, sensitive names excluded with reasons),
  workspace brief (120 paths, 20 KB), research context (6 KB), opt-in chat
  excerpt — then validates every model edit
  (`electron/services/agent/agent.service.cjs:293-516`,
  `context.service.cjs:22-58,88-150`).
- Edit validation: action allowlist, path inside workspace, create-vs-
  modify existence rules, 1 MB caps, per-edit reason, sha256 digest +
  length recorded for modify/delete (`agent.service.cjs:187-291`).
- Apply: caller-supplied approved set only, same-file conflict gate,
  freshness re-check vs digest (stale blocks with zero writes), rollback
  on failure with honest failure count, checkpoint write on success,
  cancel stops between edits keeping partial work
  (`agent.service.cjs:518-649+`, `src/components/AgentPanel.tsx:920-993,1087-1113`).
- Checkpoints: pre-apply bytes under `.kryom/checkpoints/`, last 10 kept,
  digest-checked undo that never clobbers newer user edits
  (`electron/services/agent/checkpoint-store.cjs:1-10,117-150+`).
- Commands are suggestions with no execution path in the agent service
  (`agent.service.cjs:77-82`); verification commands are extracted
  conservatively (fenced/run-prefixed/command-like only,
  `autonomous-run.cjs:620-671`) and run only via explicit user-confirmed
  diagnostics/terminal channels.
- Renderer: per-edit Why + diff, change-set ordering/conflict display,
  confirm dialogs for apply/run/skip/undo, stale banner with re-plan
  action (`src/components/AgentPanel.tsx:187-204,300-312,951-993,1163-1328`).

### F-G1 (P2) Single-flight global plan/apply cancel (sibling of F-C1)

- Root cause: module-global `activePlanController`/`activeApplyController`
  (`electron/services/agent/agent.service.cjs:56-75`).
- Repro: start planning in two sessions, cancel one — the other may abort.
- Evidence: `:56-75,323-356,582-606`.
- Impact: same as F-C1: confusing cross-session cancel, state-safe.
- Smallest safe fix: post-submission, key by plan/run id like F-C1.
- Regression test: multi-flight plan test with mock provider.

No P0/P1 agent defect confirmed. End-to-end apply was NOT executed here
(no shell/GUI); advertised flow is code-complete and test-backed on paper
(`agent.service.test.cjs`, `plan-store.test.cjs`, `checkpoint-store`,
`change-set`, `repair`, `autonomous-run` suites listed in `package.json:14`).

## 7. Research findings

Verified real (not placeholder), inspection:

- Providers: arXiv, OpenAlex, DuckDuckGo keyless; Crossref, Semantic
  Scholar; Tavily gated on `TAVILY_API_KEY` with key pinned to
  `api.tavily.com` (`electron/services/research/search-providers.cjs:14-20,252-460,624-656`);
  per-provider timeouts + cancel parity (`:129-168`); markup stripped at
  ingestion (`:32-46`); DOI-first canonical dedup (`:48-127`).
- Sessions: `.kryom/research/*.json` + `brief-*.md` via storage layer,
  7 visible steps, cancel/resume, bounded queries/sources/reads
  (`electron/services/research/session-store.cjs:23-150`,
  `research.service.cjs:42-57,137-250`).
- Citations: every `[n]` must resolve to `sources[n-1]` with http(s) URL;
  lookalikes in untrusted text rewritten to `(n)`
  (`electron/services/research/brief.service.cjs:16-66`); LLM failures or
  missing key fall back to extractive brief that only quotes sources
  (`:82-200+`); renderer citations become jump buttons over inert spans
  (`src/components/MarkdownLite.tsx:125-150`).
- Evidence: lexical claim lifting + independent-source corroboration +
  polarity-cue conflicts, statuses named as method (`evidence.cjs:1-7,80-150+`).
- Handoff: brief context loads bounded+redacted into chat and planning
  (`ai.service.cjs:121-160`, `agent.service.cjs:387-391,422-430`).

No P0–P2 research defect confirmed. Live search was NOT executed here;
provider behavior rests on stubbed-fetch suites
(`search-providers.test.cjs`, `url-fetch.service.test.cjs`,
`research.service.test.cjs`, `research-handoff.test.cjs`).

## 8. Workbench, editor, Git, terminal findings

Verified healthy (inspection):

- Explorer: native picker/single-file/recent-8/clone-and-open; tree capped
  2000 entries/depth 8, ignores node_modules/.git/.kryom/dist, skips
  symlinks, junction scope-guarded, unreadable dirs tolerated
  (`electron/services/workspace/workspace.service.cjs:4-11,151-200+`).
- Editor: multi-tab dirty tracking, session restore, mtime conflict dialog
  (Reload/Overwrite), Save As, Auto Save, close guard with save-all nonce
  (`electron/services/filesystem/directory.service.cjs:91-144`,
  `electron/main.cjs:380-438,493-522`); 1 MB read/write caps
  (`file.service.cjs:11,52-71`); Monaco bundled locally with same-origin
  workers (`src/utils/monaco-setup.ts:6-44`); Problems markers + F8 nav
  (`src/components/EditorPanel.tsx` marker types `:49-88`).
- Git: status/staged/unstaged/untracked parse, diff, stage/unstage (empty
  refused), discard tracked-only, commit, push, `--ff-only` pull, remotes
  with userinfo redaction, ls-remote verify, restricted clone
  (`electron/services/git/git.service.cjs:225-577,689-710+`,
  `src/components/GitPanel.tsx:20-55`).
- Terminal: one explicit `terminal:run` per command, 2000-char cap,
  120 s timeout, 100 KB output cap, scrubbed env, origin-scoped cancel,
  advisory warnings + native destructive gate
  (`electron/services/terminal/terminal.service.cjs:22-24,40-185`,
  `command-validator.cjs:6-49`, `process-manager.cjs:16-25,142-150`);
  renderer has history/draft recall, overlap ref-guard, status polling,
  xterm ANSI/scrollback/links renderer with no stdin handler
  (`src/components/TerminalPanel.tsx:53-59,76-117`,
  `src/components/terminal/XtermView.tsx:1-9,102-120`).
- Diagnostics: exit-0-without-timeout success rule, 3-format parsers,
  observed-run registry defeating forged run ids, 9-category diagnosis
  (`electron/services/diagnostics/diagnostics.service.cjs:41-115`).

### F-W1 (P2) Buffered-only terminal vs interactive expectations

- Root cause: by design `runCommand` resolves on completion; xterm is a
  transcript renderer, explicitly not a shell (`XtermView.tsx:1-9`);
  `backend-limitations.md:59-60` discloses no mid-run streaming.
- Repro: run a long command — output appears at completion; typing in
  xterm executes nothing.
- Evidence: `terminal.service.cjs:64-185`; `XtermView.tsx:1-9`.
- Impact: judges expecting a pty (Cursor/VS Code style) will notice;
  docs/smoke are honest, so this is a positioning risk, not a bug.
- Smallest safe fix: none before submission; pitch as "reviewed one-shot
  execution" and keep SMOKE 5/5b/5c in the demo.
- Regression test: existing `terminal.service.test.cjs` timeout/cancel/
  cap cases must stay green.

### F-W2 (P3) User-profile-is-a-git-repo environment note

- Root cause: `C:\Users\LENOVO` is itself a git repo on the owner machine
  (`docs/backend-limitations.md:85-88`); ancestor discovery then reports
  membership for every folder.
- Impact: demo confusion (wrong toplevel/branch in Git panel) if the
  smoke project sits under the profile.
- Smallest safe fix: before demo, verify dotfiles-intent; run the smoke
  project from a path outside any repo (SMOKE setup already uses
  `Documents\kryom-smoke` — confirm it is not under the profile repo).
- Regression test: `git-privacy.test.cjs` + manual SMOKE 17.

## 9. Memory, settings, extensions findings

Verified healthy (inspection):

- Memory: one JSON per record under `.kryom/memory/`, atomic writes,
  re-validated ids/shapes, service-captured digests, per-source staleness
  (`electron/services/memory/memory.store.cjs:1-12,84-200+`); IPC
  validates kind/file/research/commit specs, store re-validates
  (`electron/ipc/memory.ipc.cjs:26-100+`); project isolation via
  workspace root; export/delete-all behind dialogs (SMOKE 21/22).
- Settings: preferences only, model ids from descriptor single source,
  panel-size sanity bounds, sanitize-on-read
  (`electron/services/settings/settings.service.cjs:10-93,95-144`).
- Extensions: strict manifest, registry, disabled-by-default lifecycle,
  vm + worker isolation, permission membrane
  (see §4 list); SDK + `examples/hello-command` present per README.
- Skills/workflows/templates/integrations: tool-catalog binding, grant +
  approval gates, explicit transitions, traversal-proof generation,
  local-git adapter with no tokens (sampled:
  `skill-runner.cjs:85,156`, `workflow-engine.cjs:453,601`,
  `template-engine.cjs:3`, `github.adapter` registry tests).

No P0–P2 finding in this area. Import/export paths are dialog-gated and
bounded; `provider:set-key` travels renderer→main only and never echoes
(`electron/ipc/platform.ipc.cjs:155-176`).

## 10. Testing and CI findings

Design verified (inspection; NOTHING executed here):

- Backend: explicit 70+ file `node:test` manifest in `package.json:14`
  with a fail-on-drift gate (`scripts/check-test-manifest.cjs:1-53`),
  syntax gate, workbench-state gate, wiring net
  (`electron/wiring.test.cjs:12-150`), IPC unauthorized sweep +
  end-to-end flows (`electron/ipc/ipc.integration.test.cjs`), security
  suites (`security.test.cjs`, `git-privacy`, `terminal-boundary`,
  `permissions`), per-domain suites for ai/agent/research/git/terminal/
  memory/settings/extensions/skills/workflows/templates/integrations/
  quality/planning/specialists/orchestration/update/diagnostics.
- Renderer: vitest + jsdom harness (`vitest.config.ts:9-17`,
  `src/test/setup.ts`), 32 test files enumerated by search
  (`AiChat`, `AgentWorkspace`, `MarkdownLite`, `ResearchPanel`,
  `XtermView`, `clipboard`, `theme`, etc.).
- CI: 3-OS matrix (win/mac/ubuntu, Node 22), `npm ci` → test → syntax →
  manifest → workbench → typecheck → secret scan → audit → build, plus
  per-OS pack + bundle verification (`.github/workflows/ci.yml:9-137`).

### F-T1 (P1) Current-tree verification status unknown; last green is stale

- Root cause: ~105 uncommitted paths (as briefed) postdate the last
  executed green run (2026-10-30 per README/TESTING/FINAL_RELEASE).
- Repro: compare brief baseline vs `docs/TESTING.md:18-40` and
  `docs/FINAL_RELEASE_REPORT.md:103-115`; no shell here to re-run.
- Evidence: `README.md:49-54`; `docs/TESTING.md:18-40,69-84`;
  `package.json:14` manifest.
- Impact: submission cannot honestly claim green on the current tree
  until the owner re-runs the gates.
- Smallest safe fix: on the owner machine, run in order: `npm test`,
  `npm run test:renderer`, `npx tsc -b`, `check:syntax`,
  `check:test-manifest`, `check:workbench`, `build`, `pack`,
  `check:release`, `dist`, `npm audit --omit=dev`; record results +
  date in TESTING.md/backend-limitations.
- Regression test: the gates themselves; no code change.

### F-T2 (P2) Renderer test-count docs stale (8/8 vs 32 files)

- Root cause: `docs/TESTING.md` and `FINAL_RELEASE_REPORT.md` freeze the
  DOM suite at its 8-file birth (F14); 24+ files were added after.
- Repro: search `src/**` for `from 'vitest'` → 32 files (list in §13).
- Evidence: `docs/TESTING.md:79-80` (`test:renderer → 8/8`);
  `docs/FINAL_RELEASE_REPORT.md:110-111`; search output §13.
- Impact: judges counting files will spot the drift; also unclear which
  count the owner last executed.
- Smallest safe fix: update TESTING.md/FINAL_RELEASE_REPORT counts after
  the F-T1 re-run (file count + test count, e.g. `vitest run` summary).
- Regression test: none (docs); optionally add a renderer-manifest echo
  to CI logs.

### F-T3 (P2) Backend test-count drift across docs (69 vs 70 vs 71)

- Root cause: README says 71 files, TESTING says 69 then 70, manifest
  gate is the only runtime truth.
- Evidence: `README.md:41-42`; `docs/TESTING.md:23,44,61,80-81`.
- Impact: same as F-T2 — minor credibility nick.
- Smallest safe fix: after F-T1, set all three docs to the manifest
  gate's printed `N test file(s) on disk` number.
- Regression test: `check:test-manifest` itself.

## 11. UI/UX and documentation findings

UI/UX (inspection only — NO live GUI verification was possible):

- Themes: `dark` default, OS-prefers-light first-run, `data-theme` attr +
  `theme-color` sync (`src/utils/theme.ts:1-73`); Monaco `kryom-dark/light`
  registered before mount (`src/utils/monaco-setup.ts:40-44`); xterm
  resolves live CSS vars with fallbacks
  (`src/components/terminal/XtermView.tsx:50-87`).
- Panels: bottom/stage hide with `hidden` so runs survive (App.tsx
  comment); clamps for left/bottom/aside/font/terminal-font
  (`src/app/App.tsx:122-172`); dock persistence + crash recovery + safe-
  focus danger dialogs per FINAL_RELEASE_REPORT §5.
- Chat/Agent/Research: suggestion chips, per-block Send-to-Agent, Why +
  diff review, change-set ordering, citation jump buttons, export/docx,
  handoffs Ask/Implement — all wired to approved backend channels.
- States/copy: empty/loading/error states sampled in Git/Research/AiChat
  panels; single guarded `copyText` helper used by all Copy buttons;
  long code blocks collapse (MarkdownLite); output caps/truncation
  surfaced honestly (exit code/timed-out/truncated/cancelled lines).
- A11y/keyboard: focus-trap dialogs, roving tabindex, aria labels,
  Shortcuts dialog, F8 marker nav, reduced-motion terminal jumps
  (FINAL_RELEASE_REPORT §5 + sampled aria/title props).

### F-U1 (P1-presentation) No verified screenshots or demo recording

- Root cause: honestly documented gap (`README.md:69-76`).
- Evidence: README gives capture instructions but links no images.
- Impact: hackathon judges score presentation; text-only submission
  undersells a working desktop app.
- Smallest safe fix: follow the 5-min Demo flow (`README.md:558-578`)
  on the disposable smoke project; capture welcome + chat/agent/research
  + diff-apply + verification; save under `docs/images/`; reference from
  README; optionally record one continuous take.
- Regression test: manual SMOKE 1–49 before each release.

### F-D1 (P1) API_INTEGRATION vs backend-limitations live-call contradiction

- Root cause: `docs/API_INTEGRATION.md:76-82` ("No live Meta API call has
  been made") was not updated after the 2026-10-28 smoke recorded in
  `docs/backend-limitations.md:8-12` (both models, exact marker, timings).
- Repro: read the two sections side by side.
- Evidence: the two cited ranges.
- Impact: judges will catch the direct contradiction on the core
  Meta-integration claim.
- Smallest safe fix: rewrite API_INTEGRATION §Verification status to
  point at backend-limitations as truth (or vice versa after a fresh
  re-run); include date, prompt, per-model latency, and tester.
- Regression test: none (docs); keep one canonical verification log.

### F-D2 (P1) SECURITY.md navigation sentence contradicts the code

- Root cause: `docs/SECURITY.md:45-46` says navigation is "limited to
  the dev server origin and `file:` URLs" — but the code denies `file:`
  URLs and uses `kryom://app` (`electron/main.cjs:550-566`,
  `renderer-urls.cjs`, `protocol-handler.cjs`). `ARCHITECTURE.md:32-35`
  repeats the stale wording and also says 13 IPC modules vs the actual
  15 in `register-handlers.cjs:1-16`.
- Evidence: cited lines.
- Impact: security-doc inaccuracy on a headline control.
- Smallest safe fix: change both docs to "exact dev origin in dev, only
  the `kryom://app/index.html` entry in prod; `file:` denied; no
  subframes"; fix module count to 15.
- Regression test: `security.test.cjs` navigation/protocol cases already
  encode the truth — cite them.

### F-D3 (P3) README/TESTING count drift (covered by F-T2/F-T3)

- Folded here for the docs checklist: backend 69/70/71 and renderer 8/8
  vs 32 files. Fix together with F-T1 re-run.

Docs verified accurate: install/dev/pack/dist commands
(`README.md:404-430,492-523` match `package.json:10-27`); supported-
platform matrix honest (Windows validated, mac/Linux configured-only:
`README.md:387-402`, `docs/PLATFORM_SUPPORT.md:1-17`); env/secret rules
(`README.md:432-474` match vault/allowlist/gitignore/builder exclusions);
feature claims sampled (chat caps, agent approval+rollback+checkpoints,
research citations+extractive fallback, git ff-only, diagnostics
categories) all trace to cited implementations; `CHANGELOG.md:1-7`
Unreleased framing is correct for the dirty tree.

## 12. Competitor comparison (code-grounded, external claims marked)

Scope note: KryomCode side is file-evidence; competitor side is general
product knowledge, marked UNVERIFIED (no live comparison run here).

| Dimension | KryomCode (evidence) | Cursor/Windsurf/Copilot/Codex/Claude-Code/Antigravity (UNVERIFIED) | Assessment |
|---|---|---|---|
| Research-to-code | Real providers + cited briefs + Implement-from-Research handoff (`research.service`, `brief.service`, `agent.service:387-391`) | Browser tabs or chat-only research; handoff usually copy/paste | GENUINE differentiator |
| Evidence/citations | `[n]` fail-closed validation + extractive fallback + lexical verification (`brief.service:36-66,82+`, `evidence.cjs`) | Citations often best-effort, rarely validated | GENUINE differentiator |
| Multi-file agent | 20-edit plans, Why+diff review, change-set ordering, same-file conflict gate (`agent.service`, `change-set`, AgentPanel) | Common in Cursor/Windsurf/Codex; KryomCode matches, review UX is explicit | PARITY with strong review |
| Verification/approval | Per-edit approval, freshness digests, rollback, checkpoints+undo, observed-run reports, native destructive gate (`agent.service:518+`, `checkpoint-store`, `diagnostics`, `approval.cjs`) | Approval exists elsewhere; checkpoint+undo+observed-run honesty is unusually thorough | GENUINE differentiator (depth) |
| Meta AI integration | First-class Meta provider, 2-model allowlist, explicit routing (`meta-muse.provider`, `router`, `model-catalog`) | Meta models are rare as a first-class IDE provider | GENUINE differentiator for a Meta hackathon |
| Desktop IDE | Electron + Monaco + xterm transcript + Git + Problems (`main.cjs`, `monaco-setup`, `XtermView`, `GitPanel`) | Full pty + extensions marketplace elsewhere; KryomCode terminal is one-shot, extensions local-only | GAP: pitch surrounding workflow, not terminal parity |

Unsupported-marketing check: README/docs make no invented-percentage,
no silent-capability, and no cross-platform-validation claims — the
honest-limits tone (`PLATFORM_SUPPORT.md`, `backend-limitations.md`,
`FINAL_RELEASE_REPORT.md` residuals) is itself a credibility asset.
Do NOT claim: live Meta verification beyond the reconciled log (F-D1),
green current tree before F-T1 re-run, macOS/Linux validation, pty
terminal, streaming chat, marketplace extensions, or auto-update.

## 13. Evidence index (exact paths per finding)

- F-A1/A2: `src/app/App.tsx`, `src/components/*.tsx` disables (search).
- F-S1: `electron/main.cjs:529-533`, `electron/security/permissions.cjs`.
- F-S2: `electron/services/research/url-fetch.service.cjs:485-532`,
  `docs/backend-limitations.md:107-110`.
- F-S3: `.github/workflows/ci.yml:47-63`.
- F-C1: `electron/services/ai/ai.service.cjs:38-51,172-201`,
  `docs/FINAL_RELEASE_REPORT.md:100-101`.
- F-C2/F-D1: `docs/API_INTEGRATION.md:76-82`,
  `docs/backend-limitations.md:8-12`.
- F-G1: `electron/services/agent/agent.service.cjs:56-75,323-356,582-606`.
- F-W1: `electron/services/terminal/terminal.service.cjs:64-185`,
  `src/components/terminal/XtermView.tsx:1-9`,
  `docs/backend-limitations.md:59-60`.
- F-W2: `docs/backend-limitations.md:85-88`.
- F-T1: `README.md:49-54`, `docs/TESTING.md:18-40,69-84`, `package.json:14`.
- F-T2: renderer vitest files (32): AgentConsole, AgentWorkspace, AiChat,
  ChatSessions, Chrome, CommandPalette, Composer, DebugConsolePanel,
  dialogs, ErrorBoundary, GitPanel, HomeHero, MarkdownLite,
  MetaAIWorkspace, OutputPanel, PhaseAShell, ProblemsPanel, ResearchPanel,
  SettingsModal, ShortcutsDialog, TasksPanel, XtermView, TerminalPanel,
  WelcomePage tests + thread-index, scroll-containers, theme-tokens,
  bottom-tabs, clipboard, diff, monaco-themes, theme tests.
- F-T3: `README.md:41-42`, `docs/TESTING.md:23,44,61,80-81`.
- F-U1: `README.md:69-76,558-578`, `docs/SMOKE_TEST.md:1-104`.
- F-D2: `docs/SECURITY.md:45-46`, `docs/ARCHITECTURE.md:32-43`,
  `electron/main.cjs:550-566`, `electron/ipc/register-handlers.cjs:1-16`.

## 14. Severity summary

- P0 (critical security/data-loss): NONE confirmed.
- P1 (submission-blocking): F-T1 (stale verification), F-D1 (Meta
  verification contradiction), F-D2 (security-nav docs contradiction),
  F-U1 (no screenshots/demo).
- P2 (important): F-S1 (permission origin check), F-C1/F-G1
  (single-flight cancel), F-W1 (buffered terminal positioning), F-T2/F-T3
  (test-count drift).
- P3 (minor/debt): F-A1 (App.tsx size), F-A2 (hook disables, no lint),
  F-S2 (undici fallback, documented), F-S3 (narrow secret scan), F-W2
  (profile-repo env note), F-D3 (folded counts).

## 15. Prioritized remediation plan (owner machine, in order)

1. F-T1: re-run full gate chain on the CURRENT tree; record date+counts
   in TESTING.md + backend-limitations. (~1–2 h incl. pack/dist.)
2. F-D1 + F-D2: fix the three doc contradictions (30 min, no code).
3. F-U1: run SMOKE demo flow, capture screenshots + one recording (1 h).
4. F-T2/F-T3: sync test counts to the fresh run output (15 min).
5. F-W2: confirm smoke project sits outside the profile git repo (10 min).
6. Submit. Defer F-S1/F-C1/F-G1/F-S2/F-S3/F-A1/F-A2 to post-hackathon
   (all documented, none submission-blocking).

## 16. Hackathon submission readiness verdict: READY-WITH-FIXES

The code is submission-grade (8.0/10): real Meta integration, real
research with validated citations, approval-gated multi-file agent with
checkpoints, hardened Electron boundaries, and honest docs. But the
current tree is unverified (105 uncommitted paths), two doc
contradictions and stale test counts will be spotted by judges, and
there are no screenshots or demo assets. Complete remediation steps
1–5 above, then submit with the reconciled verification log. Do NOT
claim live behavior beyond what the owner re-runs.

STOP: audit complete. No fixes applied. Awaiting approval before any
remediation work.
