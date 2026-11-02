# KryomCode Changelog

All notable changes to this project. Dates use UTC. Entries follow the
repository history; the Unreleased section describes the current
working tree, which has not been committed yet.

## Unreleased

### Added

- Milestone 1 Advanced AI Chat: model picker driven by the
  backend catalog (single-source model ids shared by chat,
  settings, and the provider registry), one safe transport-only
  retry, secret redaction of auto-attached context, full-text
  conversation search, classified errors with Retry and provider
  recovery actions, live elapsed request status with Esc to stop,
  contextual suggestion chips, dependency-free code highlighting
  with long-block collapsing, per-block Send to Agent (reviewed
  in the approval-gated agent flow), clickable attachment chips,
  Explain selection from the editor and Ask AI from Problems
  (both land as home-chat prompts), and a compact professional
  chat restyle for both themes.
- Production release engineering: dev/preview/production
  environment detection with a baked release channel,
  packaged-build `.env` skip, log levels, a user-visible
  fatal startup dialog, crash-handler error recording,
  production DevTools + permission policies, and startup
  timing (roadmap 4B.1).
- Cross-platform compatibility: a central OS adapter,
  shell-free executable lookup, POSIX detached spawn with
  process-group tree termination (Windows taskkill
  unchanged), and mac/linux packaging targets. Code paths
  exist for all three OSs; runtime validation stays
  Windows-only until owner hardware runs the matrix
  (roadmap 4B.2).
- Update architecture: strict https feed schema, semver +
  channel + platform gating, sha512-verified staged
  downloads with progress and cancellation, and
  rollback-by-default (failures clear staging; the
  running install is never modified). New PLATFORM →
  Updates tab; feed URL, signing, and icons remain
  documented owner prerequisites (roadmap 4B.3).
- Extension process isolation: each active extension now
  runs in a dedicated child process (utilityProcess in
  production, fork under plain Node) with per-request
  timeouts, a sampled memory cap, validated messaging,
  and crash recovery. Lifecycle inputs/outputs are
  unchanged; arbitrary hostile extensions remain
  explicitly out of the supported threat model (roadmap
  4B.4).
- User-controlled diagnostics: Help → Export Diagnostics
  previews a redacted bundle (versions, platform, status
  counts, `~` paths, error one-liners) and writes a
  user-chosen local file. Nothing uploads (roadmap
  4B.11).
- Localization architecture: typed English string table,
  stored-preference → navigator → `en` fallback,
  Settings language row, and Intl helpers. New UI uses
  it; other locales are pending translators, not
  machine-filled (roadmap 4B.7).
- Accessibility: shared dialog focus-trap hook (used by
  the new dialogs) and reduced-motion terminal scrolling
  (roadmap 4B.7).
- Open-source readiness: `SECURITY.md`, `PRIVACY.md`,
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue/PR
  templates, threat-model + security-architecture +
  install/dev/build/release/troubleshoot/platform/
  privacy/FAQ/dependency docs, and a manual-dispatch
  release workflow (roadmap 4B.4–4B.6, 4B.9–4B.10).
- Deep project intelligence: a persistent fingerprinted code
  index (incremental refresh, staleness reporting, budgeted
  ranked context), a JS/TS symbol/reference index, deterministic
  semantic project search with explained scores, relative-import
  impact analysis with quoted evidence, and evidence-backed
  architecture analysis. Nine read-only `intelligence:*`
  channels; nothing is uploaded to providers by default and stale
  entries are reported, never silently used (roadmap 3C.1).
- Intelligent implementation planning: natural-language
  requirements become validated decompositions (files,
  dependencies, verification, completion) with topological
  ordering, parallel-wave analysis, shared-file sequencing, and
  qualitative risks, persisted as plan-store v2 records.
  Revisions create a new linked record and preserve completed
  work; approved plans are never silently rewritten (roadmap
  3C.2).
- Specialist agents: research, coding (proposes only — approval
  and apply still own the disk), testing, debugging, security
  review, and independent review share one runner with structured
  I/O, per-run timeout/cancel, detached start, and persisted
  records under `.kryom/specialists/`. Meta AI stays
  first-class; tests inject the mock provider (roadmap 3C.3).
- Controlled multi-agent orchestration: runs start from
  approved plans only, tasks declare owned files (overlapping
  scopes without an ordering edge are rejected at start),
  proposals generate in parallel (max 2) while merges stay
  strictly sequential through ownership checks, change-set
  analysis, and the guarded apply path. Every task needs an
  explicit approval; conflicts, overreach, and staleness stop
  the merge with zero writes; retries are budgeted and history
  is preserved (roadmap 3C.4).
- Advanced quality intelligence: computed regression analysis
  (changed files, affected modules, related tests, new vs
  existing failures), test suggestions for uncovered changed
  symbols, a deterministic security pattern scan with quoted
  evidence and confirmed-vs-potential confidence, observed-only
  performance notes, and persisted reports with an explainable
  verdict — no invented percentages (roadmap 3C.5).
- INTEL center-stage tab (`IntelligenceHub`): search/impact/
  architecture, planning with revision, specialist runs,
  orchestration runs with per-task approval, and quality
  reports — mounted alongside Chat/Agent/Research with the
  same design system and no duplicated interfaces.
- Stable AI provider platform: a descriptor contract with a
  deterministic registry (duplicate registration rejected),
  an honest model catalog (capabilities, context limits, and
  availability unknown until confirmed — never invented),
  centralized routing with explicit-only fallback (never
  silent switching), and selection-only configuration whose
  secrets stay in the environment allowlist and never cross
  IPC. Meta AI remains first-class with its existing
  configuration untouched (roadmap 4A.1).
- Secure extension system: strict `kryom-extension.json`
  manifest validation, an install registry that keeps new
  extensions disabled by default, a vm-sandboxed runtime
  (no Node globals, no direct fs/shell/network, JSON-only
  membrane, activation and handler timeouts, crash
  isolation), a 10-step install→uninstall lifecycle with
  startup recovery and corrupt-install detection, and
  declared command contributions. Local folders only — no
  marketplace, no remote registry, no auto-activation
  (roadmap 4A.2).
- Skills and workflows: validated reusable skill
  definitions bound to a fixed tool catalog with
  permission mapping (gated tools require explicit
  approval), plus a versioned workflow engine with
  explicit advance/approve/resume/cancel, bounded
  retries, and persisted run history — reusing the
  Level 3C planning, specialist, and agent services
  rather than duplicating them. Ships 4 builtin skills
  and 5 builtin workflows (roadmap 4A.3).
- Integrations platform: a shared adapter contract
  (identity, auth kinds, capabilities, error
  normalization, lifecycle) with a local-git GitHub
  adapter covering repositories, branches, remotes, and
  history. PRs and issues are explicitly unsupported;
  tokens never reach the renderer, logs, or AI context
  (roadmap 4A.4).
- Project templates: validated template manifests with
  preview-before-confirm generation, path-traversal
  rejection, atomic staging for new directories, and
  setup commands returned as instructions that are never
  executed. Ships 3 tested starters (basic-web,
  node-typescript, react-vite); existing files require
  explicit overwrite confirmation (roadmap 4A.5).
- Developer API and SDK: a versioned public API contract
  service with compatibility checks, a TypeScript SDK
  (`sdk/kryom.d.ts` + usage guide), and a working
  `hello-command` example extension (roadmap 4A.6).
- Permissions and trust platform: 12 granular
  permissions with no wildcard, explicit user grants,
  trust levels that never auto-grant, enforcement at
  the execution boundary (not just the renderer), and
  a secret-free audit log of installs, grants,
  connections, and workflow runs (roadmap 4A.7).
- PLATFORM center-stage tab (`PlatformHub`): Providers,
  Extensions, Skills, Workflows, Integrations,
  Templates, and Perms views over 51 new IPC channels —
  same design system as the rest of the app, no
  redesign, no fake listings (roadmap 4A.8).
- Integrated workflow hardening: `applyEdits` refuses same-file
  duplicate batches with zero writes (structured `conflicts`,
  listed in the UI like stale findings); repair attempts apply
  in change-set dependency order with conflict and
  delete-dependent blockers returning to awaiting-approval
  unconsumed; `recordRepair` rejects cancelled and timed-out
  runs so verdict-less checks never consume an attempt; the
  agent verification section gains a Stop button with
  cancelled/timeout wording distinct from failed; and the
  context snapshot view warns when the research session did not
  complete. Existing guards (approval, freshness, checkpoints,
  rollback, budgets) are reused untouched (roadmap 3B.7).
- Dependency-aware change sets: a read-only analyzer builds a
  versioned manifest over each approved edit batch (JS/TS import
  graph, per-file fingerprints, resolved/unresolved/unknown/
  external edges, cycles, same-file conflicts, review groups, a
  dependencies-first order, and whole-set validation). The agent
  panel shows the manifest at review, disables Apply on blockers,
  revalidates against the review-time baseline before the confirm
  dialog (changed dependencies warn), applies in manifest order,
  and records the order as apply-step note evidence. Approval,
  containment, freshness, checkpoints, undo, rollback,
  cancellation, and repair budgets are reused untouched; the
  repair flow and verification semantics are unchanged (roadmap
  3B.6).
- Truthful verification reports: every report separates
  execution facts (observed-run registry: command, timestamps,
  duration, exit code, cancelled/timed-out, source), observed
  evidence (redacted output excerpt, persisted diagnosis, repair
  checkpoint id + changed files), display-only model
  explanations (bounded, redacted, never consulted for status),
  and unverified claims (stated reasons, legacy provenance).
  Conclusions (`passed/failed/cancelled/timed_out/blocked/
  skipped/not_executed`) derive from observed facts only;
  contradicting claims, exit-code/timeout mismatches, and
  unknown run ids are rejected without persisting, repair
  linkage stays server-derived, and stored conclusions are
  re-derived on load. Plan-level state is conclusion-based
  (only executed failures fail a plan). The agent panel shows
  Status prominently with Executed / Observed-evidence /
  Model-explanation / unverified-claim sections, per-finding
  lines, and repair checkpoint/changed-files (see `docs/PLANS.md`,
  roadmap 3B.5).
- Bounded backend repair cycles: the renderer retry loop moved
  server-side with a 2-attempt cap, a fixed 10-minute budget
  (aborts the model call, never resets), a per-cycle mutex so
  racing cancels win deterministically, and every attempt
  persisted as a linked verification report with 8 terminal
  states and stored reasons. Approval stays review-first
  (explicit apply/deny), freshness/checkpoint/undo protections
  reused, interrupted cycles cancel-only. Six
  `agent:repair-*` channels; the agent panel shows cycle
  state, attempts, elapsed/budget, changed files, and stop
  reason, and the cycle id survives reload.
- Structured test diagnosis: every verification run is
  classified into nine failure categories with runner
  detection, confidence labels, and quoted file/line/test
  evidence (stable finding ids, redacted bounded excerpts,
  `executed` provenance; cancelled/timed-out runs never
  pass). The diagnosis persists on the verification report
  (re-validated at the boundary, legacy reports unaffected)
  and the agent panel shows the execution summary, findings,
  and report linkage while feeding the structured diagnosis
  into the repair prompt. No automatic repair.
- Stale-file detection and change awareness: a read-only
  freshness service re-validates every referenced file
  immediately before apply (current/stale/missing/
  inaccessible/unverified, digest-pinned, traversal
  fail-closed); a blocked batch returns structured `stale[]`
  findings with zero writes and no checkpoint, the agent panel
  lists each changed file with its reason, the plan and its
  evidence are preserved, re-plan is offered, and the tracked
  apply step is marked `blocked`. The per-edit digest check
  remains as a race backstop.
- Chat/research context grounding: planning records a
  provenance-labelled snapshot of exactly what the model received
  (file digests, research brief version, opt-in chat excerpt,
  workspace brief), persisted on the plan with freshness
  re-checks; sources are preserved as review evidence without
  ever counting as verification. New `agent:chat-excerpt`
  preview; agent panel shows attached-context provenance with
  stale/missing warnings.
- Evidence-based execution plans: proposals are tracked as schema-v2
  records under `.kryom/plans/` with risks, expected outcomes,
  enforced step states, evidence links, and persisted verification
  reports (a step verifies only with a passing report attached;
  interrupted steps are flagged, never silently completed). New
  `agent:plan-*` channels; the agent panel shows outcome/risks,
  progress, evidence, and reports while keeping existing approvals
  (see `docs/PLANS.md`).
- Memory privacy controls: JSON export of validated records only
  (documented `kryom-memory-export` v1, save-dialog destination,
  atomic write, cancellation handled) and bulk delete-all with
  danger confirmation, per-file failure reporting, and
  chat/checkpoint/research preservation (new
  `memory:export`/`memory:delete-all` channels, MemoryPanel
  Export/Delete-all controls). `.kryom` Git audit: nothing tracked
  at HEAD or origin since the owner's `f0d4f1d` untracking commit;
  removed blobs re-audited secret-free; new `git-privacy.test.cjs`
  fails the suite if `.kryom/` becomes tracked or the ignore rule
  is lost (see `docs/MEMORY.md`, roadmap Appendix A).
- Structured project memory: typed records (decision/convention/
  fact) with service-captured provenance (file digest, chat digest,
  research brief version, verified commit SHA) and per-source
  stale/unverified reporting, stored one JSON file per record under
  `.kryom/memory/` (new `electron/services/memory/`, `memory:*`
  IPC channels, Memory sidebar view with edit and confirmed
  delete; see `docs/MEMORY.md`).
- Headless IPC integration tests
  (`electron/ipc/ipc.integration.test.cjs`, 20 tests): the real
  64-channel handler tree runs against a stubbed Electron module
  and stubbed windows, covering trust guards, sender-frame
  validation, dialog flows, malformed input, service-error
  propagation, and cancellation honesty with no network or Meta
  API calls. Release-contents check extended (extraResources
  docs, inclusion config, Monaco/bundle asar assets, `.kryom` /
  sourcemap / key-material prohibitions).
- Error taxonomy (`docs/ERROR_TAXONOMY.md`): coded-error catalog,
  IPC message contract, user-message conventions, and pinned
  renderer wording. Audit fixes bound all git tool-output detail
  to 2000 chars and Meta server error detail to 500 chars (new
  `boundDetail` helper); tests pin the bounds and the exact
  write-conflict message.
- Command confirmations: warning-bearing terminal/diagnostics
  commands ask for explicit approval before running (new
  `terminal:classify` pre-scan channel), plus a Settings toggle to
  confirm every command (`confirmAllCommands`, default off).
- Reliable cancellation: terminal/diagnostics results report
  `cancelled` distinctly from failure and timeout; new `git:cancel`
  channel with panel Cancel buttons (verify/clone/push/pull) and
  partial-clone cleanup; `agent:cancel` now also stops an apply
  between edits (partial work kept plus checkpoint); late provider
  responses cannot overwrite stopped chat/plan state (generation
  guards). Tests pin cancel, timeout, repeat-cancel, and partial
  behavior per surface.
- Durable checkpoints: every agent apply persists pre-apply bytes
  under `.kryom/checkpoints/` (last 10 kept); the agent panel lists
  checkpoints with per-item Undo, files changed since the apply are
  kept, and damaged snapshots refuse to restore
  (`electron/services/agent/checkpoint-store.cjs` + test,
  `agent:checkpoints` / `agent:undo` channels).
- Session recovery: open tabs (with bounded unsaved edits) and the
  agent draft/awaiting-review plan persist per project across reload
  and relaunch; explicit Discard drops the snapshot
  (`src/utils/session-restore.ts`, `session.discardSnapshots`
  command). Chat saves are root-bound with a previous-root slot and
  a renderer stash, closing the mid-send project-switch race.
  Interrupted research runs resume from disk (covered by test).
- Crash recovery: renderer crashes offer Reload (repeated crashes
  escalate to app relaunch); uncaught main-process exceptions log a
  redacted detail and offer Relaunch/Quit; unhandled rejections warn
  without exiting (`render-process-gone`, `uncaughtException`,
  `unhandledRejection` in `electron/main.cjs`, policy in
  `electron/services/crash/crash-recovery.cjs` + test).
- Close guard: dirty editor tabs prompt Save/Discard/Cancel on window
  close (native dialog, sequential save-all with nonce settlement) and
  a generic prompt on reload; clean windows close without prompts
  (`file.saveAll` command, `dirtyCount` in `ui:context`).
- Monaco inline diagnostics: Problems results map to gutter markers
  with F8/Shift+F8 navigation and stale-marker cleanup.
- Git unstage (`git:unstage`) and discard-tracked (`git:discard`)
  operations with tests; Git panel reflowed to a single sidebar
  column with per-section selection.
- Research findings, evidence, decisions, verification, and
  implementation tasks rendered with source citations; sources open
  in the system browser via validated `app:open-external`.
- Safe dependency-free message rendering: fenced code blocks with
  Copy, headings, lists, quotes, inline code; message Copy buttons;
  brief shown as structured content instead of raw text.
- AI key pre-flight: Welcome, Chat, and Agent show inline setup
  guidance with a Connections shortcut instead of failing blind.
- Terminal command history (Up/Down, deduped) and an auto-scroll
  toggle; input row wraps at narrow widths.
- Editor tabs: roving-tabindex arrow/Home/End navigation, focus
  restore on close, scroll-into-view, Ctrl+Tab cycling.
- Keyboard Shortcuts dialog (Help menu) listing only wired commands.
- Right-side Terminal/Output panel (resizable, persisted, Ctrl+`)
  replacing the bottom dock; Chat/Agent/Research stay on the center
  stage, Git/Problems in the sidebar.
- GitHub Connections: verified remote checks, remote listing,
  clone-and-open, fast-forward pull (`git:remotes`, `git:verify`,
  `git:clone`, `git:pull`).
- Local Word workflows: research-brief and text export to .docx with
  numbered citations, .docx import, report scaffolds
  (`documents:*` channels; `docx`, `mammoth`).
- Desktop IDE shell: native File/Edit/Selection/View/Go/Run/Terminal/
  Help menu, activity bar, contextual sidebar, center editor/AI stage,
  right-side Terminal/Output panel, and live status bar.
- Center staging: Chat, Agent, and Research stay mounted on the
  center stage with full session state; Git and Problems live in the
  sidebar without remounting.
- Go to File quick-open palette (Ctrl+P) with fuzzy matching over the
  workspace tree; Go to Line, Back/Forward history, and Open Recent.
- File menu operations: New Text File, Open File, Open Folder,
  Open Recent, Save, Save As, Auto Save, Close Editor, Close
  Folder. New Window is disabled: the backend workspace root is a
  process-wide singleton until roots are scoped per window.
- Connections, Extensions, Profile, and Output views; About dialog;
  extended Settings (model, auto-save, editor font size, panel
  sizes); status-bar diagnostics summary; terminal Clear.
- Backend: `workspace:open-file`, `workspace:open-path`,
  `filesystem:save-as`, `app:get-version`, `app:get-ai-status`,
  `app:open-external`, `ui:get`/`ui:set`/`ui:context` channels;
  ui-state service with auto-save and recent projects.
- Recent projects prune entries whose folders no longer exist, with
  the menu and welcome list updated.
- Agent service and panel: JSON task plans with per-edit previews,
  selective apply, and atomic rollback (`agent:plan`, `agent:apply`).
- Git service and panel: status, diff, changed files, stage, commit,
  push (`git:*` channels).
- Diagnostics service and Problems panel: one-command runs with
  TypeScript, generic, and Node-stack parsers (`diagnostics:run`).
- Project intelligence: workspace summary and bounded AI context
  (`intelligence:summary`, `intelligence:context`).
- Settings service and modal: validated `defaultModel` and
  `aiContextEnabled` persisted to Electron user data
  (`settings:get`, `settings:update`).
- Terminal status and cancellation channels (`terminal:status`,
  `terminal:cancel`) and a process registry.
- Filesystem meta/conditional channels with mtime conflict detection
  (`filesystem:read-meta`, `filesystem:save-conditional`).
- File and folder create/rename/delete channels plus name/content
  search (`filesystem:*`, `search:files`).
- Full frontend shell: Explorer, Search, Monaco editor, AI Chat,
  Agent, Terminal, Problems, Git, Settings, dialogs, status bar.
- Meta provider (`muse-spark-1.3`, `muse-wonder-1.0`), provider
  interface, and deterministic mock provider.
- Central secret allowlist, redacting logger, coded errors,
  trusted-sender and input-validation guards.
- Backend test suite: 26 `node:test` files including the wiring
  regression test, run by `npm test`.
- Syntax gate (`npm run check:syntax`) over all backend files.
- Windows CI workflow (`.github/workflows/ci.yml`): install, test,
  syntax check, production build.
- Windows packaging: electron-builder NSIS configuration with
  `npm run pack` (unpacked dir) and `npm run dist` (installer).
- Documentation set: README, `docs/` guides, and limitation records.

### Changed

- `.env` handling: project-root dotenv load in development, user
  environment variable for packaged builds; `.env.example` holds
  placeholders only.
- Production renderer entry resolves to `dist/index.html` with a
  relative Vite base for `file://` loading.

### Removed

- 34 zero-byte scaffold files (misspelled IPC duplicate, unused
  security/services/frontend/style stubs, empty root configs).
- Obsolete empty directory trees (`src/features/`, `tests/`,
  `public/assets/`, `public/icons/`).
- `tsconfig.tsbuildinfo` removed from version control (still
  Git-ignored build output).

### Security

- Renderer sandbox (`contextIsolation`, no `nodeIntegration`), new
  windows denied, navigation allowlisted.
- Every IPC channel requires the app's own window as sender and
  validates its payload.
- Workspace containment with symlink rejection on all path operations.
- API key confined to the main process; scrubbed from child
  environments and logs.

### Fixed

- Agent approval note no longer wiped by a late-flushing mount
  effect: the reset now runs during render on approval-id change
  only (2026-11-02; `AgentWorkspace.tsx`).
- Agent Timeline/Checks views no longer share a duplicate React
  key, which intermittently duplicated or dropped rows
  (2026-11-02; `AgentWorkspace.tsx`).
- AI chat Escape listener now attaches pre-paint
  (`useLayoutEffect`), closing the gap where an early Escape
  missed the in-flight request (2026-11-02; `AiChat.tsx`).
- Screenshot gallery filenames finalized (17 renames, byte
  identical) so all 8 README references resolve (2026-11-02).
- Live Meta verification re-run on the current tree: one
  exact-marker request per model, both passed (2026-11-02).

## 2026-10-27 — Foundation (committed history)

- `e324f7a` Initialize kryomcode workspace.
- `a1bb4cc` Add Electron desktop runtime.
- `d11c19e` Add project explorer and Monaco editor.
- `8bd8947` Fix Electron workspace and terminal handlers.
- `e3b4ab2` Add kryomcode project README.
- `d2d9a21` Add MIT license.
- `f29e6d3` Correct workspace path validation.
- `e6fd724` Add kryomcode AI Chat foundation.
- `93791a8` Organize project structure.
- `f8be2d0` Modularize Electron backend services.
- `8baac87` Fix clone URL case sensitivity in README.
