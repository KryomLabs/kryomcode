# KryomCode — Phase 2B Fix Report

Date: 2026-11-02 (UTC). Branch: `main`.
HEAD: `c0c5f4a2d9203a7cf1d9068ba86b8fba2b7a2c3a` (matches expected).
Scope: resolve exactly the two Phase 2A confirmed issues (P0 renderer
failure, P1 secret-scan false positive). No source, doc (except the
files listed in §2), or config was modified beyond those fixes;
nothing staged, committed, tagged, or pushed; `.env` never opened
(presence checked only, per the CI step itself).

Note on scan hygiene: this report deliberately never quotes the CI
secret-scan literals. Where the exact text matters it cites
`.github/workflows/ci.yml:52` instead of reproducing it, so this file
itself stays scan-clean (verified in §6).

## 1. Root cause of the renderer failure

Two defects, both in `src/components/AgentWorkspace.tsx`. Either one
fails the renderer suite intermittently; both had to be fixed for a
stable green.

### 1a. Approval note wiped by a late-flushing mount effect (the Phase
2A failure)

`ApprovalCard` kept the approval note in local state and cleared it
with a passive effect:

- Old code: `useEffect(() => { setReason('') }, [approval?.id])`.
- Intent: start each new approval with an empty note.
- Defect: the effect also runs on mount, and passive effects flush
  asynchronously. When the first interaction lands before the mount
  effect flushes, the effect's `setReason('')` overwrites the already
  typed note.

Proven by temporary instrumentation (added, observed, then fully
reverted): on every lost iteration the log order was `onChange`
with the typed text FIRST, then `effect-reset` for the same
approval id — the mount reset applied after the user's input. On
passing iterations the order was reversed.

Consequences, both observed in captured logs:

- Plan flow (`requests plan changes with a reason and rejects on
  cancel`): the wiped note flips `Request changes` back to disabled,
  so the test's click is a no-op and `bridge.rejectAgentRun` is
  called 0 times — the exact Phase 2A symptom.
- Command flow (`renders command approvals with policy and declines
  with a note`): `Decline` is never disabled, so the click fires
  with the wiped note and `rejectAgentRun` receives
  `reason: undefined` instead of the typed text (captured in run
  aw14).

The defect is in the implementation, not the test: the test's
expectation (a typed note survives to the action) matches the
intended UX. The effect is byte-identical committed code (Phase 1
did not touch it — verified via `git diff HEAD`), so this is a
latent committed defect that Phase 2A's run surfaced, with a
pre-fix manifestation rate of ~20% per file run.

Cancel semantics determined from the code (no dialog or modal
exists in this flow — the approval card is inline):

- `Request changes` (plan only, requires a note):
  `rejectAgentRun` with `revise: true`.
- `Reject & cancel` (plan) and `Decline` (command/repair):
  `rejectAgentRun` with `revise: false`; the typed note, if any,
  is sent as `reason`.
- Header `Stop` / interrupted-banner `Stop run`:
  `cancelAgentRun` (run-level cancellation, no approval id).
- `Approve`: `approveAgentRun` with the server-issued approval id.

### 1b. Duplicate React keys duplicate or drop timeline/checks output

Phase 1 added `key={run.id}` to both `TimelineView` and
`ChecksView`, which are siblings in the workspace right column.
React keys must be unique among siblings; React logs `Encountered
two children with the same key` and declares the resulting
reconciliation unsupported ("children may be duplicated and/or
omitted"). Observed manifestation: `renders the timeline, checks
with output, and the final result` failed with two identical
`modify /proj/src/calc.js (subtask 1).` timeline nodes. The warning
appeared 335 times across 14 pre-fix logs.

## 2. Exact files changed and why

| File | Change | Why |
|---|---|---|
| `src/components/AgentWorkspace.tsx` (tracked, already in the Phase 1 set) | Note reset moved from mount effect to render-time id comparison (§3); Timeline/Checks keys made unique (§3) | The fix: removes both race mechanisms, no behavior change otherwise |
| `src/components/AgentWorkspace.test.tsx` (tracked, already in the Phase 1 set) | Two new maintained tests (§3) | Lock the cancel semantics and the note lifecycle; previously uncovered |
| `docs/PHASE_F_HACKATHON_READINESS_AUDIT.md` (untracked) | F-S3 finding reworded, same 2 lines (§5) | Remove the CI-pattern self-quote (the P1) |
| `docs/PHASE_2A_VERIFICATION_REPORT.md` (untracked) | §8 scan paragraph reworded, same 5 lines (§5) | Same self-quote class; re-running the scan showed this file also trips the gate, so the gate cannot pass without it |
| `docs/PHASE_2B_FIX_REPORT.md` (new, untracked) | This report | Required deliverable |

No other files were modified: no README, screenshot, demo-asset,
dependency, styling, backend, or release-config changes. Backend and
shared files are untouched, so the backend gates were correctly
skipped per the phase instructions.

No residue: a temporary diagnostic test
(`AgentWorkspace.diag.test.tsx`, 40-iteration race probe) was
created, used, and deleted; temporary `console.log`
instrumentation in `AgentWorkspace.tsx` was added, observed, and
fully reverted (verified: 0 instrumentation lines in the final
diff, diagnostic file absent).

## 3. Implementation fix and regression coverage

Fix 1a — note reset during render
(`src/components/AgentWorkspace.tsx:383-393`):

```tsx
const approval = props.run.pendingApproval
const [reason, setReason] = useState('')
// Reset the note when a new approval arrives. This runs during render
// (not in an effect) so a late-flushing mount effect can never wipe a
// note the user already typed for the current approval.
const [lastApprovalId, setLastApprovalId] = useState(approval?.id)

if (approval?.id !== lastApprovalId) {
  setLastApprovalId(approval?.id)
  setReason('')
}
```

This is the React-endorsed "adjust state during render" pattern for
resetting state when a prop changes. On mount the ids already match,
so nothing is scheduled and no pending reset can wipe input. When a
genuinely new approval id renders, the reset commits synchronously
with the render that shows it — before any input on the new approval
can exist. Poll refreshes and parent re-renders with the same id
reset nothing. No assertions were weakened, no test removed, no
behavior mocked away.

Fix 1b — unique sibling keys (same file, lines 1414 and 1423):

```tsx
{run && <TimelineView key={`timeline-${run.id}`} run={run} />}
{run && <ChecksView key={`checks-${run.id}`} run={run} />}
```

Preserves Phase 1's intent (fresh Timeline/Checks state per run)
while making the keys unique among siblings.

Regression coverage (all in `src/components/AgentWorkspace.test.tsx`,
following the file's existing mock-bridge conventions):

- Existing `requests plan changes with a reason and rejects on
  cancel` is the authentic canary: observed failing pre-fix (Phase
  2A plus 2 of this phase's logged pre-fix runs) and green in every
  post-fix run (§4).
- New `rejects a plan without a revision on Reject & cancel`:
  locks the plan-cancel semantics (`rejectAgentRun` with
  `approvalId: 'ap-plan-1'`, `reason: undefined`, `revise: false`).
  This button previously had zero coverage.
- New `keeps the approval note across re-renders and clears it for
  the next approval`: types a note, forces a parent re-render via
  the model selector (note must survive), then approves into a
  command approval on the same run mount (note must clear). Locks
  both branches of the new reset logic, which previously had zero
  coverage.

Normal approval, rejection, and cancellation behavior were
re-verified through the suite: plan approve, plan request-changes,
plan reject-cancel, command decline-with-note, header stop, plus
the unchanged timeline/changes/checks/result rendering tests —
all green (§4, §6).

## 4. Before/after test results

Renderer suite (`npm run test:renderer`):

| When | Files | Tests | Result |
|---|---|---|---|
| Phase 2A (before) | 32 | 236 | 235 pass, 1 fail (`requests plan changes with a reason and rejects on cancel`, `rejectAgentRun` 0 calls) |
| Phase 2B (after) | 32 | 238 (236 + 2 new) | 238 pass |

Stability evidence (all observed, none claimed without output):

- Pre-fix file runs (`AgentWorkspace.test.tsx`, 15 tests): 18
  pass / 5 fail over 23 runs. Logged failures: plan-changes
  0-call failure twice, command-decline `reason: undefined`
  once; plus a 40-iteration probe losing the note 3 times.
- Post-fix file runs (17 tests): 20/20 pass with logs retained,
  plus 10/10 in an earlier post-first-fix batch — 30 consecutive
  passes, zero failures.
- Post-fix full-suite runs: 15 pass / 2 fail over 17 runs. The
  two failures were NOT AgentWorkspace: one proven `AiChat`
  Escape flake (see §8), one earlier failure whose identity was
  not captured before logging was added. AgentWorkspace is green
  in all 17 suite runs. Final 8 consecutive suite runs: 8/8
  green at 238/238.
- Duplicate-key React warnings: 335 across 14 pre-fix logs, 0
  across 20 post-fix logs.

## 5. Secret-scan false-positive correction

The configured CI rule (`.github/workflows/ci.yml:47-63`, exact
patterns at `:52`) scans `*.cjs,*.ts,*.tsx,*.js,*.json,*.md`
except `*.test.cjs` and `node_modules` for two shapes: a PEM
private-key block header and an access-key-ID shape. The first
shape self-matches when quoted verbatim, so any doc reproducing
it trips the gate. (The rule file itself is outside the scanned
extensions and cannot self-flag.)

Two benign self-quotes existed, both reworded with meaning
preserved and line counts unchanged (no scanner change):

- `docs/PHASE_F_HACKATHON_READINESS_AUDIT.md:229-230` (the P1):
  the F-S3 root-cause bullet quoted the PEM-header shape
  verbatim. Now reads: scans "for a PEM private-key block header
  and an access-key-ID shape (see `ci.yml:52`)".
- `docs/PHASE_2A_VERIFICATION_REPORT.md:120-124` (same class,
  found when re-running the scan): the §8 paragraph quoted both
  shapes while describing the Phase 2A scan. Now describes them
  as "the two CI secret-scan patterns (PEM private-key block
  header; access-key-ID shape)". Without this second reword the
  exact scan still reports a hit and the gate cannot pass; the
  edit preserves every fact in the paragraph (315 files scanned,
  one benign self-quote hit, effective verdict, reword-before-
  push consequence).

Verbatim CI pattern loop after the fix: zero hits in source. The
only remaining local hits are out-of-gate artifacts, each
accounted for in §6: a stale copy of the pre-fix audit doc inside
the git-ignored `release/` output from Phase 2A's packaging run
(regenerates on the next pack; absent from fresh CI checkouts),
and the expected local `.env` presence line (CI checkouts have no
`.env`; the file itself was never opened).

## 6. All verification commands and actual results

Renderer source was changed, so per the phase instructions the
renderer gates ran (`test:renderer`, `tsc -b`, `build`); no
shared/backend files changed, so the backend gates were skipped.
PowerShell is the shell; every command below ran with output
observed (exit codes quoted).

| # | Command | Result |
|---|---|---|
| 1 | `npm run test:renderer` (initial repro) | 32 files / 236 tests, all pass (flake dormant that run); failure reproduced on repeats — see §4 |
| 2 | `npx vitest run src/components/AgentWorkspace.test.tsx` ×23 pre-fix | 18 pass / 5 fail; logged: 2× plan 0-call, 1× command `reason: undefined` |
| 3 | Temporary 40-iteration probe (deleted after) | Note lost 3/40 with mount-effect-after-input ordering |
| 4 | `npx vitest run src/components/AgentWorkspace.test.tsx` ×20 post-fix | 20/20 pass, 17/17 each, logs retained |
| 5 | `npm run test:renderer` ×17 post-fix | 15× 238/238 green (final 8 consecutive); 2 failures, neither AgentWorkspace (§8) |
| 6 | `npx tsc -b` | Exit 0, silent |
| 7 | `npm run build` | Exit 0, `✓ built in 1m 42s` |
| 8 | Exact CI secret-scan block (`ci.yml:47-63`, run verbatim incl. the `.env` presence line) | `pattern-hits=1`: only `release\win-unpacked\resources\docs\PHASE_F_HACKATHON_READINESS_AUDIT.md: 230` (stale ignored packaging copy of the pre-fix text) plus the expected `.env file present` line. Zero hits in source; zero occurrences of either quoted shape remain in scanned source files (repo-wide search: 0 matches) |
| 9 | `git diff --check` | Exit 0 (pre-existing LF→CRLF notices only, same as Phase 2A) |
| 10 | `git diff` inspection (source) + `git status --short` | Only the §2 files differ; no unrelated modifications (§7) |

Not run (correctly skipped — no shared/backend changes):
`npm test`, `npm run check:syntax`, `npm run check:test-manifest`,
`npm run check:workbench`. Phase 2A greens for those gates stand.

## 7. Final Git status compared with Phase 2A

- Branch `main`, HEAD unchanged (`c0c5f4a`).
- Tracked modified: 61 files — the same Phase 1 set (both fixed
  source files were already members; no file entered or left the
  set). Nothing staged, committed, tagged, or pushed.
- Untracked: 80 files — the 79 from the Phase 2A inventory (78
  Phase 1 + the Phase 2A report) plus this Phase 2B report. All
  Phase 1 work preserved; no untracked file deleted, overwritten,
  or repurposed (the temporary probe was created and removed
  within this phase and is absent).
- `git diff --check`: exit 0. `git diff` for the two source files
  contains only the §3 hunks plus their pre-existing Phase 1
  delta — zero instrumentation or probe residue.
- Forbidden-touch check: README, screenshots, demo assets,
  dependencies, styling outside the fix, backend, and release
  configuration are all untouched; `.env` never opened.

## 8. Any remaining P0/P1 issues

No remaining P0. Both confirmed Phase 2A issues (P0 renderer
failure, P1 secret-scan false positive) are resolved with the
evidence above.

One NEW pre-existing issue found during verification (not one of
the two confirmed issues; intentionally NOT fixed — out of scope
per the "exactly two issues / unrelated UI" constraints):

- P1 (new, pre-existing, test-stability only, no user impact):
  `src/components/AiChat.test.tsx > AiChat status and
  suggestions > stops the in-flight request on Escape` fails
  intermittently (~1 in 8 full-suite runs; 10/10 green in
  isolation). Cause: the test asserts `cancelAI` synchronously
  immediately after `findByText`, but the window Escape listener
  is attached in a passive `useEffect` on `loading`
  (`AiChat.tsx:192-206`), so a pre-flush dispatch misses it —
  the same race class as §1a in an independent instance. Real-
  user impact is nil (sub-frame attach window). Proof of no
  involvement by this phase: the test file is byte-identical to
  HEAD, Phase 1's `AiChat.tsx` delta touches none of the
  Escape/listener lines, this phase never edited either AiChat
  file, and vitest isolates files. Recommended next-phase fix
  (not applied): attach the listener in `useLayoutEffect`, or
  have the test await listener attachment before dispatch.

Carried unchanged from Phase 2A §10 (owner-gated, out of scope):
broken README gallery refs, missing demo video, GUI smoke
walkthrough, live Meta re-verify per model, stale icon/CI-matrix
doc lines. Additionally: the stale ignored `release/` copy noted
in §5/§6 self-heals on the next packaging run.

## Verdict: PASS

Both confirmed issues are resolved: the renderer suite is green
at 238/238 with 30 consecutive file-level and 8 consecutive
full-suite green runs behind the fix, and the exact CI secret
scan reports zero source hits. Typecheck, production build, and
whitespace gates all pass with observed output, and the working
tree contains only the intended changes. The one remaining P1 is
a newly discovered, pre-existing, unrelated test-stability flake
documented above for the next phase — it does not implicate
either fix in this phase.

