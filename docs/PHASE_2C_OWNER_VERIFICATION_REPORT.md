# KryomCode — Phase 2C Owner Verification Report

Date: 2026-11-02 (UTC). Branch: `main`, HEAD `c0c5f4a`
(unchanged). No commits, pushes, tags, adds, resets, or cleans;
`.env` contents never opened (key presence checked via the app's
own presence-only API; live calls printed model/latency/length
booleans only). No video recording started.

Build under test: `release/win-unpacked/KryomCode.exe` from the
Phase 2A packaging run for the GUI launch checks. Note: that
packaging predates the Phase 2B renderer edits, so launch
evidence below covers the boot/shell path; the 2B renderer diff
itself is covered by the 238/238 suite, typecheck, and build
gates (see Phase 2B report). No dev-server (`npm run dev`) GUI
run was attempted: interaction is blocked regardless (see §1),
so a second boot path would add no evidence.

## 1. GUI smoke results (`docs/SMOKE_TEST.md`)

Capability boundary (applies to every BLOCKED row): this
environment has screenshot observation but no GUI input
automation, and blind SendKeys/mouse on the owner's shared
interactive desktop is unsafe (keystrokes could land in the
wrong foreground window). So: launch and quit are verified with
pixel evidence; every step requiring clicks, typing, or dialogs
is BLOCKED, not passed. Nothing below claims interaction that
did not happen.

Environmental finding: this shell exports
`ELECTRON_RUN_AS_NODE=1`, which makes every Electron launch
behave as plain node (packaged exe exited 0/9 within a second
with no window; dev electron ran `main.cjs` under system node).
All launches below unset that variable for the child process
only; no repo or system configuration was changed.

| Step(s) | Result | Evidence |
|---|---|---|
| 1 Launch (packaged) | PASS | PID 19244, main window `KryomCode`, stable 24 s+; screenshot showed the Discovery workspace (`What should we build…`, Chat/Research/Agent tabs, Explorer, `Muse Spark 1.3` picker) with no blank window and no error dialog |
| 42 Packed app (partial) | PASS with limits | Booted with 0 listeners on dev port 5173 (no dev server); window/taskbar icon visible; graceful close (`CloseMainWindow` exited, no force needed); 0 orphan `KryomCode` processes after quit. AI-status/vault half: NOT TESTED (needs interaction) |
| 1b–41 except 1/42 (all interaction: chat, agent plan/approve/reject/execute, research+citations, terminal, Git, settings, navigation, checkpoints, memory, Intel, Platform, diagnostics, updates, splits, tabs, conflicts) | BLOCKED | Exact reason: no GUI input capability (see boundary above). No disposable `kryom-smoke` fixture was created since no interactive step could run; the repo itself was never used as a smoke target |
| 43 Installer | NOT TESTED | Would install/uninstall system software and needs dialog interaction; out of bounds for this environment |
| 44–49, Offline editor check | BLOCKED | Same input boundary; offline check additionally requires toggling the owner's network, which was not attempted |

Per the smoke doc's recording table: 1–24: step 1 PASS, rest
BLOCKED; 25–29: BLOCKED; 30–36: BLOCKED; 37–43: step 42 partial
PASS, rest BLOCKED/NOT TESTED (43 NOT TESTED); 44–49: BLOCKED;
Offline editor: BLOCKED.

Temporary screenshots lived in the sandbox temp dir, were viewed
once for the launch verdict, and were deleted immediately after.
No smoke artifacts remain in the repo.

## 2. Individual Meta model results (live, redacted)

Method: the exact commands from
`docs/META_LIVE_VERIFICATION.md` "Exact next action". Presence
check via `getSecretSource` (prints `environment`/`vault`/
`missing` only). Live chats print model echo, latency, reply
length, and a marker boolean — never the key, never answer text.
Provider implementation and endpoint untouched.

- Key presence: `MODEL_API_KEY source=environment`
  (`TAVILY_API_KEY source=missing`, irrelevant to Meta chat).
- L1 `muse-spark-1.3`: PASS — 2026-11-02T09:08:32Z (14:38 IST),
  2915 ms, reply model echo `muse-spark-1.3`, 12-char reply,
  `KRYOMCODE_OK` marker present.
- L2 `muse-wonder-1.0`: PASS — 2026-11-02T09:08:39Z (14:39 IST),
  7131 ms, reply model echo `muse-wonder-1.0`, 12-char reply,
  marker present.
- No request failed; no error text to redact. No external-harness
  errors occurred, so no KryomCode-vs-harness confusion arose.
- L3 (agent plan), L4 (research synthesis), L5 (cancel/timeout
  paths), and all in-app keyed chats: NOT RUN — they need GUI
  interaction (§1 boundary).

Documentation updated with observed evidence only:
`docs/META_LIVE_VERIFICATION.md` L1/L2 matrix rows now record the
PASS lines above plus a dated Phase 2C addendum. Per that doc's
own rule (all of L1–L4 observed), its status line stays
CODE-VERIFIED ONLY.

## 3. Screenshot inventory and gallery link verification

All 20 PNGs in `docs/images/` inspected by file: valid PNG magic
on all 20, zero-byte files none, sizes match the selection
report's inventory exactly (post-rename byte check 20/20, §4).
Dimensions: 10 files are 1920×1080 and 10 are 1902×1071
(windowed captures) — minor correction to the selection report's
"1920×1080 throughout" line (report §E); content selection is
unaffected.

README main gallery (`README.md:118-152`): all 8 references
resolve to real files — 8/8 verified by `Test-Path` after the
renames (`01-main-workbench`, `02-meta-ai-chat`,
`03-agent-planning`, `05-research-workspace`,
`06-research-evidence-citations`, `07-integrated-terminal`,
`08-git-source-control`, `09-meta-model-configuration`).
Before the renames 0/8 resolved (all files still had timestamp
names), so the gallery is fixed by §4 with no README edit
needed. `04` and `10` remain intentionally absent (§5).

## 4. Completed verified screenshot renames

`docs/SCREENSHOT_SELECTION_REPORT.md` §D is the source of truth.
All 17 sources existed and all 17 destinations were absent, so
all 17 renames executed (moved=17, skipped=0). One adaptation,
forced by repo state plus phase constraints: the PNGs are
untracked, so `git mv` cannot apply to them (it refuses paths
outside version control), and staging via `git add` is forbidden
this phase — the renames were therefore executed as filesystem
moves with identical end-state filenames, and the files stay
untracked. Post-rename byte check: 20/20 sizes identical.

Gallery (8): `220503`→`01-main-workbench.png`,
`221424`→`02-meta-ai-chat.png`, `220943`→`03-agent-planning.png`,
`225508`→`05-research-workspace.png`,
`225620`→`06-research-evidence-citations.png`,
`221028`→`07-integrated-terminal.png`,
`221326`→`08-git-source-control.png`,
`221440`→`09-meta-model-configuration.png`.
Supplementary (9): `220626`→`editor-ai-workspace.png`,
`220845`→`agent-research-grounding.png`,
`220957`→`agent-error-state.png`, `221101`→`intel-runs.png`,
`225100`→`agent-code-answer.png`,
`225134`→`agent-verification-approval.png`,
`225551`→`research-sources.png`,
`225647`→`research-report-brief.png`,
`231253`→`terminal-output-log.png`.

The 3 removal candidates (`225012`, `225534`, `225603`) were
preserved exactly in place per instructions — not deleted, not
archived, not renamed. Total: 20/20 PNGs present.

## 5. Missing screenshot categories

Still missing, exactly as the selection report states (no
screenshots fabricated): `04-multi-file-code-changes` (no
diff/review capture) and `10-verification-results` (no clean
executed-results capture).

Can they be captured from the actual running application? Yes,
both — verified in code (capture itself needs the blocked GUI
interaction, so this is a code-verified YES, not a capture):

- `04`: `ChangesView` (`src/components/AgentWorkspace.tsx:714`)
  lists multi-file proposed/applied changes and expands each
  file into `DiffView`. Recipe: agent plan with 2+ edits across
  files → approve → expand two file diffs → capture.
- `10`: `ChecksView` (`:882`) renders executed check rows with
  verdict, exit code, duration, and real command output
  (`agent-run-output`), expandable per check. Recipe: run a
  passing check (e.g. `node --version`) plus one failing check →
  expand both → capture.

## 6. AiChat flake diagnosis (read-only; NOT modified)

Failing test: `src/components/AiChat.test.tsx > AiChat status
and suggestions > stops the in-flight request on Escape`
(`bridge.cancelAI` 0 calls, ~1 in 8 full-suite runs in Phase 2B;
10/10 green in isolation). No file was modified for this
diagnosis.

Likely root cause: the test sends, awaits the loading text
(`findByText(/Contacting Meta AI/)`), then dispatches Escape on
`document` and asserts `cancelAI` synchronously
(`AiChat.test.tsx:367-383`, byte-identical to HEAD). But the
window `keydown` listener is attached in a passive `useEffect`
on `loading` (`AiChat.tsx:192-209`), which flushes
asynchronously after the loading UI commits. If the dispatch
lands before the flush, no listener exists and `stopRequest`
(`:536-541`, which calls `kryom().cancelAI()` synchronously)
never runs → 0 calls. Same race class as the Phase 2B
approval-note wipe, independent instance. Real-user impact is
nil (sub-frame attach gap; any later press works).

Proposed minimal fix (not applied): attach the Escape listener
in `useLayoutEffect` instead of `useEffect` (one-word change;
fires synchronously after DOM mutation, before paint — and this
is an Electron app with no SSR, so it is safe), which removes
the race for all callers. Zero-impl alternative: have the test
await effect flush (`await act(async () => {})`) after
`findByText` and before dispatch.

## 7. Final Git status and diff check

- Branch `main`, HEAD `c0c5f4a` (unchanged). No add, commit,
  push, tag, reset, or clean performed.
- Tracked modified: 61 files — the same Phase 1 set (this
  phase's only tracked edit, the `META_LIVE_VERIFICATION.md`
  addendum, was already a member; no file entered or left).
- Untracked: 81 files — the 80 from the Phase 2B inventory plus
  this report (screenshot renames preserved all 20 PNGs with
  identical bytes; no untracked file deleted or overwritten).
- `git diff --check`: exit 0 (pre-existing LF→CRLF notices only).
- Forbidden-touch check: README, screenshots content (bytes),
  demo assets, dependencies, provider implementation/endpoint,
  backend, and release configuration untouched; AiChat files
  untouched (diagnosis was read-only); `.env` never opened;
  vault file never opened.

## 8. Remaining P0/P1 issues

- No P0. No FAIL observed in any executed check this phase.
- P1 (carried, pre-existing, out of scope): AiChat Escape test
  flake (§6) — test-stability only, recommended fix above.
- P1 (carried, owner-gated): GUI smoke interaction steps (§1
  BLOCKED rows) still need a human pass with key configured;
  L3/L4/L5 live flows ride along with it.
- P1 (carried, owner-gated): screenshot categories `04`/`10`
  still missing (§5 gives capture recipes); demo video not
  started (explicitly deferred); README gallery refs beyond the
  8 verified, icon/CI-matrix doc touch-ups, live Meta re-verify
  cadence per model — all carried from Phase 2A §10 unchanged.

## 9. Exact next actions

1. Owner GUI pass: follow `docs/SMOKE_TEST.md` steps 1b–49 on
   `npm run dev` with the disposable `kryom-smoke` fixture and a
   configured key (~30 min); record into the §1 table groups.
2. During that pass: capture `04`/`10` per §5 recipes; run one
   agent plan + research run for L3/L4 live evidence.
3. Apply the §6 AiChat fix (one word or test-only), re-run the
   renderer suite to green.
4. Repack (`npm run pack`) so a packaged build exists that
   includes the Phase 2B renderer fixes; re-verify launch.
5. Record demo video; apply doc touch-ups; then commit/tag/
   release per `RELEASING.md` (all still unauthorized).

## Verdict: CONDITIONAL PASS

Everything executable in this environment passed with observed
evidence: packaged launch (pixel-verified) and clean quit, both
Meta models live-verified independently, gallery 8/8 with 17
verified renames and 20/20 bytes intact, AiChat flake diagnosed
read-only, and a clean Git/diff state. The condition: GUI
interaction smoke steps and the in-app live flows (L3–L5) are
BLOCKED by the lack of GUI input automation here — not failed —
and are precisely scoped above for the owner pass. No FAIL was
observed anywhere; nothing in this phase implicates the Phase
2B fixes.

