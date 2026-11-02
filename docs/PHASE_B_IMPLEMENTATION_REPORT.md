# KryomCode — Phase B Implementation Report

Phase: B — Unified AI Workspace. Status: IMPLEMENTED, all gates green.
Blueprint: `docs/UNIFIED_PROFESSIONAL_IDE_UI_UX_BLUEPRINT.md` (§11.B).
No Phase C/D/E work started. Nothing committed or pushed.

## 1. Summary

Chat, Research, and Agent now share one workspace: a pinned 3-mode
selector, one headline hero, one unified Composer, and a context
toolbar. Each mode keeps its existing backend pipeline (ChatSessions/
AiChat, ResearchPanel, AgentPanel) and limits. Threads unify through
a references-only D1 index surfaced in the Phase A History view.
Phase A GUI observation remains outstanding (unchanged).

## 2. Welcome page

- Hierarchy: pinned Chat | Research | Agent selector → headline
  "What should we build & discover?" → large Composer → context
  toolbar (Choose Project, active file, New conversation).
- Removed from hero: K badge (was already gone), KryomCode brand
  text, old Chat/Research buttons, description. Shell/titlebar/
  activity branding untouched.
- Drafts persist per mode; selector position identical in hero and
  conversation states; single selector instance (tested).
- Agent mode is the real AgentPanel (pendingTask → plan → approval
  → apply → verify), guarded without a workspace like Research.

## 3. Composer

`Composer.tsx`: autosize textarea (200px + scroll), per-mode
placeholder/limit (chat 12000, research 2000, agent 4000) with live
counter and over-limit blocking (exact-limit accepted), Enter =
newline / Ctrl+Enter = send, Send/Stop gating with duplicate
prevention. Action row, all real: Attach (chat-only — only Chat
consumes excerpts), Approval toggle (live `confirmAllCommands`
setting via `updateSettings`), model select (Meta catalog +
stored-default fallback). No microphone (no speech backend exists);
no plugins row (no renderer-ready plugins; documented omission).

## 4. Pipelines (all preserved, additive touch-points only)

- Chat: submit → pendingPrompt + pendingAttachments → ChatSessions
  (new `externalSelect` deep-open; AiChat merges welcome excerpts
  capped/deduped into the FIRST request, trimming reported).
- Research: submit → pendingStart + welcome model (new optional
  `defaultModel`; in-view picker stays authoritative) → existing
  search/evidence/citations; restore via existing `sessionId`.
- Agent: submit → pendingTask → existing plan/approval/apply/
  verify; approval gates mandatory; no PTY exposure (no pty:*
  anywhere; agent stays on origin-tagged runCommand).

## 5. D1 thread index

`state/thread-index.ts`, option A: versioned localStorage refs
(id/mode/source/ref/root/title/updatedAt), zero payloads. Homes:
chat-store, research, orch-runs, meta-sessions. Invalid version/
JSON/entries degrade to empty (corrupt flag, stored bytes never
repaired); id must equal mode:source:ref; project filter blocks
cross-root leakage. App rebuilds from live lists on project/
session change, saves refs, keeps saved refs on listing failure.
Open routing: meta → session tab, chat → home + external select,
research → home + restore (both pre-checked, stale → status
message), agent → runs console + note (per-run deep restore is
NOT supported by the backend — documented supported subset).
History view: unified list, mode filter, timestamps, per-mode New,
recent projects.

## 6. Security and compatibility

Unchanged: main/preload split, sender validation, narrow IPC (only
existing channels used), approval gates, secret redaction,
origin-scoped cancellation, git registry, agent/terminal
isolation. No new dependencies, no backend rewrites, no streaming
backend (honest sync resolve preserved).

## 7. Files changed

New: `Composer(.test).tsx`, `state/thread-index(.test).ts`.
Rewritten: `HomeHero(.test).tsx`, `WelcomePage(.test).tsx`,
`HistoryPanel.tsx`. Touch-points: `AiChat.tsx`
(pendingAttachments), `ChatSessions.tsx` (externalSelect +
passthrough), `ResearchPanel.tsx` (defaultModel), `App.tsx`
(wiring), `PhaseAShell.test.tsx` (History API), `hero.css`.

## 8. Tests and gates (exact)

- Focused (9 files): 90/90 pass — composer (8), hero (4),
  welcome incl. 3-mode/agent/deep-open (11), shell incl. History
  (8+), chat/research/theme/token suites.
- `test:renderer`: 151/151, exit 0. `npm test`: 765 pass, 0 fail,
  5 pre-existing skips, exit 0 (two transient node.exe spawn
  denials retried clean — environmental, pre-test).
- `build` exit 0 (1m50s); `check:syntax` 192/192; `check:workbench`
  ok; `check:test-manifest` 80/80; `pack` exit 0 (exe rebuilt,
  unsigned); `diff --check` clean. Nothing weakened or skipped.

## 9. GUI verification

BLOCKED (environment, as in prior gates): packaged app exits 0
silently here — orderly quit, no crash evidence, no display to
observe. No screenshots claimed. Manual pass needed: 3-mode hero,
composer/toolbar, conversations, history, both themes.

## 10. Deviations and deferrals

1. Attach is chat-only (only Chat consumes excerpts); research/
   agent composers omit it rather than fake it.
2. Agent history opens the runs console, not per-run restore
   (backend lacks it).
3. Plugins/voice controls omitted (no real backends).
4. Research model picker stays in-view authoritative; welcome
   model seeds fresh mounts.
5. Welcome Chat model is per-workspace-home (resets on home
   remount); per-thread model memory is future work.

## 11. Verdict and Phase C recommendation

PASS (implementation) with GUI observation outstanding: all
acceptance criteria, gates, and suites pass; no critical defect.
Recommend the manual GUI pass, then Phase C (Agent Console:
run timeline/detail, per-hunk pre-apply review, MAX_EVENTS +
virtualization, Ctrl+Shift+M rebind, stage retirement).
