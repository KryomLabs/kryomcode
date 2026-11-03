# KryomCode Windows GUI Smoke Test

Manual release-gate checklist for the actual desktop app. Automated tests
cannot click through the real UI, so run this on Windows before calling
any release demo-ready. Use a **disposable test project** and harmless
commands only — never point these steps at the KryomCode repo itself.

Time: ~30 minutes (less with a configured model key).

Scope: Windows 10/11 x64 with Node.js 22, per the supported-platform
matrix in the README. Run the checklist on the exact build under
test (dev or packaged) and record which one with the results.

## Setup (once)

```powershell
# Disposable project OUTSIDE the KryomCode repo:
mkdir $env:USERPROFILE\Documents\kryom-smoke
cd $env:USERPROFILE\Documents\kryom-smoke
git init
"console.log('smoke')" | Out-File -Encoding utf8 hello.js
"# smoke project" | Out-File -Encoding utf8 README.md
git add -A; git commit -m "smoke fixture"
```

Start the app from the KryomCode repo (this is the only supported
dev-launch script; do not invent others):

```powershell
cd C:\Users\LENOVO\Documents\KryomLabs\kryomcode
npm run dev
```

Expect: Vite serves `http://127.0.0.1:5173`, then the KryomCode window
opens on the Discovery workspace ("KRYOMCODE / What should we build?").

## Checklist

| # | Step | Expected |
|---|------|----------|
| 1 | Launch via `npm run dev`. | Discovery workspace renders (only `KRYOMCODE` + `What should we build?`, then Chat); no blank window, no error dialog. |
| 1b | In Discovery **Chat**, ask "Explain what a closure is"; switch the title-bar control to **Research**, research "retry strategies"; switch back. | Answers stay in the central workspace with history visible; the active mode is clearly indicated; nothing opens an Agent tab. |
| 1c | In Discovery **Chat**, send "Create a file notes.txt listing three ideas" and click **Open in Agent** on that message. | A new Meta AI Agent tab opens with the request as a plan handoff; the Discovery chat keeps its own history. |
| 2 | In **Explorer**, click **Open Project**, pick `kryom-smoke`. | Explorer lists `hello.js`, `README.md`. |
| 3 | Click `hello.js`; type a comment line. | Monaco editor loads with highlighting; typing works; tab shows `•`. |
| 4 | Press **Ctrl+S**; check the file on disk (`type hello.js` in a separate terminal). | Dirty dot clears; disk contents match the editor. |
| 5 | Open the bottom panel's **Terminal** tab, enter `node --version` (fallback: `echo smoke-ok`), click **Run**. Then run `node -e "setTimeout(()=>{},30000)"` and click **Cancel**. | First entry shows real output and exit code 0; second entry shows **cancelled** (not failed). |
| 5b | Open **Problems**, run a slow custom check (`node -e "setTimeout(()=>{},30000)"`), click **Stop**. | Header shows **Cancelled**; panel stays usable. |
| 5c | In **Terminal**, enter `rm -rf ./tmp-smoke-does-not-exist` and click **Run**; decline the confirm dialog. Open **Settings**, enable confirm-every-command, run `echo hi` (confirm), then disable the setting again. | Declined command never runs (no new entry); with the setting on, even `echo hi` asks first. |
| 6 | Click the ∞ **Meta AI** button in the editor tab bar (or Ctrl+Shift+M) with **no** key configured; send a message. Then configure a key (step 44) and send again. | Without a key: "Meta AI is not configured" + Configure Provider action, editor stays usable, no crash. With a key: a real answer arrives in the session conversation (no streaming). |
| 6b | With 2+ Meta AI tabs open, send different messages in each; close one tab; reopen via a new tab; check the other tab. | Histories stay independent; closing a tab keeps its session; the other tab is untouched. |
| 6c | In a Meta AI tab with a tracked plan + applied edits, open the bottom Tasks panel (**Work Summary**), drag its grip, collapse it. | Panel shows real plan steps, created/modified/deleted files with Open, approvals, verification reports; resize persists; collapse hides it. |
| 6d | Expand **History**, search, attach the project chat + a research session + a sibling session; send a message; plan a task; detach one. | Picker lists only this project's history ranked by relevance; attaching grounds the reply and the plan (review shows "+ N chars of selected history"); detach removes it. |
| 7 | In a Meta AI tab, expand **Research**, enter an objective (e.g. "retry strategies for flaky network calls"), click **Start research**. | Progress steps, **Sources** list with **Open**/**Copy**, and an **Errors** section if a provider fails. **Cancel** stops a running session. |
| 8 | In the Meta AI tab, expand **Implementation**, check **Include active file**, use **Search** + **Add** to select `hello.js`. | Footer reads "N file(s) selected"; selected files listed with **Remove**. |
| 9 | Task: "Add a one-line comment at the top of hello.js explaining what it does." Click **Plan task**. | Status line walks Inspecting → Gathering → Planning → "Awaiting review"; context preview shows "Model context: N file(s)…" plus any "Excluded …: reason" lines. |
| 10 | Inspect the plan view. | Each edit shows a **Why:** rationale; modify-edits show a diff; **Proposed commands (never executed automatically)** lists commands with **Copy**. |
| 11 | Before approving: run `git status --short` in the smoke repo (external terminal). | No modified files — planning alone changed nothing. |
| 12 | Keep one edit checked, click **Apply approved edits**, confirm the **Apply agent edits?** dialog. | "Applied N edit(s)."; the file on disk actually changed; the bottom **TASKS** tab still lists the tracked plan with honest counts (the Agent tab shows no dashboard). |
| 13 | In **Verification**, note **Working directory** and **Will run:**, pick/type `node --version`, click **Run check**, confirm the dialog. | Dialog shows the exact command + cwd; result shows "Check passed.", the real exit code, and output. |
| 14a | Run a failing check: custom command `node --no-such-flag-xyz`. | "Check failed. Exit code: 1", output shown, **Request fix** offered. |
| 14d | Run a failing test command (e.g. `node --test` on a fixture with a failing test). Inspect the result and the plan's verification reports. | A diagnosis line shows status, runner, duration, and "actually executed"; each finding shows category, confidence, and file/test evidence; the stored report links the diagnosis run id. |
| 14e | After a failed tracked-plan check, click **Start repair cycle** (needs `MODEL_API_KEY`); review the proposal, apply it, re-run the check. On a second failure try **Generate repair attempt 2**; also try **Deny repair** on a fresh cycle and **Cancel repair** mid-cycle. | Cycle line shows state, attempt 1 of 2, elapsed/of 10:00 budget; proposal reviews like a plan with **Deny repair** offered; apply checkpoints normally; re-record links the report to the attempt; second failure offers attempt 2; deny/cancel land terminal reasons with evidence preserved. |
| 14f | On a tracked plan with passed/failed/skipped checks and one repair attempt, inspect the plan's verification reports. | Each report shows **Status** (passed/failed/cancelled/timed_out/blocked/skipped/not_executed); executed reports show **Executed** facts (command, exit code, duration, run id) plus **Observed evidence** (output excerpt, diagnosis findings); model text is labelled AI-generated, never proof; skipped checks show their stated reason; repair reports show attempt, checkpoint id, and changed files. |
| 14g | Request a multi-file agent plan (2+ edits with an import between them); approve all, then approve only two edits to the same file, then re-approve all and apply. | Review shows a **Change set** section (apply order with dependencies first, review-together groups, warnings); the same-file approval disables **Apply** with a conflict blocker; the clean apply confirms with the dependency order, writes, checkpoints, and records the order as apply-step note evidence. |
| 14b | Start a plan, click **Stop** mid-planning. | Status becomes **Cancelled** ("Planning cancelled"); panel stays usable. |
| 14h | Start a long verification check (e.g. a sleep command), click **Stop** mid-run. | The run resolves **cancelled** (not failed): result heading and status say cancelled, a cancelled report is recorded, and no orphan processes remain. |
| 14c | Plan a modify-edit, then change that file externally (Notepad) before applying; apply. | Apply blocked by the pre-apply check: the changed file is listed with status **stale** and its reason, "Nothing was written…" shown, **Plan again with current files** offered, plan and evidence preserved. |
| 15 | Close and relaunch the app; reopen the smoke project. | Project reopens; open code tabs (with unsaved edits), Meta AI tabs, conversations, and session drafts restore. |
| 18 | With dirty tabs and a Meta AI session draft present, reload the window (Ctrl+R, confirm Leave if prompted). Quit mid-research, relaunch, reopen the session tab, expand Research. | Tabs reopen with unsaved edits intact (dirty dots back); session conversation/draft restored; the interrupted research session offers Resume. |
| 19 | Apply a one-edit agent plan, then use Checkpoints → Undo (confirm). Edit the file again, apply a second plan, edit once more by hand, then undo the second checkpoint. | First undo restores the pre-apply content; second undo reports the hand-edited file as Kept with reason `changed since apply`. |
| 20 | In **Connections**, paste `http://10.255.255.1/x.git` and click **Verify**, then click **Cancel** within a few seconds. | Status reports remote verification cancelled; no error box. (Mid-apply stop is backend-covered by tests; applies finish in milliseconds.) |
| 16 | Edit `hello.js` in the app (do not save); edit it externally; press **Ctrl+S**. | **Unsaved changes conflict** dialog with **Reload disk version** / **Overwrite disk version**; both paths work. |
| 17 | Open the bottom panel's **Source Control** tab, click **Refresh**. | **Staged** list contains no `.kryom/…` entries. Cross-check externally: `git status --short` shows `.kryom/` untracked at most. |
| 21 | Open **Memory**, click **New**, record a fact with a file source, then edit the source file externally and click **Refresh**. Edit the record, then **Delete** it (confirm). | New record lists as current; after the external edit it shows **stale** with a reason; edit updates it; delete asks for confirmation and removes it. |
| 22 | In **Memory** with 2+ records, click **Export**, save to a temp folder; click **Export** again and cancel the dialog; click **Delete all** (confirm). | Export writes a `.json` file containing the records; cancel reports cancellation with no file; delete-all asks for confirmation, reports the deleted count, chat/checkpoints/research stay intact (spot-check `.kryom/`). |
| 23 | In a Meta AI session, request an agent plan, approve and apply it, then run the suggested check. Restart the app mid-way on a second plan (leave steps open). | Plan review shows expected outcome/risks; progress section tracks review/apply/verify with evidence; passing check marks verify **verified** with a report; after restart, open steps show **interrupted** (never completed) with Resume/Mark-blocked. |
| 24 | In a session conversation, exchange 2+ messages; in the Implementation composer tick **Include recent chat**, attach a file, request a plan. Then edit the file externally. | Chat preview shows counts before planning; plan review lists attached context with file/research/chat provenance; after the external edit the file shows **stale** with a warning. |
| 25 | Open the **INTEL** stage tab (**Search**): click **Refresh index**, search "where is hello implemented", run **Analyze impact** on `hello.js`, click **Architecture**. Edit `hello.js` externally and search again. | Index reports file counts; search lists `hello.js` with kind/score/why; impact shows dependents/risks; architecture shows language/modules/entry points; after the external edit the file is reported stale and excluded. |
| 26 | **INTEL → Plan**: enter "Add a farewell function to hello.js", build the plan; then revise it with "Also export it.". | Plan shows subtasks with files/dependencies/verification, execution order, parallel waves, and risks; revision creates a new plan id, preserves completed steps, and names invalidated context. |
| 27 | **INTEL → Specialists**: run the **research** specialist ("What does hello.js do?"), then the **security** specialist on `hello.js`; start a third run and **Cancel** it. | Both runs reach **succeeded** with structured results (research findings cite `hello.js`); the cancelled run reports **cancelled**; no project file changed (check `git status --short`). |
| 28 | **INTEL → Runs**: complete a plan's review step (Agent panel), start a run with two coding tasks on two different files, **Advance**, review each proposal, **Approve + merge** both; start a second run and **Cancel** it mid-flight. | Tasks move pending → running → proposed; each approval merges with a checkpoint id; files change only after approval; the cancelled run preserves merged work and marks the rest cancelled. |
| 29 | **INTEL → Quality**: build a report scoped to `hello.js`. | Verdict with reasons; regression section (affected files, related tests); test suggestions only for uncovered symbols; security findings quote file/line evidence; performance notes cite index facts with no invented benchmarks. |
| 30 | **PLATFORM → Providers**: open the Providers tab, switch the model between the two Meta models, **Save selection**, **Test** the Meta provider. | Active route updates and persists across a tab switch; test shows PASS for the registered check; no key material visible anywhere on screen. |
| 31 | **PLATFORM → Extensions**: **Choose folder…** → `examples/hello-command`, **Install**, then **Enable**, **Activate**, open the detail, **Run** the hello command; then **Deactivate**, **Disable**, **Uninstall**. | Install lands disabled; activation reports one command; Run returns the greeting; each transition reflects in the list; uninstall removes it with no leftover rows. |
| 32 | **PLATFORM → Skills + Workflows**: run the **Project Analyst** skill ("Summarize the layout") — grant `workspace.metadata` to `skill:builtin:project-analyst` in Perms first if it reports Permission denied. Start a **Project Analysis** run and **Advance** it to completion; start a second run and **Cancel** it. (With an API key: also advance **Feature Implementation** to its checkpoint and **Deny** it.) | Skill returns an architecture result; the first run completes with per-step states; the second run ends cancelled and both appear in history; nothing writes without approval. |
| 33 | **PLATFORM → Integrations + Templates**: check the GitHub adapter status; preview `basic-web` into a fresh disposable folder, then **Generate**. | Status reports connected/disconnected honestly for the open project; preview lists files with zero collisions; generation writes the files; setup commands display as text and do not execute. |
| 34 | **PLATFORM → Perms**: grant `workspace.read` to `extension:smoke.probe`, confirm it appears, then **Revoke** it; scroll the security events. | Grant and revoke both appear in the list immediately; matching `permission.granted` / `permission.revoked` events show in the audit trail with no secrets in any row. |
| 35 | **Regression**: repeat steps 1–10 (open/edit/save/terminal/AI chat) after exercising steps 30–34. | No regression: editor, terminal, chat, and agent flows behave as before; no extension interferes with core editing. |
| 36 | **Restart recovery**: quit and relaunch with an extension still enabled. | App boots to the project; the extension list and grants persist; no activation error blocks startup. |
| 37 | **Help → Export Diagnostics**: open, review the preview, export to a file. | Preview shows versions/status only (home folder as `~`, no keys); export writes the chosen `.json`; nothing uploads. |
| 38 | **PLATFORM → Updates**: open the Updates tab, run Check for updates. | With no feed: honest "unavailable" state, no error dialog, no crash. |
| 39 | **Extension isolation**: activate `examples/hello-command`, run its command, then deactivate. | Command returns the greeting; a child process hosts it (no main-process vm); deactivate terminates the child; the app stays responsive throughout. |
| 40 | **Settings → Language**: open Settings, confirm the Language row. | Row shows English with a pending-locales note; switching (when more ship) needs no restart of the app shell. |
| 41 | **Keyboard + reduced motion**: Tab through the Diagnostics dialog; enable OS reduced-motion and watch terminal autoscroll. | Focus stays trapped in the dialog, Escape closes it, focus returns; terminal jumps instead of smooth-scrolling. |
| 42 | **Packed app**: `npm run pack`, launch `release/win-unpacked/KryomCode.exe`, open the disposable project. | Boots without the dev server or repo `.env`; AI status reflects the user's own vault/env key; no DevTools; quit is clean with no orphan processes. Window and taskbar show the KryomCode icon. |
| 43 | **Windows installer**: `npm run dist`, run the NSIS installer from `release/`, launch the installed app, open the disposable project, then uninstall via Add/Remove programs. | Installer completes with no signing error beyond the expected unsigned notice; installed app boots and behaves as in step 42; uninstall removes the app with no orphan processes. |
| 44 | **Settings → Providers**: paste a test key, **Save key**, **Run checks**, **Live test**; switch models; then **Remove key**. | Save reports the vault; checks list real PASS/FAIL rows (no fake success); model switch persists; remove asks for confirmation and returns to Not configured. The key value never appears on screen. |
| 45 | **Split editors**: open two files, right-click a tab → **Split right** (or Ctrl+\\); edit in one group; close the group. | Both groups show independent tabs; the same file edited in one group reflects in the other; closing the group keeps all tabs openable. |
| 46 | **Tab context menu + close-others**: right-click tabs for Close / Close others / Copy path (Meta AI tabs also offer Rename / Delete session); close all tabs. | Menus act on the right tab; with zero tabs the Discovery view returns; no session is deleted by closing tabs. |
| 47 | **Explorer**: right-click files/folders; modify `hello.js` and check badges; use **Create Project** from the empty state. | Context menu offers New/Rename/Delete/Refresh/Copy path; Git badges (M/U/S) match `git status --short`; Create Project generates from a template with a collision preview and opens it. |
| 48 | **Tasks tab**: open bottom **TASKS** after steps 9–14. | Lists the tracked plan(s) with verification states, orchestration runs, and quality reports with honest counts; Refresh updates. |
| 49 | **Offline IDE**: disconnect the network, relaunch, open the project, edit/save, run terminal commands and tests. | Everything local works with no internet: editor, explorer, search, terminal, tests, Git. Meta AI shows the offline notice instead of hanging. |

## Offline editor check (Monaco local bundling)

1. Disconnect the machine from the network (airplane mode or unplug).
2. Quit KryomCode fully, relaunch with `npm run dev`.
3. Open `hello.js`, type, save.
4. With no key configured, open a Meta AI tab and send a message.

Expected: the editor initializes, highlights, and saves with no
network. If it hangs on a spinner, local bundling regressed. The
Meta AI tab shows the not-configured/offline notice with a Configure
Provider action instead of failing.

## Recording results

Copy this table into the release note or
[backend-limitations.md](backend-limitations.md) with the date:

| Step | Pass / Fail | Notes (build, model, key/no-key) |
|------|-------------|----------------------------------|
| 1–24 | | |
| 25–29 | | |
| 30–36 | | |
| 37–43 | | |
| 44–49 (3C) | | |
| Offline editor | | |

Steps 11, 13–14, and 16–17 are also pinned by automated backend tests
(agent stale/rollback, diagnostics exit codes, conflict detection,
`.kryom` ignore); the GUI pass proves the wiring, not just the units.

## Owner-reported results — 2026-11-03 (installed Windows app)

The owner executed the seven-test manual GUI checklist against the
installed v0.1.0 Windows application on 2026-11-03 and reported
all seven tests successful. These are owner-reported manual
results, recorded here without embellishment.

| Test | Description | Result |
|---|---|---|
| T1 | Application Launch and Clean Close | PASS |
| T2 | Open Project and Explorer | PASS |
| T3 | Meta AI Chat, Model Picker and Stop | PASS |
| T4 | Agent Plan, Approval, Apply and Undo | PASS |
| T5 | Integrated Terminal | PASS |
| T6 | Git Source Control | PASS |
| T7 | Research to Agent Workflow | PASS |

Evidence qualifications (honest record, not guesses):

- Execution timestamps: not recorded.
- Model IDs used during T3/T7: not recorded.
- Research provider names used in T7: not recorded.
- Citation URLs, screenshots, log excerpts: not recorded.
- These results describe the manual GUI pass only. They are not
  CI results and do not replace the automated backend/renderer
  suite records.
- No macOS/Linux runtime testing is claimed; Windows only.

The checklist procedure above remains the reference for future
verification runs.
