# Milestone 3 — Plan: Autonomous Coding Agent + Professional Agent Workspace

Status: approved for implementation (no blockers found in audit).
Working tree at audit time: clean, `main` at `e024ed1` (Milestone 2).

## 1. Existing architecture

KryomCode is Electron + React + TypeScript + Vite + Monaco.
The main process owns all privileged work behind trusted-sender IPC
channels; the renderer never touches disk, network, or providers
directly. Backend services are CommonJS (`.cjs`) with colocated
`node:test` suites; renderer code is React + Vitest.

Milestones 1–2 already delivered the agent primitives Milestone 3
orchestrates (nothing below is rebuilt):

| Area | Existing implementation |
|---|---|
| Task proposals | `agent/agent.service.cjs` `planTask` (model JSON proposal, validated edits, digest pinning) — never writes during planning |
| Atomic apply | `agent/agent.service.cjs` `applyEdits` (conflict gate, pre-apply freshness gate, snapshots, rollback, checkpoints, per-run cancel) |
| Change analysis | `agent/change-set.cjs` `buildChangeSet` (import graph, order, conflicts, review groups; read-only) |
| Staleness | `agent/freshness.cjs`, `agent/context-snapshot.cjs` (digests, freshness re-checks) |
| Checkpoints | `agent/checkpoint-store.cjs` (undo support) |
| Tracked plans | `agent/plan-store.cjs` v2 (steps, evidence, truthful verification reports from observed runs only) |
| Structured planning | `planning/plan-builder.cjs` (evidence-grounded decomposition, topo order, parallel waves, revisions) |
| Specialists | `specialists/specialist.service.cjs` (6 detached roles, persisted runs) |
| Orchestration | `orchestration/orchestrator.service.cjs` (approved-plan multi-agent runs, ownership, per-task approval) |
| Repair | `agent/repair.service.cjs` (bounded 2-attempt / 10-minute cycles, per-attempt approval) |
| Verification | `diagnostics/` (`runDiagnostics` + observed-run registry + structured diagnosis) |
| Terminal | `terminal/terminal.service.cjs` (contained cwd, scrubbed env, timeout, cancel) + `command-validator.cjs` + `ipc/approval.cjs` native destructive-command dialog |
| Research | `research/` depth-aware engine (6 providers, evidence, credibility, briefs, handoffs) |
| Project intel | `project-intelligence/` (analyzer, code/symbol index, architecture, semantic search, impact) |
| AI routing | `ai/router.cjs`, provider registry, `meta-muse.provider.cjs` (`muse-spark-1.3` / `muse-wonder-1.0`), `MockProvider` test double |
| Permissions | `permissions/permission.service.cjs` (capability grants) + renderer approval UX + main-process enforcement gates |
| Memory/audit | `memory/memory.store.cjs`, `audit/audit.service.cjs` |
| UI hosts | `MetaAIWorkspace` (embeds `AgentPanel` + `ResearchPanel` + `AgentTasksPanel`), `IntelligenceHub` (intel stage), `PlatformHub` (platform stage) |

## 2. Gap analysis (what Milestone 3 adds)

1. No unified autonomous run lifecycle. Today a user must manually
   chain impl-plan → plan → apply → diagnostics → repair across
   panels. There is no single session that flows
   understand → analyze → research → plan → approve → execute →
   verify → repair → summarize with one event timeline.
2. No agent command policy. `classifyCommand` is advisory-only for
   interactive terminal use; the agent has no allow/approve/deny
   policy for model-proposed commands.
3. No agent-facing project-understanding entrypoint. Intel pieces
   exist but there is no one bounded, task-relevant bundle API that
   records exactly which files were inspected.
4. No professional Agent workspace. `AgentPanel` is a single-column
   form inside Meta AI tabs; there is no header/composer/plan/
   timeline/diff/terminal/result workspace.
5. No deterministic run summarizer with honest pending-verification
   semantics.

## 3. Reusable services (extended, never duplicated)

- Planning: `buildImplementationPlan` (+ `reviseImplementationPlan`)
  for structured decomposition; `planTask` per subtask for validated
  edit proposals; `normalizeRisk` for risk shapes.
- Editing: `applyEdits` per subtask (freshness + rollback +
  checkpoints preserved); `buildChangeSet` for the union preview;
  `checkEditFreshness` before every batch.
- Verification: `runDiagnostics` (observed runs) +
  `recordVerification` with `executionRunId` so reports stay
  truthful; `diagnoseRun`/`sanitizeDiagnosis` for failure analysis.
- Repair: `repair.service.cjs` cycles (cap, budget, per-attempt
  approval) — the run drives them, it does not reimplement them.
- Research: `startResearch`/`getStatus` + `loadResearchContext` for
  handoff text framed as UNTRUSTED reference material.
- Terminal: `runCommand` via `runDiagnostics`; destructive commands
  keep the native dialog in `ipc/approval.cjs`.
- Intel: `getWorkspaceSummary`, `analyzeArchitecture`,
  `searchProject`, `analyzeImpact`, `refreshIndex`/`selectContext`,
  `getStatus` (git), memory + audit for run records.
- Provider: `MetaMuseProvider` via existing config; `MockProvider`
  for deterministic tests.

## 4. Required changes

### 4.1 New backend modules

- `electron/services/agent/tool-policy.cjs` (new, pure):
  `reviewAgentCommand(command)` → `{ verdict: 'run' | 'approve' |
  'deny', reason, warnings[] }`. `run` = narrow review class
  (read-only git inspection, package-script test/build/lint/
  typecheck, `tsc`, `vitest`/`jest`/`pytest`/`go test` style
  runners). `deny` = `classifyCommand` hits plus install/publish/
  credential/network-exfil/git-write/container/privilege patterns.
  Everything else = `approve` (explicit user approval with the
  agent's explanation). Extends `command-validator.cjs`.
- `electron/services/agent/understanding.cjs` (new):
  `buildUnderstanding(task, { contextPaths })` → bounded bundle
  (project summary, architecture brief, task-relevant files via
  index + semantic search, git status, diagnostics snapshot) plus
  `inspected[]` — the exact files read. Secrets/ignored dirs
  excluded via existing gatherers; never claims uninspected files.
- `electron/services/agent/autonomous-run.cjs` (new): run store +
  state machine + persisted event log + background phase driver.
  States: `analyzing`, `researching`, `planning`, `proposing`,
  `waiting_for_approval`, `executing`, `verifying`, `repairing`,
  `paused`, `completed`, `failed`, `cancelled`
  (`idle` = no active run; `waiting_for_tool` surfaces as a
  per-event `tool` state on the active phase). Records persist at
  `.kryom/agent-runs/<id>/run.json` with append-only events.
- `electron/services/agent/run-summary.cjs` (new, pure):
  `buildRunSummary(record)` → deterministic final report (what
  changed + why, files, checks with real outcomes incl.
  passed/failed/skipped/not-executed/manual-pending, remaining
  issues, next action). Never claims completion while verification
  is pending.

### 4.2 Agent execution lifecycle

```
start ─▶ ANALYZING ─▶ [RESEARCHING] ─▶ PLANNING ─▶ PROPOSING ─▶
WAITING_FOR_APPROVAL ─▶ EXECUTING ─▶ VERIFYING ─▶ COMPLETED
 ?back                    │  ▲              │           │
 │research fail            │  │reject        │ fail      │ fail
 │(optional: continue       │  │(revise)      ▼           ▼
 │ with note; required:    │  └──────── WAITING    REPAIRING ─▶ VERIFYING
 │ run fails honestly)     │   _FOR_APPROVAL  ▲ (bounded cycle, per-attempt
 └────────────────────────▶│  (plan/cmd/       │  approval; then re-verify)
 PAUSED / CANCELLED ◀──────┘   repair gates)   └─ exhausted → FAILED
```

- The driver is a background promise per run (same pattern as
  `research.service.cjs` `liveRuns`), advanced automatically until
  an approval gate, pause, cancel, terminal state, or budget
  exhaustion. The renderer polls `agent:run-get`.
- ANALYZING: understanding bundle + one structured model call
  (outcome, affected files ∩ index, risks, research need +
  questions, validation criteria). File hints outside the index are
  dropped, never sent onward as facts.
- RESEARCHING (only when `researchMode` is `required`, or `auto`
  and the analysis requests it): `startResearch` + bounded polling
  + handoff text as untrusted context. `off` skips entirely.
- PLANNING: `buildImplementationPlan` grounded in bundle +
  research; persisted as plan-store v2.
- PROPOSING: one `planTask` per subtask (sequential, cancellable,
  subtask context attached); union `buildChangeSet` for review.
- WAITING_FOR_APPROVAL: plan approval covers the listed edits AND
  the plan's listed review-class verification commands. Any other
  command parks here with the agent's explanation. Rejection can
  request revision (re-plan) or cancel.
- EXECUTING: `applyEdits` per subtask in dependency order with
  freshness re-checks; evidence (checkpoints) attached per subtask.
- VERIFYING: `runDiagnostics` per listed check → observed run →
  `recordVerification`. Outcomes recorded exactly as observed.
- REPAIRING: `repair.service.cjs` cycle per failing check
  (existing caps); each attempt's edits need approval; re-verify
  once; exhaustion → `failed` with evidence.
- COMPLETED/FAILED: deterministic summary + memory note + audit
  entry. Applied work and checkpoints survive every outcome.

### 4.3 IPC / preload / types

- New channels (all trusted-sender + validated): `agent:run-start`,
  `agent:run-get`, `agent:run-list`, `agent:run-cancel`,
  `agent:run-pause`, `agent:run-resume`, `agent:run-approve`,
  `agent:run-reject`.
- Approvals are generic by server-issued `approvalId`
  (`plan` | `command` | `repair` payloads); forged ids fail closed.
- Preload functions, `KryomAgentRun*` types in `src/electron.d.ts`,
  IPC allowlist + lifecycle tests, wiring rows, test-manifest
  entries.

### 4.4 UI — Professional Agent Workspace

New `agent` center-stage destination (activity-registry + `App.tsx`
stage pattern, mirroring `intel`/`platform`): `AgentWorkspace.tsx`
(+ `useAgentRun.ts` polling hook) with header (identity, model
selector via `useProviderModels`, status, new task, run history,
stop/pause), task composer (auto-resize, context attach, research
mode, Ctrl+Enter, stop), execution plan (numbered steps, status,
files, risk, approve/reject/revise), live timeline (backend
events only — analysis, tools, files, commands, checks, errors,
repairs), changes + inline diff viewer (proposed vs applied),
terminal/verification (real output, exit codes, checklist), final
result (summary). No fake progress: every row renders a persisted
backend event or record. Draft + selected run persist per project.

### 4.5 Tests

- `tool-policy.test.cjs`, `understanding.test.cjs`,
  `run-summary.test.cjs`, `autonomous-run.test.cjs` (MockProvider
  full-lifecycle: approve-path completion, rejection, cancel,
  pause/resume, command deny/approve, repair exhaustion, partial
  failure, interruption marking, stale-context refusal).
- IPC allowlist + lifecycle coverage, wiring rows, `test` script
  entries, `AgentWorkspace.test.tsx` (composer/plan/approval/
  timeline with mocked bridge). Chat + Research suites untouched
  and green (regression).

## 5. Permission boundaries

- Renderer approvals are UX; enforcement is main-process:
  server-issued approval ids, `applyEdits` re-validation,
  freshness gates, `confirmDestructiveCommand` native dialog,
  tool-policy deny list.
- Tool policy: `deny` never runs (no override); `approve` runs
  only after explicit per-command approval; `run`-class commands
  run only when listed in the user-approved plan.
- No auto commit/push/install/publish: git-write, installers, and
  publishers are deny-class for agent-initiated commands; the run
  never calls git-write APIs.
- Path containment via `resolveWorkspacePath` everywhere; secrets
  excluded from context and redacted in events/logs
  (`redactText`); research + repo content stay UNTRUSTED.
- Bounded: run budget, phase budgets, subtask/edit/command caps
  inherited from existing services, repair caps unchanged.

## 6. Failure recovery strategy

- Every transition + event persists before the next unit of work;
  crashes surface as `interrupted: true` (cancel-only, completed
  work preserved) — same rule as repair/orchestration runs.
- Apply failures roll back the in-flight subtask batch; earlier
  subtasks keep checkpoints + evidence (partial completion is
  reported, resumable via new run, never hidden).
- Stale context refuses loudly (re-plan, never overwrite).
- Provider errors classify (cancel/auth/rate-limit/model) with one
  bounded retry for transient failures; auth failures fail fast
  with a settings pointer.
- Pause parks between units of work; cancel aborts controllers and
  lands the run in `cancelled` with a truthful event trail.

## 7. Testing strategy

Deterministic `MockProvider` for lifecycle/policy/summary unit
tests; injected doubles at every external boundary (git, research
providers, fs via temp workspaces); IPC tests assert trust +
validation + lifecycle; renderer tests mock the bridge; existing
Chat/Research suites run unmodified as regression; live Meta API
paths exercised only where `MODEL_API_KEY` is present (presence
checked, value never logged), otherwise honestly reported as
not-live-tested. No weakened assertions, no mocked-proof-of-live
claims.

## 8. UI/UX implementation strategy

New center-stage `agent` destination reusing theme tokens, compact
panel classes, `diffLines`, `useProviderModels`, dialogs, and the
stage/activity patterns — consistent with Advanced AI Chat and the
Research workspace, no new visual identity. Polling (1.5s) while a
run is active, idle otherwise; keyboard-accessible controls with
visible focus; empty/loading/error/cancel/recovery states for every
region; no welcome screen, no decorative panels, no invented
activity.

## 9. Risks

- Long model-call chains: mitigated by per-subtask progress
  events, cancellation, budgets, and phase timeouts.
- Approval fatigue: mitigated by plan-level approval covering
  listed review-class checks; per-command gates only for the rest.
- Stale index/content drift: mitigated by freshness gates +
  explicit re-plan path.
- Shell sandbox in this environment requires escalated approval
  per command (observed in Milestone 2); verification commands
  will run that way.
