# Milestone 3 — Demo: Autonomous Coding Agent End to End

Reproducible scenario for the brief's example task:

> "Analyze this existing project, identify the cause of its failing
> tests, create a repair plan, review the affected files, implement
> the fix across all required files, run the relevant tests, repair
> any failures and provide a final verified summary."

The demo runs a real agent session against a generated `broken-calc`
fixture (a one-line arithmetic bug with a failing `node --test`
suite). Nothing is fabricated: the timeline, diffs, command output,
exit codes, and final summary all come from observed service calls.

## Option A — Scripted terminal demo (no API key)

Deterministic canned model answers; every other layer is real
(indexing, planning validation, apply gates, `npm test` execution,
observed-run verification, checkpoints, summaries).

```powershell
node scripts/demo-agent-run.cjs --scripted
```

Expected output (abridged):

- `[analyzing] Project understood: kryom-demo-… (node), 2 file(s) inspected…`
- `[planning] Plan built (…): 1 subtask(s)…`
- `[proposing] Subtask 1/1 proposed: 1 edit(s).`
- `--- APPROVAL (plan) ---` with the exact edit list (auto-approved
  through the real approval gate in scripted mode)
- `[executing] modify …/src/calc.js (subtask 1).`
- `[verifying] Subtask 1: \`npm test\` → passed (exit 0)…`
- `=== FINAL SUMMARY ===` with `Verification: verified` and
  `1 passed, 0 failed, 0 not executed, 0 manual-pending.`

Exit code is `0` only when the run completes verified. The fixture
lives under the OS temp dir; the repository is never modified.

## Option B — Live terminal demo (real Meta API)

Requires `MODEL_API_KEY` in the environment. The agent reasons for
real; every approval gate pauses for your decision on stdin.

```powershell
$env:MODEL_API_KEY = '<key>'
node scripts/demo-agent-run.cjs --live
```

At each gate the script prints the approval kind, the affected files
or the exact command with its policy reason, and asks:

- `y` — approve through the real gate
- `n` — decline (plan: cancels the run; command: records
  not-executed and continues; repair: fails the run honestly)
- `r` — plan only: reject with your reason and request a revision

## Option C — GUI walkthrough (Agent workspace)

1. Start the app (`npm run dev` or the packaged build) and open any
   project with a failing test (or generate the fixture with
   `node scripts/demo-agent-run.cjs --scripted` and open the printed
   temp path — apply the reverse of its fix to re-break it, or just
   describe a fresh task).
2. Open the **Agent** destination (activity bar, or the AGENT stage
   tab). Pick the model, attach context files if wanted, set
   Research (Auto/Off/Required), and Send (Ctrl+Enter works).
3. Watch the **Timeline** fill with real backend events
   (analysis → planning → proposals). No progress is invented: rows
   appear only when the backend persists them.
4. Review the **Execution plan** (numbered steps, files, risks),
   expand **Changes** to read per-file diffs, then **Approve**,
   **Request changes** (with a note), or **Reject & cancel**.
5. Approve any **command** gates after reading the exact command,
   the agent's stated purpose, and the policy reason. Deny-class
   commands never appear here — they are refused outright and
   recorded as not-executed.
6. Watch **Verification**: each check shows its conclusion, exit
   code, problem count, and captured output. A failing check opens a
   bounded **repair** cycle; each repair attempt needs approval and
   re-runs the same check.
7. Read the **Result**: what changed, check buckets
   (passed/failed/skipped/not-executed/manual-pending), remaining
   issues, and the suggested next step. `verified` appears only when
   every runnable check passed.

## What the demo proves

- Project understanding from bounded retrieval (inspected files are
  named; uninspected files are never claimed).
- Structured planning with validation criteria per step.
- A real execution loop with pause/resume/cancel and budgets.
- Multi-file edits through freshness, conflict, checkpoint, and
  rollback gates — concurrent user edits refuse loudly.
- Tool policy: review-class auto-runs only when plan-listed,
  approve-class parks with explanation, deny-class never runs.
- Tests executed for real with captured output and exit codes;
  failures analyzed, repaired within bounds, and re-verified.
- Research (Milestone 2 engine) transfers only as cited, untrusted
  reference material — visible in the timeline when enabled.
- Deterministic final summary that distinguishes verified,
  partially-verified, and unverified outcomes.

## Troubleshooting

- `Meta API key is not configured` — live mode needs the key
  (Settings → Providers in the app, or `MODEL_API_KEY` for the
  script). Scripted mode needs none.
- A run parked on `waiting_for_approval` is healthy: it is asking
  for a decision, not stuck. Approve, decline, or stop it.
- An `interrupted` banner after a restart is by design: completed
  work and checkpoints survive; stop the run and start a new one.
