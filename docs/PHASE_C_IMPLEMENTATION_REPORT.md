# Phase C Implementation Report — Professional Agent Console

- Status: IMPLEMENTATION COMPLETE — ALL AUTOMATED GATES PASS
- Verdict: CONDITIONAL PASS (manual workstation GUI pass outstanding)
- Date: 2026-11-01
- Branch: `main` (per session baseline; git unreachable this turn, see §14)
- Scope: Phase C per `docs/UNIFIED_PROFESSIONAL_IDE_UI_UX_BLUEPRINT.md`
  plus the compact top-navigation refinement. No Phase D/E work.

## 1. Executive summary

Phase C is implemented as a gap-fill on the real Agent Console —
`src/components/AgentWorkspace.tsx`, the component mounted in the
staged AGENT tab (`src/app/App.tsx`) — rather than a rewrite. Inspection
showed the Milestone 3 workspace already provides the run header, status
model, plan review, approval cards, execution timeline, multi-file
change review, and verification output, all rendered from backend
`KryomAgentRun` records. Phase C closes the remaining blueprint gaps:

1. Hunk-grouped diff review with `@@` headers and old/new line numbers
   (`src/utils/diff.ts` + shared `src/components/agent/DiffView.tsx`,
   now used by both AgentWorkspace and AgentPanel).
2. Per-subtask checkpoint display + restore via the existing
   `undoCheckpoint` bridge and shared confirm dialog
   (`src/components/agent/CheckpointRestore.tsx`).
3. Bounded rendering for long timelines/checks
   (`useBoundedList` in `src/components/agent/BoundedList.tsx`).
4. Run identity timestamps (started/updated, full id in tooltip).
5. Honest model-rebind boundary: the selector is labelled next-task-only
   and an active run shows which model it keeps.
6. Compact top navigation: brand icon once, working Back/Forward,
   existing 8-item menu row verified (File|Edit|Selection|View|Go|Run|
   Terminal|Help).

No Electron, IPC, security, approval, cancellation, or storage contract
was changed. No dependency was added. No `pty:*` was exposed to Agent.

## 2. What already existed (reused, not rebuilt)

| Blueprint ask | Existing implementation | Phase C delta |
|---|---|---|
| Run header + status | `StatusPill`, 12-state `STATE_LABELS`, Pause/Resume/Stop | Timestamps + run-id title |
| Timeline | `TimelineView` over `run.events` + Follow mode | Bounded window (50) |
| Plan review | `PlanView` steps/files/verification/risks | Checkpoint restore rows |
| Approvals | `ApprovalCard` plan/command/repair, server ids | None (complete) |
| Multi-file review | `ChangesView` proposed/applied + diffs | Hunk headers/line numbers |
| Verification | `ChecksView` real output + `outputLimited` | Bounded window (30) |
| Result summary | `ResultView` | None (complete) |

## 3. Agent Console architecture

- Console owner: `AgentWorkspace` (staged AGENT center view).
  Controller: `src/hooks/useAgentRun.ts` (poll 1.5 s while active;
  start/cancel/pause/resume/approve/reject/loadProposal/loadOldContent).
- Composer surface: `AgentPanel` (WelcomePage Agent mode +
  MetaAIWorkspace embed). Unchanged except shared-DiffView reuse —
  deliberately NOT given a second console header/timeline, which would
  duplicate AgentWorkspace.
- New presentational modules in `src/components/agent/`:
  `DiffView.tsx`, `BoundedList.tsx`, `CheckpointRestore.tsx`.
  All data comes from props/records; no new IPC channels.

## 4. Run timeline

- Still renders backend `run.events` in `seq` order with phase + time.
- Follow mode (default on) now also expands the bounded window so the
  live tail stays visible during polls; unfollowing a 50+ event run
  shows the leading window with Show more / Show all.
- Views are keyed by `run.id` so run switches reset paging while polls
  never collapse an expanded window.

## 5. Status model

- The 12-state backend model (`analyzing … cancelled`) is rendered
  unchanged through `StatusPill`. No duplicate status source added.
- Header adds the missing run identity: started/updated timestamps and
  the full run id as a tooltip next to the short id.

## 6. Plan review and approval flow

- Unchanged and complete: `PlanView` (objective, steps, files,
  edit counts, out-of-scope drops, verification, risks with
  mitigations) + `ApprovalCard` (plan/command/repair kinds, risk
  badges, change-set blockers, approve / request-changes / reject).
- Approval history is visible through `approval-resolved` timeline
  events. No auto-approve, no gate bypass, no new permission.

## 7. Multi-file and per-hunk review

- `ChangesView` (proposed/applied groups, action badges, Open in
  editor, unavailable-diff states) is unchanged; its diff renderer is
  now the shared hunk-grouped `DiffView`.
- `groupHunks()` (new in `src/utils/diff.ts`) derives hunks from
  `diffLines` with 3 lines of context, `@@ -a,b +c,d @@` headers, and
  1-based old/new line numbers. Pure presentation; identical inputs
  yield zero hunks and render "No differences."
- Per-hunk APPROVE/REJECT is not implemented: the backend exposes no
  hunk-granularity approval (`approveAgentRun` is plan/command/repair
  level). Only the supported review UI was built; no fake approval
  action exists. This is the documented backend limitation, and D3
  selective post-apply revert stays deferred.

## 8. Checkpoints and recovery

- `KryomAgentRunSubtask.checkpointId` (already in the run record) is
  now surfaced per plan step with a Restore action.
- Restore reuses the exact AgentPanel safety pattern: `useDialogs`
  confirm ("files changed since the apply are kept…", danger style) →
  `kryom().undoCheckpoint(id)` → `onFilesChanged(restored)` +
  status line `Undo: R restored, S skipped, F failed` → inline
  summary or error. No new recovery implementation, no destructive
  path, renderer never touches files directly.
- Missing checkpoints simply hide the row (checkpointId null).

## 9. Virtualization strategy

- Deliberately NOT pixel virtualization: agent lists are tens-to-
  hundreds of rows, and windowing by scroll position would break
  keyboard nav, find-in-page, and the Follow tail. Instead
  `useBoundedList` bounds the DOM (timeline 50, checks 30) with
  explicit Show more (+page) / Show all controls, full list semantics
  preserved (`role="log"`, real `<ul>`s), auto-scroll untouched.
- Check output was already backend-truncated (`outputLimited`); diffs
  keep the honest 300-line cap. No dependency added.

## 10. Model rebind

- Finding: the backend fixes the model at `startAgentRun`; no rebind
  API exists, so a running run cannot switch models. The UI now says
  so: the header selector carries a "next task only" tooltip, and
  while a run is active with a differing selection the header shows
  "Active run keeps {model}". No fake mid-run switch is claimed.
- Catalog behaviour (Meta-first, available-models-only, no secrets in
  renderer) is unchanged.

## 11. Stage retirement

Mapped, retired nothing — there is no dead stage:

| Surface | Mount point | Verdict |
|---|---|---|
| AgentWorkspace | staged AGENT tab (`App.tsx`) | Keep; Phase C console |
| AgentPanel | WelcomePage Agent mode | Keep; Phase B composer |
| AgentPanel | MetaAIWorkspace embed | Keep; session flow |
| AgentHistoryPicker | MetaAIWorkspace | Keep; history attach |

Code-level consolidation only: the duplicated `InlineDiff`
(AgentWorkspace, deleted) and `EditDiff` (AgentPanel, retired to a
commented reference block because the file's CRLF endings block
multi-line tool edits — safe to delete lines 144–168 in cleanup)
now share `agent/DiffView.tsx`. No backend or test was removed.

## 12. Top navigation refinement

- `TitleBar` (`src/components/Chrome.tsx`): brand icon rendered once,
  wordmark text removed (OS window title keeps the name); Back/Forward
  buttons wired to the real workbench history (`historyRef` /
  `navigateHistory`) with honest enabled states via a reactive
  `navPosition` mirror in `src/app/App.tsx`; command center and the
  three layout toggles kept.
- Menu row verified already correct in `electron/menu.cjs` —
  File|Edit|Selection|View|Go|Run|Terminal|Help — no menu change.
- Activity Bar, sidebar, editor, dock, bottom panel, status bar, and
  the Phase B welcome hero are untouched.
- Styles: `.title-nav` + disabled state, `.diff-hunk-header`,
  `.diff-lineno`, `.bounded-list-more`, `.agent-checkpoint-row` in
  `src/styles/app.css`, all on existing `--kc-*` tokens.

## 13. Files changed

New: `src/components/agent/DiffView.tsx`,
`src/components/agent/BoundedList.tsx`,
`src/components/agent/CheckpointRestore.tsx`,
`src/components/agent/AgentConsole.test.tsx` (12 tests),
`src/utils/diff.test.ts` (9 tests), `src/components/Chrome.test.tsx`
(top-nav tests), this report.
Edited: `src/utils/diff.ts` (+`groupHunks`), `src/components/
AgentWorkspace.tsx` (gaps §4–§10), `src/components/AgentPanel.tsx`
(DiffView reuse), `src/components/AgentWorkspace.test.tsx` (+5 Phase C
integration tests), `src/components/Chrome.tsx`, `src/app/App.tsx`
(nav), `src/styles/app.css`.
26 new tests total. No backend, config, or dependency file touched.

## 14. Verification — all automated gates pass

Shell route: the default sandbox failed twice early in the turn
(`windows_elevated setup_required`); execution was restored via
one-time escalated approval and every gate below ran to a terminal
result. Baseline: branch `main`, HEAD `c0c5f4a`, all Phase 0+1/A/B/C
changes present uncommitted (47 modified + 30 untracked = 77 paths,
incl. `src/components/agent/`, `src/utils/diff.test.ts`, this
report). `git diff --check` exit 0. Nothing committed or pushed.

| Gate | Command | Result |
|---|---|---|
| Focused | `npx vitest run src/utils/diff.test.ts src/components/agent/AgentConsole.test.tsx src/components/AgentWorkspace.test.tsx src/components/Chrome.test.tsx` | 4 files, 42/42 pass, exit 0 |
| Renderer | `npm run test:renderer` | 20 files, 183/183 pass, exit 0 |
| Backend | `npm test` | 770 tests: 765 pass, 0 fail, 5 skipped (pre-existing skips), exit 0 |
| Build | `npm run build` | tsc + vite ok, exit 0 (pre-existing chunk-size warning) |
| Syntax | `npm run check:syntax` | 192/192 ok |
| Workbench | `npm run check:workbench` | ok |
| Manifest | `npm run check:test-manifest` | 80/80 |
| Pack | `npm run pack` | exit 0, `release/win-unpacked/KryomCode.exe` (238 MB, unsigned — no cert configured) |

Fixes found by the gates (all in new Phase C tests, none in
implementation): 3 miscounted expectations (hunk line counts 7→8 /
6→7; short-id `ckpt-0123…`→`ckpt-012…` in two files) and 2 strict-TS
errors in the dialogs mock (zero-arg `vi.fn` → rest param). No test
was weakened; no implementation was changed to satisfy tests.

Flake note: the first full renderer run showed 182/183 with one
`waitFor` timeout; two reruns showed 183/183. The flaked test was
not identified; treat one renderer rerun as acceptable if it
recurs, and investigate if it becomes consistent.

GUI: the packaged app exits 0 silently within seconds in this
session (exit code captured: 0, no leaked processes) — the same
pre-existing session limitation noted in Phases A/B. No screenshots
could be taken here. Manual workstation pass still required:
staged AGENT tab → header/timestamps, timeline Follow + Show more,
plan checkpoints, expanded diff hunk headers, model hint; welcome
Agent mode still composes; dark/light themes; resize behaviour.

## 15. Known limitations and deferred work

- Per-hunk approve/reject and D3 selective revert: need backend
  support; review-only UI shipped (§7).
- Mid-run model rebind: no backend API; next-task boundary
  communicated (§10).
- Checkpoint restore covers subtask checkpoints in run records only;
  AgentPanel's own apply-undo is unchanged and separate.
- Commented retired `EditDiff` block in AgentPanel.tsx (CRLF) awaits
  deletion in a shell-capable cleanup pass.
- `useBoundedList` thresholds (50/30) are constants, not settings.
- Phase D (bottom panel/Git, xterm/node-pty) and Phase E (polish)
  untouched, per scope.

## 16. Recommendation

All six automated gates plus pack pass with exact evidence in §14.
The single outstanding item is the manual workstation GUI pass
(§14, last paragraph) — the same outstanding item Phases A/B
carried. Verdict: CONDITIONAL PASS. Recommend approving Phase C
after that GUI pass, then proceeding to Phase D.

