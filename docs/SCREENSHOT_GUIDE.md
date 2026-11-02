# KryomCode Screenshot Guide

Every image in `docs/images/` was opened and identified by its actual
visible content — not by filename (10 on 2026-11-01, 10 more added by
the owner and inspected the same day). All 20 are PNG, dark theme,
real app on the `kryomai-core` demo project: 10 at 1920×1080 and 10
at 1902×1071 (windowed captures; verified by header bytes
2026-11-02). No mockups. No secrets visible in any shot (see §6).

> Rename status (updated 2026-11-02): all 17 renames below are DONE
> — executed as filesystem moves (the files are untracked, so the
> `git mv` spelling does not apply) with byte-identical results,
> and the README gallery resolves 8/8. The 3 approved removals are
> still pending owner approval and the candidates stay in place.

Curation: 8 gallery + 9 supplementary + 3 approved removals. Full
rationale: [SCREENSHOT_SELECTION_REPORT.md](SCREENSHOT_SELECTION_REPORT.md).

## 1. Inventory (gallery)

| Original filename | Final filename | Feature |
|---|---|---|
| `Screenshot 2026-11-01 220503.png` | `01-main-workbench.png` | Main workbench (welcome view) |
| `Screenshot 2026-11-01 221424.png` | `02-meta-ai-chat.png` | Meta AI chat, live request |
| `Screenshot 2026-11-01 220943.png` | `03-agent-planning.png` | Agent execution plan + timeline |
| `Screenshot 2026-11-01 225508.png` | `05-research-workspace.png` | Research sessions + progress |
| `Screenshot 2026-11-01 225620.png` | `06-research-evidence-citations.png` | Findings + citations + handoff |
| `Screenshot 2026-11-01 221028.png` | `07-integrated-terminal.png` | Terminal panel + Platform workflows |
| `Screenshot 2026-11-01 221326.png` | `08-git-source-control.png` | Source Control + Tasks panel |
| `Screenshot 2026-11-01 221440.png` | `09-meta-model-configuration.png` | Settings: model picker |

## 2. Inventory (supplementary, kept outside the gallery)

| Original filename | Final filename | Feature |
|---|---|---|
| `Screenshot 2026-11-01 220626.png` | `editor-ai-workspace.png` | Monaco editor + AI Workspace |
| `Screenshot 2026-11-01 220845.png` | `agent-research-grounding.png` | Agent-embedded grounding honesty |
| `Screenshot 2026-11-01 220957.png` | `agent-error-state.png` | Planner failure state (error evidence) |
| `Screenshot 2026-11-01 221101.png` | `intel-runs.png` | Intel RUNS orchestration form |
| `Screenshot 2026-11-01 225100.png` | `agent-code-answer.png` | Agent code answer, block collapsing |
| `Screenshot 2026-11-01 225134.png` | `agent-verification-approval.png` | Change summary + approval honesty |
| `Screenshot 2026-11-01 225551.png` | `research-sources.png` | 20 numbered sources, Inspect/Open |
| `Screenshot 2026-11-01 225647.png` | `research-report-brief.png` | Cited LLM brief + .docx export |
| `Screenshot 2026-11-01 231253.png` | `terminal-output-log.png` | Output log with exit statuses |

## 3. What each screenshot demonstrates

- `01-main-workbench.png` — Welcome view: "What should we build &
  discover?", Chat/Research/Agent mode tabs, Explorer with an open
  project, prompt box with Attach, Approval toggle, `Muse Spark 1.3`
  picker, Send, project + new-conversation chips.
- `02-meta-ai-chat.png` — Live chat: assistant answer with review
  instructions, "Contacting Meta AI… 5s · Esc to stop", Stop button,
  `Muse Spark 1.3` + workspace-summary context chips, thread history
  (Chat/Research/Agent/Meta AI filters), recent projects.
- `03-agent-planning.png` — Agent run: 7-stage execution plan (Stages
  1–5 plus 4a review-and-approval gate and 4b approved-only execute),
  each stage with files + Verify command, live TIMELINE
  (analyzing → planning → proposing) with timestamps.
- `05-research-workspace.png` — Deep Research: running + completed
  (5 src) sessions, "Planning research — 4 questions, 12 queries
  planned (llm (validated))", Overview/Plan/Sources/Evidence/Findings/
  Report tabs, depth + model pickers, Stop control.
- `06-research-evidence-citations.png` — Findings (48): confidence
  high/medium/low with support status ("3 independent sources",
  "corroboration is thin", "insufficient-evidence"), numbered
  citations, per-finding Copy, "Copy chat handoff" / "Copy agent
  brief" buttons.
- `07-integrated-terminal.png` — Bottom Terminal panel: command input,
  Run/Cancel/Status/Clear/Copy, auto-scroll toggle, working directory
  line (idle state, no run in progress); Platform WORKFLOWS tab above
  (5 builtin workflows). Captioned as idle — never as execution.
- `08-git-source-control.png` — Source Control sidebar (Refresh, full
  diff, staged/unstaged/untracked with `.kryom/` untracked, commit box,
  Push/Pull) plus TASKS panel (5 plans with verified counts,
  orchestration, quality & verification columns).
- `09-meta-model-configuration.png` — Settings → General: Default AI
  model dropdown open showing `Muse Spark 1.3` and `Muse Wonder 1.0`,
  confirm-before-run toggle, Auto Save, font sizes, Terminal/Plain-text
  output, Dark/Light appearance, language, panel sizes, and the
  "API keys are managed under Providers and are never shown here" note.
- Supplementary shots each show one distinct screen; see the selection
  report §B for per-image notes.

## 4. Missing recommended categories

- `04-multi-file-code-changes.png` — no diff/review screenshot exists
  in any of the 20. Recapture: plan a 2+ file task, screenshot the
  diff review + approval checkboxes.
- `10-verification-results.png` — no clean executed-results capture
  (TASKS shows `0 verified · 0 reports`; the output log mixes
  project-side failures). Recapture after green checks: Problems
  diagnostics or a verified plan report.

## 5. Duplicates, near-duplicates, removals

- 220943 vs 220957 share plan/timeline; 220943 (clean) is gallery,
  220957 (Failed banner) is supplementary error evidence. Both kept.
- 221028 vs 221101 share the idle terminal; 221028 is gallery,
  221101 (Intel RUNS form) is supplementary. Both kept.
- 225012 vs 225100 (same agent thread): 225100 kept (shows block
  collapsing), 225012 approved for REMOVAL (redundant).
- 225603 (Claims) repeats 225620 (Findings) claim text: approved for
  REMOVAL (redundant).
- 225534 (sub-questions) is subsumed by 05 + 06: approved for REMOVAL
  (weakest research tab).
- Removals need owner approval + shell; commands are in the selection
  report §D. When in doubt the owner should archive instead of delete.

## 6. Privacy review (owner decision)

- No API keys, tokens, or credentials in any of the 20 shots. The
  Settings shot confirms keys are never displayed.
- Local paths (`C:\Users\LENOVO\…` working directory, truncated
  recent-project entries including a second `Defence AI P…` folder)
  appear in 02/07-class/09 shots; the pattern is already in-repo
  (`docs/SMOKE_TEST.md`). Recommendation: acceptable as-is, or
  recapture 02/09 with a single demo project in recents.
- `terminal-output-log.png` shows real KryomAI-Core command outcomes
  (failed `npm run`/`pytest`/`pip install`, successful `ver`/`node
  --version`). Those are project-side results, not KryomCode defects;
  keep captioned honestly, supplementary only.

## 7. Rename + removal commands (owner: run from repo root)

Renames: DONE 2026-11-02 (17/17, byte-identical, gallery 8/8 —
see [PHASE_2C_OWNER_VERIFICATION_REPORT.md](PHASE_2C_OWNER_VERIFICATION_REPORT.md)).
Removals: still pending owner approval. The 3 `git rm` commands in
[SCREENSHOT_SELECTION_REPORT.md](SCREENSHOT_SELECTION_REPORT.md) §D
apply only after the files are tracked; until then the candidates
stay under their original names. Do not delete without approval.
