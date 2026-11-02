# KryomCode Hackathon Demo Script (~3:40)

Recording: 1920×1080, dark theme, disposable demo project (NOT the
KryomCode repo — e.g. a small `kryom-demo` folder with a README, one
source file, and `git init`). Key configured via `.env` before
recording; never show key values, `.env` contents, or the Providers
key fields on screen. Target file after recording:
`docs/demo/kryomcode-hackathon-demo.mp4` (add to README only then).

## 00:00–00:20 — Introduction

Narration: "Research dies in browser tabs. KryomCode keeps the whole
chain — research, plan, review, approval, verification — in one
Meta-first desktop workspace. Research. Understand. Plan. Review.
Execute. Verify. Let me show you."

On screen: welcome view ("What should we build & discover?"), then
open the demo project in Explorer.

## 00:20–00:50 — Main workbench

Narration: "The workbench is a full IDE: Explorer, multi-tab Monaco
editor with dirty tracking and conflict protection, and an AI panel
that never touches your files without permission."

On screen: open two files, type a line (dirty dot appears), open the
AI Workspace panel (Chat, Research, Agent Runs, Intelligence,
Platform entries). Transition: click Chat.

## 00:50–01:20 — Meta AI chat

Narration: "Chat runs on Muse models — Spark 1.3 or Wonder 1.0 —
with your active file or project summary attached as labeled context.
Every request can be stopped, and history persists per project."

On screen: pick the model, send "Explain what this module does",
show the answer arriving with the elapsed timer; point at the Stop
button and the thread history. Transition: "Now the agent."

## 01:20–02:00 — Agent planning and multi-file changes

Narration: "Describe a task and the agent proposes a plan — at most
twenty edits — with a reason and a diff per edit. Nothing is written
until I approve. Planned commands are never executed automatically."

On screen: submit a small 2-file task, show the staged plan with Why
rationales and diffs, uncheck one edit, Apply approved edits with the
confirm dialog. Transition: "Where did the plan come from? Research."

## 02:00–02:40 — Research and evidence

Narration: "Research runs against real providers — arXiv, OpenAlex,
DuckDuckGo — and every citation must resolve to a retrieved source.
When evidence is absent, KryomCode says so instead of speculating.
One click hands the brief to the agent."

On screen: research brief with numbered citations, open one source in
the browser, show "Implement from Research". Transition: "Execution
stays guarded too."

## 02:40–03:10 — Terminal and Git

Narration: "The terminal runs one reviewed command at a time, with
destructive-pattern warnings and a native approval the UI cannot
skip. Git covers status, diffs, stage, commit, push, and verified
clone — using only your ambient credentials."

On screen: run `node --version`, show exit code; open Source Control,
show staged/unstaged and the Tasks panel. Transition: "Finally,
verification."

## 03:10–03:40 — Verification and closing

Narration: "Checks run through the same guarded path: parsed
Problems, a classified diagnosis, and a verification report pinned to
the plan — with checkpoints and undo behind every apply. Research,
understand, plan, review, execute, verify — with evidence at every
step. That is KryomCode."

On screen: run one Problems check, show the diagnosis + report,
flash the checkpoint/undo entry. End on the workbench. Hold 2 s.

## Do NOT show

- API keys, `.env` contents, Providers key fields, vault files.
- Personal folders, email, or non-demo projects in recents/paths.
- The KryomCode repo itself as the demo project.
- Failure banners or empty states (recapture the segment instead).
- Any feature not in the app (no streaming, no marketplace, no pty).
