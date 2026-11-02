# KryomCode Screenshot Selection Report

Date: 2026-11-01. All 20 images in `docs/images/` opened and inspected
individually by visible content. All are genuine KryomCode PNG captures,
1920×1080, dark theme, `kryomai-core` demo project. No mockups, no
generated images, no credentials visible anywhere.

> Execution status: NO files renamed or deleted here — shell access is
> unavailable, so renames/deletes are pending owner execution (§D).
> Do not treat final filenames as live until §D commands have run.
>
> Update 2026-11-02: all 17 renames are DONE (executed as filesystem
> moves — the files are untracked so `git mv` does not apply —
> byte-identical, README gallery 8/8). The 3 removals below remain
> pending owner approval; do not run them without approval.

## A. KEEP — README main gallery (8)

| Original | Final | Reason |
|---|---|---|
| `Screenshot 2026-11-01 220503.png` | `01-main-workbench.png` | Welcome view: modes, Explorer, prompt box, model picker. Clean hero. |
| `Screenshot 2026-11-01 221424.png` | `02-meta-ai-chat.png` | Live chat: answer, elapsed timer, Stop, context chips, history. |
| `Screenshot 2026-11-01 220943.png` | `03-agent-planning.png` | Staged plan + 4a approval gate + live timeline. |
| `Screenshot 2026-11-01 225508.png` | `05-research-workspace.png` | Research sessions, validated planning progress, tab structure. Fills prior gap. |
| `Screenshot 2026-11-01 225620.png` | `06-research-evidence-citations.png` | Findings with confidence + citations + Copy chat/agent handoff. Strongest evidence story. |
| `Screenshot 2026-11-01 221028.png` | `07-integrated-terminal.png` | Terminal panel + Platform workflows. Idle state — captioned honestly. |
| `Screenshot 2026-11-01 221326.png` | `08-git-source-control.png` | Source Control + Tasks/plans verification states. |
| `Screenshot 2026-11-01 221440.png` | `09-meta-model-configuration.png` | Settings model dropdown (both Muse models), keys-never-shown note. |

Still missing (no genuine shot exists): `04-multi-file-code-changes`
(no diff/review UI captured), `10-verification-results` (no clean
executed-results capture; closest are pending-approval text and a
mixed output log — neither qualifies).

## B. SUPPLEMENTARY — keep outside the gallery (9)

| Original | Final | Reason |
|---|---|---|
| `Screenshot 2026-11-01 220626.png` | `editor-ai-workspace.png` | Multi-tab Monaco + AI Workspace panel. (Open file is a `.venv` lib — stays supplementary.) |
| `Screenshot 2026-11-01 220845.png` | `agent-research-grounding.png` | Agent-embedded grounding honesty ("no definition in evidence"). Demoted from 06 by stronger 225620. |
| `Screenshot 2026-11-01 220957.png` | `agent-error-state.png` | Honest planner-failure state. Error evidence, never a hero. |
| `Screenshot 2026-11-01 221101.png` | `intel-runs.png` | Intel RUNS orchestration form. Terminal half duplicates 07. |
| `Screenshot 2026-11-01 225100.png` | `agent-code-answer.png` | Agent code answer with long-block collapsing ("Show all 86 lines"). |
| `Screenshot 2026-11-01 225134.png` | `agent-verification-approval.png` | Multi-file summary + "NEEDS YOUR RUN (awaiting approval)" honesty. Pending, not executed — captioned as such. |
| `Screenshot 2026-11-01 225551.png` | `research-sources.png` | 20 numbered sources with Inspect/Open. Retrieval proof. |
| `Screenshot 2026-11-01 225647.png` | `research-report-brief.png` | LLM-cited brief ("Report v1 (llm …)"), single-study caveats, .docx export. |
| `Screenshot 2026-11-01 231253.png` | `terminal-output-log.png` | Output log with per-command exit statuses (incl. project-side failures — honest, supplementary only). |

## C. REMOVE — recommended deletions (3, owner approval required)

| Original | Reason |
|---|---|
| `Screenshot 2026-11-01 225012.png` | Redundant: same agent thread as 225100, which is strictly better (shows collapsing + cleaner code block). |
| `Screenshot 2026-11-01 225534.png` | Subsumed: sub-question/query progress adds nothing over 05 (planning progress) + 06 (findings). Weakest research tab. |
| `Screenshot 2026-11-01 225603.png` | Redundant: Claims tab repeats the same claim sentences/statuses as the Findings tab in 06. |

All three were visually inspected; nothing uncertain is listed. If the
owner prefers zero deletions, keep them under `docs/images/archive/`
instead (create the folder first) — but do not leave them under
timestamp names in the gallery folder.

## D. Pending owner commands (shell was unavailable here)

Run from the repo root. Renames first (17), verify, then removals (3):

```powershell
git mv 'docs/images/Screenshot 2026-11-01 220503.png' 'docs/images/01-main-workbench.png'
git mv 'docs/images/Screenshot 2026-11-01 221424.png' 'docs/images/02-meta-ai-chat.png'
git mv 'docs/images/Screenshot 2026-11-01 220943.png' 'docs/images/03-agent-planning.png'
git mv 'docs/images/Screenshot 2026-11-01 225508.png' 'docs/images/05-research-workspace.png'
git mv 'docs/images/Screenshot 2026-11-01 225620.png' 'docs/images/06-research-evidence-citations.png'
git mv 'docs/images/Screenshot 2026-11-01 221028.png' 'docs/images/07-integrated-terminal.png'
git mv 'docs/images/Screenshot 2026-11-01 221326.png' 'docs/images/08-git-source-control.png'
git mv 'docs/images/Screenshot 2026-11-01 221440.png' 'docs/images/09-meta-model-configuration.png'
git mv 'docs/images/Screenshot 2026-11-01 220626.png' 'docs/images/editor-ai-workspace.png'
git mv 'docs/images/Screenshot 2026-11-01 220845.png' 'docs/images/agent-research-grounding.png'
git mv 'docs/images/Screenshot 2026-11-01 220957.png' 'docs/images/agent-error-state.png'
git mv 'docs/images/Screenshot 2026-11-01 221101.png' 'docs/images/intel-runs.png'
git mv 'docs/images/Screenshot 2026-11-01 225100.png' 'docs/images/agent-code-answer.png'
git mv 'docs/images/Screenshot 2026-11-01 225134.png' 'docs/images/agent-verification-approval.png'
git mv 'docs/images/Screenshot 2026-11-01 225551.png' 'docs/images/research-sources.png'
git mv 'docs/images/Screenshot 2026-11-01 225647.png' 'docs/images/research-report-brief.png'
git mv 'docs/images/Screenshot 2026-11-01 231253.png' 'docs/images/terminal-output-log.png'
```

```powershell
git rm 'docs/images/Screenshot 2026-11-01 225012.png'
git rm 'docs/images/Screenshot 2026-11-01 225534.png'
git rm 'docs/images/Screenshot 2026-11-01 225603.png'
```

Then: `git status --short`, `git diff --check`, and confirm the README
gallery renders all 8 images.

## E. Full inspection inventory (review record, per §Phase-1 rule 8)

Format PNG, 1920×1080 throughout. Sizes in bytes where captured this
session (older ten: stat unavailable without shell).

- 220503 (n/a): welcome view. KEEP → 01. Clean, no sensitive data.
- 220626 (n/a): editor + AI Workspace. SUPP. `.venv` file content.
- 220845 (n/a): agent research grounding + citations. SUPP (moved).
- 220943 (n/a): agent plan + timeline. KEEP → 03.
- 220957 (n/a): agent Failed state. SUPP. Honest error UI.
- 221028 (n/a): terminal idle + workflows. KEEP → 07. Local cwd path.
- 221101 (n/a): Intel RUNS + terminal. SUPP. Local cwd path.
- 221326 (n/a): Source Control + Tasks. KEEP → 08.
- 221424 (n/a): live chat + history. KEEP → 02. Truncated local paths.
- 221440 (n/a): Settings model picker. KEEP → 09. Truncated local paths.
- 225012 (241724): agent thread code block. REMOVE (redundant).
- 225100 (210427): agent code block + collapsing. SUPP.
- 225134 (280252): change summary + approval honesty. SUPP.
- 225508 (206545): research sessions + progress. KEEP → 05.
- 225534 (280198): sub-questions detail. REMOVE (subsumed).
- 225551 (243878): sources list. SUPP.
- 225603 (250442): claims tab. REMOVE (redundant with 06).
- 225620 (258222): findings + handoff. KEEP → 06.
- 225647 (337304): cited report brief + export. SUPP.
- 231253 (234870): output log exit codes. SUPP. Shows project-side
  command failures — real KryomAI-Core results, not KryomCode defects.

Privacy: no keys/tokens in any image. Local paths (`C:\Users\LENOVO\…`)
appear truncated in 02/09/07-class shots; pattern already in-repo via
`docs/SMOKE_TEST.md`. Owner previously accepted; recapture guidance
stands in `docs/SCREENSHOT_GUIDE.md` §6.
