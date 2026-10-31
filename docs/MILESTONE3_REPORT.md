# Milestone 3 — Report: Autonomous Coding Agent + Professional Agent Workspace

Branch: `main` (base `e024ed1`, working tree uncommitted for review).
Plan: [MILESTONE3_PLAN.md](MILESTONE3_PLAN.md) · Demo: [MILESTONE3_DEMO.md](MILESTONE3_DEMO.md) ·
Runner: `scripts/demo-agent-run.cjs`.

## 1. What was built

A genuinely functional autonomous coding agent in one durable
session per task:

`understand → analyze → research → plan → approve → execute →
verify → repair → summarize`

plus a professional Agent workspace (activity-bar destination and
`AGENT` stage tab) that renders backend records only — no simulated
progress, no invented checks.

## 2. Architecture changes

New services (all under existing conventions — `.cjs`, colocated
`node:test`, trusted-sender IPC, preload allowlist, `Kryom*` types):

- `electron/services/agent/autonomous-run.cjs` — run store, state
  machine, persisted event log, and background driver. States:
  analyzing, researching, planning, proposing,
  waiting_for_approval, executing, verifying, repairing, paused,
  completed, failed, cancelled. Records persist at
  `.kryom/agent-runs/<id>/run.json`; subtask proposals with full
  edit contents persist as side files. The driver auto-advances one
  bounded unit at a time until an approval gate, pause, cancel,
  terminal state, or the 30-minute budget; the renderer polls.
- `electron/services/agent/tool-policy.cjs` — pure
  allow/approve/deny policy for agent-initiated shell commands,
  extending the shared destructive patterns. Review class
  (read-only git, project test/build/lint/typecheck) runs only when
  listed in the approved plan; approve class parks with the agent's
  explanation; deny class (destructive, file mutation, git writes,
  installs, publishing, deploys, network, shells, privilege,
  compound shell) never runs, with no override.
- `electron/services/agent/understanding.cjs` — bounded
  project-understanding bundles reusing the summary, index,
  architecture, semantic-search, git, and context gatherers.
  Records exactly which files were inspected (with digests) and
  re-checks freshness before planning.
- `electron/services/agent/run-summary.cjs` — deterministic final
  reports from observed events only, with
  passed/failed/skipped/not-executed/manual-pending buckets and
  verified/partially-verified/unverified honesty semantics.

Reused without duplication: `planTask`/`applyEdits`,
`buildChangeSet`, freshness, checkpoints, plan-store v2,
`buildImplementationPlan`/`reviseImplementationPlan`, repair
cycles, `runDiagnostics` + observed runs, Research Engine
(`startResearch`/status/handoff as untrusted context), terminal,
git (read-only), permissions, memory (completion notes), and the
Meta provider via the existing router/config.

New IPC (9 channels, all trust-checked and validated):
`agent:run-start/get/list/proposal/cancel/pause/resume/approve/reject`.
Approvals cite server-issued single-use ids and are re-validated
(kind, policy verdict, referenced records) at resolution time.

New UI: `src/hooks/useAgentRun.ts` (polling controller) and
`src/components/AgentWorkspace.tsx` (header, composer, plan,
approvals, timeline, changes/diffs, verification with real command
output, final result), staged into `App.tsx` with an `agent`
activity, plus theme-consistent styles and per-project view
persistence. Editor tabs refresh as the agent applies edits.

## 3. Files changed

New (14): the 4 services + 4 backend suites above,
`src/hooks/useAgentRun.ts`, `src/components/AgentWorkspace.tsx`,
`src/components/AgentWorkspace.test.tsx`,
`scripts/demo-agent-run.cjs`, `docs/MILESTONE3_PLAN.md`,
`docs/MILESTONE3_DEMO.md`, `docs/MILESTONE3_REPORT.md` (this file).

Modified (11, +1203/−7): `electron/ipc/agent.ipc.cjs`,
`electron/preload.cjs`, `src/electron.d.ts`, `src/app/App.tsx`,
`src/components/activity-registry.ts`, `src/styles/app.css`,
`src/utils/session-restore.ts`,
`electron/ipc/ipc.integration.test.cjs`,
`electron/wiring.test.cjs`, `package.json` (test manifest),
`docs/ARCHITECTURE.md`.

No Milestone 1/2 feature was removed or altered in behavior; all
their suites pass unmodified (regression, §5).

## 4. Security review

- Approvals are enforced main-process-side: single-use ids,
  re-reviewed policy verdicts, re-validated repair cycles. Forged
  ids fail closed (tested).
- Deny-class commands cannot be approved by any path; compound
  shell is denied rather than split (no model-shell parsing).
- Git writes, installs, publishing, deploys, and network tools are
  unreachable for agent commands; the runner never calls git-write
  or installer APIs. No auto commit/push.
- All edits flow through `applyEdits`/`applyRepair` (containment,
  freshness, conflict, checkpoint, rollback). Out-of-scope proposal
  edits are dropped with an event, never applied. User modifications
  made after a proposal refuse loudly; nothing is overwritten
  (tested).
- Context respects exclusions and secrets; run events, stored
  command output, and memory notes are redacted and bounded.
  Repository content and research findings are framed UNTRUSTED in
  every model prompt.
- Bounded: run/research budgets, inherited subtask/edit/command
  caps, unchanged repair caps (2 attempts, 10 minutes), revision
  cap (2), run-store pruning (20 terminal runs).
- Renderer compromise buys nothing: every privileged step
  re-validates in the main process.

## 5. Test counts and results

Backend (`npm test`): **756 tests, 751 pass, 0 fail**,
5 skipped (pre-existing Windows symlink/junction privilege
conditions in security/chat-store suites, unrelated). One full-run
attempt during this fix aborted without printing a summary and
passed on immediate retry with zero assertion failures; two
subsequent consecutive full runs were green, matching a transient
first-run-after-edits pattern also observed once during the
milestone (no test failure was ever reported).
New suites: tool-policy (13), understanding (6), run-summary (7),
autonomous-run (20: full approve-path completion, forged/double
approval, reject, revise, command approve/decline/deny, repair
approve/decline, stale-context refusal, out-of-scope drops,
verify-only checks, parked/in-flight cancel, pause/resume,
research fail/required-fail/completed-handoff, list/validation),
plus IPC allowlist + auth/validation coverage and wiring rows.

Renderer (`npm run test:renderer`): **11 files, 97 pass, 0 fail**,
including 10 new AgentWorkspace tests (composer/send/Ctrl+Enter,
plan/command approvals citing ids, revise gating, timeline, checks
with output, result, diff expansion, stop, failure/interruption
states).

Gates: `npx tsc -b` ✓ · `check:syntax` (192 files) ✓ ·
`check:test-manifest` (80/80) ✓ · `check:workbench` ✓ · `build` ✓
(pre-existing chunk-size warning only) · `pack` ✓ ·
`check:release` ✓ (3991 asar entries).

Live Meta API (key present in project `.env`, value never logged):
a real end-to-end run completed with `VERIFICATION=verified`
(1 check passed, exit 0, fix confirmed on disk). An earlier live run
completed `partially-verified`, which exposed and then verified the
fix for verify-only subtasks (§7). Scripted demo exits 0.

Manual GUI: the packaged app was built and release-checked, but an
interactive walkthrough was not possible in this environment
(launching the Electron GUI hangs headless; no display automation
is available). Renderer tests, typecheck, build, and the packaged
release gate substitute; reviewer walkthrough steps are in
[MILESTONE3_DEMO.md](MILESTONE3_DEMO.md) (Option C).

## 6. Demo instructions

- Scripted (no key): `node scripts/demo-agent-run.cjs --scripted`
  — full loop on a generated fixture, exit 0 iff verified.
- Live (needs `MODEL_API_KEY`): `node scripts/demo-agent-run.cjs
  --live` — real model, stdin approval gates.
- GUI: open the Agent destination, send a task, approve the plan,
  watch the timeline/checks/result. Full steps in
  [MILESTONE3_DEMO.md](MILESTONE3_DEMO.md).

## 7. Known limitations

- Verify-only subtasks run their checks (fixed this milestone),
  but a subtask whose verification prose names no runnable command
  stays manual-pending by design.
- Interrupted (restart/crash) mid-flight runs are cancel-only;
  completed work survives, but the run itself cannot resume
  mid-phase (same rule as repair/orchestration runs).
- Command output tails (6 KB) persist per check; full logs live in
  the process-local observed-run registry.
- `npx`/`deno`/`bun`/`exec` and bare script runs always need
  explicit approval (remote-fetch risk) — one click per command.
- Research `auto` mode relies on the analysis call's research
  verdict; `required` fails the run if research fails.

## 8. Fix: empty chat history no longer fails planning

Real-world validation reproduced a planning failure: with "Include
recent chat" enabled and no chat history, the run failed with
`Run failed (planning): No chat history to include.`

Root cause: `buildChatExcerpt()` throws on empty history by design
(explicit requests must never silently degrade). The autonomous
planning phase passed the checkbox straight through to
`buildImplementationPlan`, so the throw became a fatal run error.

Fix (minimal, behavior-preserving):

- `context-snapshot.cjs`: `buildChatExcerpt({ required: false })`
  resolves empty history to `null` — never a fabricated excerpt —
  while genuine retrieval failures still throw.
  `buildContextSnapshot` accepts `chatRequired` (default strict).
- `plan-builder.cjs`: `buildImplementationPlan` accepts
  `chatRequired` (default strict, so the explicit IntelligenceHub
  path is unchanged) and returns `chatOmitted`.
- `autonomous-run.cjs`: planning passes `chatRequired: false` and
  emits `No recent chat history available; continuing without chat
  context.` when the flag reports an omission. The checkbox
  preference is preserved; nothing auto-disables it. Genuine
  retrieval failures still fail the run in `planning` per the
  existing error taxonomy.
- No renderer, provider, approval, or security-gate changes.

Regression tests (11 new, all passing): snapshot level (optional
omit, optional omission without invented sources, optional
unexpected-failure throw), planner level (strict still throws +
flag validation, optional omit with no fabricated chat block,
optional grounding on real history incl. stored snapshot, no
omission when unrequested), run level (enabled+empty completes
with the timeline event and preserved preference, enabled+present
grounds the decomposer, disabled emits no event, genuine failure
fails in `planning` per taxonomy without an omission event).

Acceptance evidence: full backend suite 756 tests / 751 pass /
0 fail (745 before this fix, +11 regression tests), renderer 97
pass unchanged, `tsc`, syntax (192 files), manifest (80/80),
workbench, build, pack, and release gates green. Approval,
execution, cancellation, recovery, and security-gate suites all
pass unmodified.

## 9. Remaining risks

- Long model-call chains on large tasks: mitigated by per-subtask
  progress events, cancellation, budgets, and repair/revision caps,
  but very large tasks may still need splitting by the user.
- Approval fatigue on command-heavy plans: mitigated by
  plan-level approval covering listed review-class checks.
- Model-proposed verification prose occasionally names unrunnable
  commands; these surface as manual-pending, never green.
- Live-provider behavior beyond the verified happy path (rate
  limits, model drift) is exercised only through the transient
  classification and existing provider suites.
