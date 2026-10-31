# KryomCode Architecture

Three processes, one trust direction. The renderer never touches the
disk, the network, or secrets. It calls typed methods on `window.kryom`;
the preload bridge forwards each call to exactly one main-process IPC
channel; the channel validates the sender and payload, then runs a
service. Only the human-readable error message travels back.

## Process map

```text
Renderer (React, sandboxed)        Preload              Main (Node + Electron)
───────────────────────────        ───────              ──────────────────────
src/app/App.tsx ──► kryom() ──► window.kryom ──► ipcRenderer.invoke ──► ipcMain.handle ──► service ──► disk / git / Meta API
src/api/kryom.ts      │                  │                        │
src/electron.d.ts ◄───┴── types ─────────┘                        └── trusted-sender + payload validation first
```

| Piece | Entry point | Runs where |
|---|---|---|
| Window + lifecycle | `electron/main.cjs` | Main |
| Capability bridge | `electron/preload.cjs` | Preload (no Node APIs) |
| Channel wiring | `electron/ipc/register-handlers.cjs` | Main |
| UI shell | `src/app/App.tsx` | Renderer |
| Typed bridge access | `src/api/kryom.ts`, `src/electron.d.ts` | Renderer |

## Main process

`electron/main.cjs` loads `.env` from the project root (development
only), registers all IPC handlers, creates the 1440x900 window, and
cleans up terminal and Git child processes on `before-quit`.
`loadApp` loads the Vite dev server when not packaged and falls back to
`dist/index.html`; packaged builds always load `dist/index.html`.
Navigation outside the dev server and `file:` URLs is denied, and new
windows are refused.

## IPC contract

Thirteen domain modules under `electron/ipc/` (plus registration).
Every handler runs `isTrustedSender(event)` (sender must be the app's
own window, see `electron/security/trusted-sender.cjs`) and then
validates arguments with `electron/security/validate-input.cjs`
before calling a service.

| Channel | Direction summary |
|---|---|
| `workspace:open/close/refresh` | Native folder picker, tree rebuild |
| `workspace:read-file/save-file` | Whole-file read/write (existing files) |
| `filesystem:read-meta/save-conditional` | Read with mtime, write-if-unchanged |
| `filesystem:create/rename/delete` | Explorer mutations |
| `search:files` | Name or content search |
| `terminal:run/cancel/status/classify` | One command per call, kill-all, list, warning pre-scan |
| `ai:chat/cancel` | Single chat completion, in-flight abort |
| `chat:save/restore` | Per-project conversation persistence |
| `agent:plan/context/apply/cancel/checkpoints/undo` | Plan proposal, source-context preview, approved-edits apply, planning abort, checkpoint list, checkpoint undo |
| `agent:track-plan/plans/plan-get/step/evidence/verify/cancel/resume/complete` | Persistent execution plans: progress steps, evidence, verification reports (see [PLANS.md](PLANS.md)) |
| `agent:change-set` | Read-only dependency analysis over an approved edit batch: versioned manifest with order, conflicts, and validation (see below) |
| `agent:repair-start/propose/apply/record/cancel/get` | Backend repair cycles: 2-attempt cap, 10-minute budget, per-attempt linked reports, explicit approval per attempt |
| `agent:chat-excerpt` | Chat excerpt preview for agent grounding (no transmit); planning snapshots file/research/chat/workspace provenance with freshness |
| `git:status/cancel/diff/changed-files/stage/unstage/discard/commit/push/pull/remotes/verify/clone` | One channel per operation |
| `diagnostics:run` | One build/test command + parsed problems + structured diagnosis (category, confidence, evidence, run id) |
| `diagnostics:quality/get/list` | Computed quality reports (regression, test suggestions, security scan, performance notes, explainable verdict) — no model calls |
| `intelligence:summary/context` | Project summary + bounded context |
| `intelligence:index-status/refresh/freshness` | Persistent code index: status, incremental refresh, fingerprint freshness |
| `intelligence:symbols/symbol/references` | JS/TS symbol scan, definition lookup, cross-file references (approximate static scan) |
| `intelligence:search/impact/architecture` | Deterministic project search, dependency impact with evidence, architecture analysis |
| `agent:impl-plan/revise/cancel` | Evidence-grounded implementation plans, linked revisions, planning abort |
| `agent:specialist-run/get/cancel/list` | Detached specialist runs (research/coding/testing/debugging/security/review) with persisted records |
| `agent:orch-start/advance/approve/retry/cancel/get/list` | Orchestrated runs: approved-plan start, wave advance, per-task approval, budgeted retry, cancel, status |
| `agent:run-start/get/list/proposal/cancel/pause/resume/approve/reject` | Autonomous coding-agent runs: single-session analyze→research→plan→approve→execute→verify→repair→summarize with server-issued approvals, tool policy, budgets, and persisted events (see [MILESTONE3_PLAN.md](MILESTONE3_PLAN.md)) |
| `settings:get/update` | Validated preference store |
| `research:start/status/active/list/get/brief/cancel/resume/select` | Background research runs, persisted sessions, cited briefs |
| `research:rename/delete/search/export/handoff` | Deep-research session management, Markdown/HTML report export, labeled research-to-chat/agent handoffs |
| `app:get-version/get-ai-status/open-external` | Version info, key presence, validated browser opening |
| `ui:get/set/context` | UI state store; renderer capability/dirty-count pushes |
| `memory:list/get/create/update/delete/delete-all/export` | Per-project memory records with provenance + staleness; bulk delete; JSON export via save dialog |

The preload bridge (`electron/preload.cjs`) exposes one method per
channel plus read-only `platform` and `versions`. No channel accepts a
raw callback, path escape, or endpoint override.

## Services

`electron/services/` holds the domain logic as dependency-injected
CommonJS modules (`.cjs`, `require`/`module.exports`):

- `workspace/` — open-root state, containment checks, bounded tree.
- `filesystem/` — file read/write, directory mutations with conflict
  detection, bounded name/content search.
- `terminal/` — child-process runner, process registry, advisory
  command warnings.
- `ai/` — config allowlist, chat orchestration, provider interface,
  Meta implementation, deterministic mock for tests.
- `agent/` — plan validation and atomic apply with rollback.
- `agent/plan-store.cjs` — persistent plans plus truthful
  verification reports (observed-run facts, derived conclusions,
  display-only model explanations; see below).
- `agent/change-set.cjs` — read-only change-set manifests:
  JS/TS import graph, dependencies-first order, conflicts,
  review groups, whole-set validation (see below).
- `agent/repair.service.cjs` — bounded repair cycles (cap, budget, mutex, terminal states) over the plan/diagnostics/checkpoint stores.
- `agent/autonomous-run.cjs` — autonomous runs: one durable session
  per task (analyze→research→plan→approve→execute→verify→repair→
  summarize) with persisted events, server-issued approvals, budgets,
  pause/resume/cancel, and deterministic summaries.
- `agent/tool-policy.cjs` — pure allow/approve/deny policy for
  agent-initiated shell commands, extending the shared destructive
  patterns (deny-class never runs, no override).
- `agent/understanding.cjs` — bounded project-understanding bundles:
  task-relevant retrieval plus the exact inspected-file record with
  freshness re-checks.
- `agent/run-summary.cjs` — deterministic final reports from observed
  events only (passed/failed/skipped/not-executed/manual-pending;
  never claims completion while verification is pending).
- `git/` — status, diff, stage, commit, push over `git` on `PATH`.
- `diagnostics/` — command runner with an observed-run registry,
  pure output parsers, and the failure classifier
  (`diagnosis.cjs`).
- `project-intelligence/` — summary, dependency analysis, AI context,
  plus deep intelligence: persistent code index (`code-index`),
  symbol index (`symbol-index`), deterministic search
  (`semantic-search`), impact analysis (`impact-analysis`), and
  architecture analysis (`architecture`).
- `planning/` — implementation plans from requirements: validated
  decomposition, topological ordering, parallel waves, revision
  records (persists via `agent/plan-store.cjs`).
- `specialists/` — six focused agents over the shared provider
  contract with structured I/O and persisted run records.
- `orchestration/` — approved-plan runs with file ownership,
  parallel proposals, sequential guarded merges, and recovery.
- `quality/` — computed quality reports from project evidence.
- `settings/` — preference store and the central secret allowlist.
- `research/` — search-provider abstraction (arXiv, OpenAlex,
  DuckDuckGo, optional Tavily), safe URL reader, session store under
  `.kryom/research/`, brief builder/validator, and the orchestrator.
  Chat and agent attach saved briefs via `researchSessionId`.
- `memory/` — typed per-project records under `.kryom/memory/`, one
  JSON file each; service-captured source fingerprints (file digest,
  chat digest, research brief version, verified commit SHA) with
  stale/unverified reporting. See [MEMORY.md](MEMORY.md).

Cross-cutting helpers live in `electron/security/` (sender, path, and
input validation) and `electron/utils/` (coded errors, redacting
logger). See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the
annotated file map and [SECURITY.md](SECURITY.md) for the boundaries
each layer enforces.

## Verification reports (3B.5)

Every report under `.kryom/plans/<id>/reports/` separates four
sections: execution facts (observed-run registry entry — command,
start/completion timestamps, duration, exit code,
cancelled/timed-out flags, `diagnostics` source), observed evidence
(redacted output excerpt, persisted diagnosis, repair checkpoint id
+ changed files), model explanation (bounded, redacted
interpretation — never consulted for status), and unverified
claims (stated reasons for non-execution, legacy provenance
flags). The conclusion (`passed/failed/cancelled/timed_out/
blocked/skipped/not_executed`) derives from observed facts only:
the caller names a run id, the store resolves the facts, and any
claim that contradicts them (including exit-code or timeout-flag
mismatches) is rejected without persisting. The IPC boundary never
forwards repair linkage, so checkpoint/file references are
server-derived; stored conclusions are re-derived on load and a
mismatch means corruption. Plan-level state is conclusion-based:
only executed failures fail a plan. The renderer shows the
persisted report (Status, Executed, Observed evidence, Model
explanation, unverified-claim labels), never ephemeral state or
model prose, as proof. See [PLANS.md](PLANS.md) for the schema.

## Change sets (3B.6)

`buildChangeSet(edits)` analyzes an approved batch without writing
anything: static JS/TS imports (comment- and string-aware
patterns, no parser dependency) resolve through the standard
containment validator into resolved/unresolved/unknown/external
edges; traversal is bounded (100 files, depth 4, 256 KB per file)
and never enters `node_modules`, `.git`, `.kryom`, secret names,
or generated directories. Non-JS/TS files report `unsupported`;
aliases and absolute imports report `unknown`. The manifest
carries per-file fingerprints, cycles, same-file conflicts,
review groups (connected components), a dependencies-first order
(cyclic members keep plan order), and validation: freshness owns
target blockers, confirmed delete importers (in-set plus a bounded
reverse scan) block, and cycles/truncation/unresolved imports warn
only. The renderer shows the manifest at review, disables Apply on
blockers, revalidates against the review-time baseline before the
confirm dialog (stale dependencies warn), applies in manifest
order, and attaches the order as apply-step note evidence. The
apply path itself is unchanged — approval, containment, freshness
gate, checkpoints, undo, rollback, cancellation, and repair
budgets are reused untouched — and verification stays
whole-project with truthful-report semantics.

## Level 3C intelligence (3C.1–3C.5)

Research → Understand → Plan → Review → Execute → Verify, on the
verified 3B foundation:

- Understand: `.kryom/index/manifest.json` persists file
  fingerprints; refresh is incremental and every reader reports
  stale entries instead of trusting them. Symbols, search,
  impact, and architecture derive from the index — deterministic,
  bounded, and read-only over project sources.
- Plan: the decomposer proposes subtasks; validation, ordering,
  waves, and conflicts are computed. Plans persist as v2 plan
  records; revisions are new linked records.
- Review + Execute: specialists propose (never write); the
  orchestrator merges owned files sequentially through
  change-set analysis and `applyEdits` (freshness, checkpoints,
  rollback). Parallelism covers proposal generation only.
- Verify: quality reports compute from git state, impact,
  verification history, static patterns, and index facts.

The renderer surfaces all five capabilities in the INTEL
center-stage tab (`src/components/IntelligenceHub.tsx`),
mounted alongside the unified Meta AI workspace tabs with the same
polling and approval patterns — no duplicated interfaces.

## Level 4A platform (4A.1–4A.8)

Core = stable platform; capabilities arrive as providers,
extensions, skills, workflows, integrations, and templates —
each behind its own validated contract:

- Providers: descriptors register in `provider-registry.cjs`
  (Meta first-class, mock for tests); `model-catalog.cjs`
  reports only confirmed capabilities; `router.cjs` resolves
  the user selection with explicit-only fallback;
  `provider-config.cjs` stores selection, never secrets.
- Extensions: `manifest.cjs` validates `kryom-extension.json`;
  `registry.cjs` tracks installs (disabled by default);
  `runtime.cjs` runs entry code in a vm sandbox behind a
  JSON-only membrane with timeouts; `lifecycle.cjs` drives
  install→uninstall with startup recovery. Only declared
  commands are invokable.
- Skills/workflows: `skill-store.cjs` binds definitions to a
  fixed tool catalog with permission mapping; `skill-runner`
  enforces grants and approval gates; `workflow-store.cjs`
  versions definitions; `workflow-engine.cjs` advances runs
  only through explicit advance/approve/resume/cancel calls.
- Integrations/templates: `integrations/registry.cjs` hosts
  adapters (GitHub = local git only); `template-engine.cjs`
  previews before generating and stages fresh directories
  atomically.
- Trust: `permissions/permission.service.cjs` (12 granular
  permissions, no wildcard) is checked at execution
  boundaries; `audit/audit.service.cjs` appends secret-free
  events. The renderer sees booleans and metadata, never
  credentials.

The renderer surfaces all seven areas in the PLATFORM
center-stage tab (`src/components/PlatformHub.tsx`), reusing
the existing panels, buttons, and error patterns — no
redesign, no fake listings.

## Level 4B production readiness (4B.1–4B.12)

Same processes, harder boundaries:

- Environment: `services/release/environment.cjs`
  detects development/preview/production (baked channel
  via builder extraMetadata, operator env override).
  Packaged builds ignore `.env`; DevTools auto-close in
  production; startup failures show a Relaunch/Quit
  dialog instead of a blank window.
- Platform: `utils/platform.cjs` owns every OS branch.
  POSIX children spawn detached and die by process-group
  signal; Windows keeps taskkill. Executable lookup is
  shell-free (`where`/`which`).
- Updates: `services/update/update.service.cjs` checks
  an https feed (strict schema), stages sha512-verified
  downloads, and never installs. Rollback is the
  default: failures clear staging; the running app is
  never modified. UI: PLATFORM → Updates.
- Isolation: each active extension runs in a dedicated
  child (`services/extensions/worker/` — utilityProcess
  in production, fork in plain Node) with timeouts, a
  sampled RSS cap, and crash recovery. Permissions still
  enforce at the membrane; lifecycle inputs/outputs are
  unchanged (`isolated: false` keeps the in-process vm
  path for embedders).
- Diagnostics: `services/diagnostics/support-bundle.cjs`
  collects versions/status-counts/redacted paths (home
  becomes `~`) with preview-before-export to a
  user-chosen file. Nothing uploads. UI: Help → Export
  Diagnostics.
- Localization: `src/i18n` (English-only, typed keys,
  stored preference → navigator detection → `en`
  fallback). New UI uses `t()`; code and user text are
  never translated.
