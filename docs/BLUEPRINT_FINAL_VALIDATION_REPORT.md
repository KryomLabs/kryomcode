# KryomCode — Blueprint Final Validation Report

Scope: documentation and validation milestone only. No UI was implemented,
no application code was modified, no phase was started.

Documents read in full: `docs/UI_UX_AUDIT.md`,
`docs/UI_UX_REDESIGN_BLUEPRINT.md`,
`docs/TERMINAL_UX_AND_ARCHITECTURE_AUDIT.md`,
`docs/PHASE_0_1_IMPLEMENTATION_REPORT.md`, and the supplied
`docs/UNIFIED_UI_UX_BLUEPRINT.md` (15 sections). Source spot-checks:
`electron/menu.cjs` (accelerators), `electron/main.cjs` (window),
`src/components/ActivityBar.tsx`, `activity-registry.ts`, `Chrome.tsx`,
`AiChat.tsx` / `MetaAIWorkspace.tsx` / `AgentPanel.tsx` /
`ResearchPanel.tsx` (caps), `src/state/meta-sessions.ts`,
`src/utils/session-restore.ts`, `src/electron.d.ts` (`KryomSettings`),
`electron/services/agent/agent.service.cjs` (`applyEdits`),
`checkpoint-store.cjs` (`undoCheckpoint`), `plan-store.cjs`
(`executionRunId`), `settings.service.cjs`, `project-intelligence.ipc.cjs`,
`MarkdownLite.tsx` (`onCitation`), `src/hooks/useAgentRun.ts`.

## 1. Overall blueprint assessment

The supplied blueprint is technically consistent in direction and
architecture: one shell, one activity bar, one AI workspace with three
modes, one shared agent engine, Phase 0/1 token foundation reused rather
than replaced. Validation found no fatal flaw and no requirement that had
to be weakened. It found 12 corrections — one missing gate (Phase 0+1
verification precondition), one oversized phase (D split into D1/D2),
three over-asserted backend claims (composer caps, per-hunk revert, Debug
Console source), two registry/id imprecisions (aside area, Settings not a
registry id), one unspecified key fate (Ctrl+Shift+M), one storage design
passed over too quickly (thread record), and three precision fixes
(virtualization threshold, <900 reachability, A/D guard). All are
integrated into the final blueprint with [OPEN DECISION], [FUTURE
BACKEND], and [VERIFY-LIVE] markers. Verdict: READY as the authoritative
implementation specification, conditional on the Phase 0+1 gate in §11.

## 2. Sections reviewed

All 15 sections of the supplied blueprint, plus cross-checks against all
four prior documents and the source files listed above. Checklist from the
task (navigation, panel ownership, mode responsibilities, thread model,
agent boundaries, runCommand/pty separation, tokens, Monaco/type,
shortcuts, dimensions, IPC/settings/restore, security, a11y/perf) — each
item inspected; findings below.

## 3. Technical inconsistencies discovered

1. Missing gate: the supplied §11 required green suites per phase but never
   stated that Phase 0+1 itself is unrun and must go green FIRST. The
   report is explicit (0 passed / 0 failed / 7 skipped). Starting Phase A
   on an unverified foundation risks misattributed failures.
2. Phase D oversized: bottom reorg + Git move + editor tabs + resize
   hardening + xterm T1 in one phase is two shippable units (integration
   vs. new dependency + renderer).
3. Composer cap over-unified: the supplied §5 implied one 12,000 cap. Code
   has four: chat/meta 12,000, agent task 4,000 (countered), research
   objective 2,000 (countered), context 18,000/4,000. Unifying them
   silently would change agent/research behavior.
4. Per-hunk revert over-asserted: pre-apply per-edit approve IS supported
   (`applyEdits` applies only the passed set, stops between edits, rolls
   back). Post-apply selective revert is NOT: `undoCheckpoint` is
   checkpoint-level in reverse edit order. The supplied §6/§14.C claimed
   both.
5. Debug Console source unspecified: "thin tab over existing paths" names
   no feed. Candidates exist (diagnostics output, output-log, future
   adapter) with different backend implications.
6. Registry area gap: the supplied §4.B assigned right-panel destinations
   to the registry, but `AREAS` has only sidebar/panel/center/action —
   no right-panel area. Also listed Settings as a registry id with a
   "modal" area; Settings is a hardcoded pinned shell button
   (`ActivityBar.tsx` `onOpenSettings`).
7. Ctrl+Shift+M fate unspecified: menu binds it to "New Meta AI session
   tab". The supplied key story repurposed Ctrl+Shift+A but left M
   dangling across the tab-kind retirement.
8. Thread-record storage glossed: pieces live in three homes (renderer
   localStorage v1 versioned store, main-process chat store, backend
   `.kryom/` records). "One thread record" needs an explicit storage
   decision with constraints, not an assertion.
9. Virtualization threshold unreachable: "past ~200 events" vs
   `meta-timeline` MAX_EVENTS=100 (slice(-100)). Threshold and cap must be
   decided jointly.
10. <900 row overstated: `minWidth 900` makes <900 unreachable via normal
    chrome; behavior there is robustness spec, not a supported viewport.
11. A/D approval keys unguarded: firing while focus sits in a text field
    would hijack typing. Guard required.
12. `panelRightWidth` contradiction: listed for removal while the AI panel
    needs a persisted width defaulting to the same 360. Migration beats
    removal.

Verified SOUND (no correction): 18k/4k context caps; 12k chat caps;
shortcut non-collisions (X/K/H, Ctrl+comma, Ctrl+Alt+N free);
symbol IPC exists (renderer slice only); citation plumbing exists;
observed-run verification; origin-scoped cancel; runCommand/pty
separation; token authority; 900-edge overlay arithmetic.

## 4. Corrections made, with file references

All corrections integrated into
`docs/UNIFIED_PROFESSIONAL_IDE_UI_UX_BLUEPRINT.md` (the prior
`docs/UNIFIED_UI_UX_BLUEPRINT.md` is left untouched):

- C1 (§11, §12 risk 10, §14): binding Phase 0+1 verification gate +
  bisection rule + kill criteria. No phase starts on red.
- C2 (§2.8, §5 composer, §9, §10, §14.B): per-mode caps as kit props
  (12,000 / 4,000 / 2,000 / 18k+4k) with code citations; unification
  marked [OPEN DECISION] (D2).
- C3 (§9.4, §9.9, §9.11, §14.C): per-hunk Approve/Reject pre-apply kept
  (cited); post-apply selective revert marked [OPEN DECISION] (D3).
- C4 (§4.F, §9.12, §10, §11.D1, §14.D1): Debug Console source marked
  [OPEN DECISION] (D4) with three candidates; candidate (c) flagged
  [FUTURE BACKEND].
- C5 (§3, §4.B, §10, §11.A, §14.A, §15): registry holds 8 ids (kept
  `git`/`run` stable ids, area→sidebar); new `aside` area as a Phase A
  dependency; Settings stays a pinned shell button + Ctrl+,.
- C6 (§4.B key table, §9.4, §11.A/C, §14.A): key-transition table —
  Ctrl+Shift+M unchanged-then-rebound, Ctrl+Alt+N reserved-then-alternate.
- C7 (§5 engine, §9.5, §11.B, §12): thread-record storage marked
  [OPEN DECISION] (D1) with three-home analysis, binding constraints,
  two candidates, kickoff decision, backup/restore rollback.
- C8 (§6 timeline, §10, §11.C, §13, §14.C): MAX_EVENTS + threshold joint
  review in Phase C.
- C9 (§8 table + note): <900 marked [VERIFY-LIVE], scoped to
  zoom/DevTools robustness.
- C10 (§4.B key table, §6, §14.C): A/D guard (card focused AND not in a
  text field).
- C11 (§4.E, §8, §10, §11.E, §12, §14.B/E): `panelRightWidth` →
  `panelAiWidth` migrate-once + read-compat + drop-in-E.
- C12 (§2.7, §5 states, §11 S1 track, §12, §13): streaming transport
  explicitly [FUTURE BACKEND] (F1); S1 given its own track outside the
  A–E gates. Symbol `@` mode clarified as renderer slice +
  [VERIFY-LIVE] coverage (NOT future backend).
- C13 (header): full document-control block per §6 of the task; Phase 1
  values labeled REPORTED; implementation status NOT STARTED.

No product requirement was removed or weakened; §12 lists all six open
decisions and three future-backend items in one place.

## 5. Open decisions

- D1 (§5): thread-record storage — (a) three homes + unifying index vs
  (b) one main-process store. Decide at Phase B kickoff.
- D2 (§5): composer cap unification — keep per-mode caps vs unify.
- D3 (§6): selective per-hunk post-apply revert — extend
  `undoCheckpoint` with entry filter vs file-level restore flow. Decide
  at Phase C kickoff.
- D4 (§4.F): Debug Console data source — diagnostics feed vs output-log
  channel vs future adapter. Decide in Phase D1.
- D5 (§12): Settings-as-JSON-behind-UI timing — Phase E or later.
- D6 (§12): Git placement default if user testing splits — default
  sidebar.

## 6. Future backend dependencies

- F1: AI streaming transport (`ai:stream` IPC + provider SSE +
  progressive render, S1 track). Nothing in A–E gates on it.
- F2: node-pty interactive shells (separate future milestone). D2 ships
  honestly without it; D2 acceptance asserts NO node-pty in
  `package.json`.
- F3: Debug Console feed ONLY if candidate (c) wins D4.
- Explicitly NOT future backend: symbol palette mode, citation chain,
  per-hunk pre-apply review, MAX_EVENTS review (all exist or are
  config/UI).

## 7. Roadmap dependency assessment

Sequence validated with two changes: the Phase 0+1 gate is now an
explicit binding precondition, and Phase D is split into D1
(integration, no new deps) and D2 (xterm, pure-JS dep). Final order:
0+1 gate → A (shell, palette, aside area) → B (workspace, Composer,
thread record) → C (agent console, kit, retirements) → D1 (bottom,
Git move, editor tabs) → D2 (xterm T1) → E (polish, deletions) →
futures (pty, S1) independently. Every phase is independently
verifiable with its own §14 gate; removals always trail replacement
verification; rollback exists for both migrations (thread backup
restore, settings read-compat). No phase starts in this milestone.

## 8. Security and backward-compatibility assessment

Preserved without exception: sandbox + contextIsolation + method
bridge; trusted-sender checks; approval double-gate with main-side
re-validation; origin-scoped cancellation (terminal/diagnostics/agent
+ structural git isolation); observed-run verification; per-edit
approved-set apply with rollback; secret scrubbing; tree-kill;
shutdown reaping; no auto-run into shells; agent permanently barred
from `pty:*`. No phase weakens any of these; every gate re-runs the
security-adjacent suites plus the live two-tenant cancel test.
Backward compat: stored keys versioned-or-kept, IPC shapes additive,
legacy activity ids fall back to Explorer. No mock UI replaces real
backend anywhere; the streaming seam resolves real blocks until S1.

## 9. Acceptance-criteria completeness

§14 covers every phase (A, B, C, D1, D2, E) with checkbox criteria
that are objectively testable: exact pixel/keyboard/persistence
assertions, named suites, named screenshots, a repeated manual
journey, and kill criteria. Each criterion traces to a §4–§9
requirement. §15 requires real captures on implementer hardware for
every claim. Gaps closed in this pass: per-mode counters, A/D guard,
aside registration, panelAiWidth persistence, xterm-without-pty
assertion, migration restore rehearsal. Residual: criteria can only be
executed on a working machine (none executed here — sympathique with
the environment, stated plainly).

## 10. Remaining risks

R1: Phase 0+1 suites may fail on first run (unrun code + new tests) —
    contained by the gate + bisection rule, but schedule must allow it.
R2: Thread migration (D1) is the highest-loss-risk change — contained
    by backup/restore rehearsal + legacy fallback, decided at kickoff.
R3: Shortcut/behavior churn (Enter-send, repurposed A) — contained by
    kept alternates + setting + pointers, but needs release-note care.
R4: No runtime evidence exists for ANY prior claim (three consecutive
    no-shell sessions) — first GUI run may surface audit-blind issues;
    §11 kill criteria + per-phase screenshots are the backstop.
R5: node-pty/Electron-45 compat (future) — scheduled late with T1
    value already shipped; runtime fallback specified.

## 11. Final readiness recommendation

READY to become the authoritative implementation specification:
[UNIFIED_PROFESSIONAL_IDE_UI_UX_BLUEPRINT.md](UNIFIED_PROFESSIONAL_IDE_UI_UX_BLUEPRINT.md).
Do not start Phase A until (a) explicit user approval, and (b) the
Phase 0+1 gate runs green. Resolve D1 at Phase B kickoff, D3 at Phase
C kickoff, D4 in Phase D1; D2/D5/D6 are non-blocking.

Scores (justified, not inflated):

- Product architecture: 9/10. One shell, one engine, three modes is
  coherent and fully traced to existing systems; −1 because the thread
  record's storage home is still undecided (D1) at the core of the
  design.
- UI/UX consistency: 9/10. Single navigation idiom, one composer kit,
  one token graph, per-mode contracts precise; −1 for the two
  deliberately deferred UX contracts (Debug Console source, cap
  unification).
- Technical feasibility: 8/10. Every A–E requirement traces to
  existing code or pure-presentation work; −2 because nothing has run
  (three sessions, zero executed suites) and Phase C/D1 carry the
  largest extraction risk.
- Security and backward compatibility: 10/10. All gates preserved
  byte-for-byte in behavior, agent/pty separation absolute, migrations
  versioned with rollback; nothing in the blueprint weakens a control.
- Roadmap clarity: 9/10. Gated, ordered, split, kill-criteria-bound
  phases with explicit dependencies; −1 because effort estimates were
  (correctly) not invented without runtime calibration.
- Acceptance-test completeness: 9/10. Objective, per-phase, traced
  criteria plus a full visual checklist; −1 because execution is
  impossible in this environment, so the criteria are reviewed, not
  trial-run.
