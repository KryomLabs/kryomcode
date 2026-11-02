# KryomCode Backend Limitations (Phase 1)

Explicitly known limits after the Phase 1 backend gate. All items below
are verified statements, not guesses.

## Verification status

- Live Meta API smoke tests passed on 2026-10-28 (one request per
  model, prompt "Reply with exactly: KRYOMCODE_OK"): muse-spark-1.3
  answered in ~4.1 s and muse-wonder-1.0 in ~2.5 s. Both returned the
  exact marker with the expected model echo. No retries were needed.
  Responses are not persisted to chat history by the smoke path.
- Update 2026-11-02: re-verified on the current tree (one exact-marker
  request per model, both passed: muse-spark-1.3 ~2.9 s, muse-wonder-1.0
  ~7.1 s); see docs/META_LIVE_VERIFICATION.md. The 2026-10-28 record
  above stands as the earlier baseline.
- Electron was not launched live in this headless session. `npm run build`
  (tsc + Vite) passes; dev/prod startup needs a manual run.
- Level 1 gate (2026-10-29): Monaco is bundled locally
  (`monaco-editor` declared in `package.json`, loader configured in
  `src/utils/monaco-setup.ts`). Verified statically only: `npm run
  build` passes, `dist/` contains all five language workers plus the
  codicon font and editor CSS with relative references, the built
  `index.html` CSP allows no remote hosts, and the loader source was
  read to confirm the configured instance bypasses its CDN default.
  The live offline-editor check was NOT run; see
  [SMOKE_TEST.md](SMOKE_TEST.md).
- The production `dist/` fallback in `loadApp` is implemented but
  unexecuted.
- Phase 3 (2026-10-27): `npm run pack` produced
  `release/win-unpacked/KryomCode.exe` and `npm run dist` produced the
  unsigned NSIS installer `release/KryomCode Setup 0.1.0.exe` (default
  Electron icon, no signing certificate). The packaged asar was
  verified to contain `dist/index.html`, `electron/main.cjs`,
  `electron/preload.cjs`, and `dotenv`, with no `.env` or test files.
  Neither the unpacked app nor the installer has been launched or
  installed yet; that remains a manual check.
- Final milestone (2026-10-30): all 7 pre-existing test failures fixed
  by root cause (F1–F5), P1 critical slice enforced (native approval
  for destructive terminal/diagnostics commands), renderer harness
  added. Verified by execution: 632 backend + 8 renderer tests pass,
  tsc/build/pack/dist green, audit and secret scan clean. Only the
  running-app GUI walkthrough still needs a display session.
  See [FINAL_COMPREHENSIVE_AUDIT.md](FINAL_COMPREHENSIVE_AUDIT.md) and
  [FINAL_RELEASE_REPORT.md](FINAL_RELEASE_REPORT.md).

## Approval and autonomy boundaries

- Terminal execution requires one explicit `terminal:run` call per command.
  Destructive-pattern commands additionally face a native main-process
  approval dialog (`electron/ipc/approval.cjs`, shared with
  `diagnostics:run`) that the renderer cannot skip. Command warnings
  remain advisory metadata, never a safety verdict: no warnings does
  NOT mean safe.
- Agent plans never execute. `agent:apply` writes only the edits passed in
  by the caller after re-validating every path. Commands in a plan are
  suggestions and have no execution path in the agent service.
- Git commit and push are separate explicit channels. Push uses ambient
  git credentials; KryomCode never handles, stores, or transmits them.

## Operational limits

- Terminal results arrive on completion; mid-run output streaming is not
  exposed. Cancellation kills running processes via `terminal:cancel`.
- Agent planning is bounded by the 90 s provider timeout. Cancel
  (`agent:cancel`) aborts in-flight planning or stops an apply
  between edits, keeping completed work plus a checkpoint; full
  failures still roll back.
- Diagnostics parsers cover TypeScript, generic file:line:col, and Node
  stack formats only. Unknown formats yield zero diagnostics, never fake
  ones, and `success` still reflects the real exit code.
- File tree, search, and intelligence indexes are bounded (2000 entries,
  depth 8, result caps) and report truncation instead of silently cutting.
- The UI edits multiple files in tabs; files are capped at 1 MB.

## Phase 3 cleanup record

The 0-byte scaffold files listed here in Phase 1 were re-verified as
unreferenced (no imports anywhere in `electron/` or `src/`) and removed
during Phase 3, along with the empty `src/features/`, `tests/`,
`public/assets/`, and `public/icons/` directory trees and the empty root
`.prettierrc.json` / `eslint.config.js` (no Prettier or ESLint
dependency exists). `.editorconfig` was filled with real content.
`tsconfig.tsbuildinfo` was removed from version control. A secret scan
found no hardcoded keys (only `test-key` fixtures and env plumbing).

## Environment note

`C:\Users\LENOVO` (the user profile) is itself a git repository on this
machine. Verify whether that is intentional (dotfiles) or a stray init:
every folder currently reports git membership through ancestor discovery.

## Backend audit sprint (2026-10-28, uncommitted, headless)

Implemented without runtime verification (no shell: `npm test`,
`check:syntax`, and `build` could not run here): fixed a
citation-index off-by-one in findings rendering (backend indexes
are 1-based); bounded research page reads (streaming cap,
content-length guard, redirect re-validation); Windows
process-tree kill for terminal/Git timeouts and cancels
(`taskkill /T /F` with fallback); junction/scope guards plus
unreadable-directory tolerance in tree, search, and index
walkers; Tavily cancel/timeout message parity; honest agent
rollback reporting; real `ai:cancel` / `agent:cancel` abort
paths with Stop buttons; per-project chat persistence
(`.kryom/chat.json`, sanitized, corrupt-safe). New unit
coverage: url-fetch suite, chat-store suite, kill-tree tests,
scope-guard tests, cancel tests, MockProvider abort support.
Still manual-only: TESTING.md checks 1–12.

Known residual risks: DNS-rebinding SSRF on the undici-missing
fallback path only (the normal path validates every DNS answer and
pins the connection to the validated addresses via an undici Agent;
see `electron/services/research/url-fetch.service.cjs`); TOCTOU
between path validation and
use (accepted for a local single-user IDE). Fixed 2026-10-30
(Level 2B.2): the chat save/restore micro-race is closed by
root-bound saves, a previous-root slot, and a renderer stash.

Deferred (documented, not implemented): chat streaming (needs
provider SSE plus IPC push events); research session
rename/delete (no product UI needs them); per-window workspace
isolation (New Window stays disabled). Mid-apply cancel shipped in
2B.4 (`agent:cancel` stops between edits, keeps partial work plus
a checkpoint).

## UI/UX maturity sprint (2026-10-28, uncommitted)

Implemented but not yet runtime-verified in this headless session (no
shell, no Electron launch): window close guard with save-all nonce
settlement, Monaco marker mapping, `git:unstage` / `git:discard`
channels, `app:open-external` URL validation, research
findings/evidence rendering, dependency-free chat/brief rendering,
AI key pre-flight, terminal history, tab keyboard navigation, and
the Keyboard Shortcuts dialog. New unit coverage: unstage/discard
service tests and external-URL guard tests. Still manual-only:
TESTING.md checks 1–6 plus close-with-dirty-tabs, source opening,
and marker navigation.
