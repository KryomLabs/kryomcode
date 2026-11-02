# KryomCode — Unified Professional IDE UI/UX Blueprint

Status: AUTHORITATIVE design direction. Blueprint only — implements nothing.
Supersedes the navigation/layout proposals of the earlier redesign blueprint;
does not overwrite its historical findings. Companion documents, all read in
full before authoring:

- [UI/UX Audit](UI_UX_AUDIT.md) — findings (historical, preserved).
- [UI/UX Redesign Blueprint](UI_UX_REDESIGN_BLUEPRINT.md) — Phase 0–1 token/type
  foundation and earlier proposals.
- [Terminal UX & Architecture Audit](TERMINAL_UX_AND_ARCHITECTURE_AUDIT.md) —
  terminal track (T0/T1/T2).
- [Phase 0+1 Implementation Report](PHASE_0_1_IMPLEMENTATION_REPORT.md) —
  cancellation isolation + unified tokens/type/Monaco (implemented; unrun).

Method: static inspection of `src/`, `src/styles/`, `electron/main.cjs`,
`electron/preload.cjs`, and the agent/research/terminal services. The app was
not launched (no shell/GUI in this environment), so no screenshots were taken
and no pixel-level claim is asserted as seen. Every code claim is cited.

Stack (fixed, not to be replaced): Electron + React + TypeScript + Vite +
Monaco Editor.

Contents: [1](#1-executive-design-direction) direction ·
[2](#2-problems-in-the-current-ui) problems · [3](#3-final-product-information-architecture) IA ·
[4](#4-final-ide-layout) layout · [5](#5-ai-workspace-architecture-and-interaction) AI workspace ·
[6](#6-unified-agent-experience) agent · [7](#7-darklight-design-system) system ·
[8](#8-layout-dimensions-and-responsive-behavior) responsive · [9](#9-key-workflows) workflows ·
[10](#10-component-reuseconsolidation-map) reuse · [11](#11-implementation-roadmap) roadmap ·
[12](#12-risks-and-backward-compatibility) risks · [13](#13-accessibility-and-performance-requirements) a11y/perf ·
[14](#14-detailed-acceptance-criteria) acceptance · [15](#15-visual-qa-checklist) QA.

---

## 1. Executive design direction

One workspace. One shared agent engine. Three intelligent modes.

KryomCode is a single persistent IDE shell whose center is the Monaco editor,
whose left is a project sidebar, whose right is a dockable AI Workspace, whose
bottom is one integrated panel, and whose top and bottom chrome (compact
titlebar, single status bar) stays quiet. The defining workflow is
Research → Understand → Plan → Review → Execute → Verify, and the user must
never feel they are moving between unrelated applications.

Three modes, one engine:

- Chat — ask, explain, debug, discuss, understand project files.
- Research — investigate with evidence, references, citations, briefs.
- Build — plan, review, approve, edit multiple files, run, verify.

Model/provider selection (Meta Muse models via the provider catalog) is
orthogonal to mode selection. The mode answers "what kind of work is this?";
the model answers "which engine answers?". Changing the model never changes
the mode, the conversation, or the attached context.

Terminology (binding for all UI copy, file names, and docs):

- Meta Muse = an AI model/provider family. It is a picker value, a badge, a
  status segment. It is never a place, never a tab kind, never a workspace.
- Kryom Agent = the orchestration and execution system (planning, approvals,
  change-sets, checks, repair). It is the engine behind Build mode and behind
  every approval/verification surface.
- Run = one execution. Thread/session = a persistent task container. Plan =
  proposed steps. Change-set = file edits. Check = verification.

Design principles (inherited from the redesign blueprint, §1):

1. Editor first. Chrome shrinks; the code surface is the hero.
2. One system. One token graph, one radius scale, one type scale, one tab
   idiom, one composer kit.
3. Honesty is the brand. Real streaming or an honest clock; real verification
   or no checkmark; refusals shown as refusals.
4. Restrained identity. Graphite surfaces, one violet accent, one blue AI
   signal; no gradients, glows, or oversized playful cards.
5. Keyboard-complete. Every pointer flow has a key path; palette-first.
6. Preserve working systems. Consolidate surfaces; never rebuild honest,
   tested machinery (approvals, observed-run verification, origin-scoped
   cancellation, secret scrubbing) to match a mockup.

---

## 2. Problems in the current UI

Code-grounded (no screenshots were available; nothing below is asserted from
pixels). References point at the inspected tree.

1. Five disconnected AI experiences. Welcome-page Chat and Research
   (`WelcomePage.tsx`, `DiscoveryMode = 'chat' | 'research'`), Meta AI session
   tabs (`MetaAIWorkspace.tsx`, tab kind `meta-ai` in `workbench-tabs.ts`),
   the run console (`AgentWorkspace.tsx`, center stage), and the embedded
   Research panel each own a composer, a history, and a vocabulary (session /
   thread / run / brief). Context does not visibly travel between them.
2. Meta AI vs Coding Agent duplication. The activity bar registers both `ai`
   ("Meta AI", action, order 100) and `agent` ("Agent", center, order 95), and
   the center hosts both `MetaAIWorkspace` tabs and `AgentWorkspace` runs.
   A model family name and an orchestration system compete as destinations.
3. Mode switching lives in the titlebar. `Chrome.tsx` renders a Chat/Research
   segmented control in the 40 px titlebar, duplicated by the hero switch
   (`HomeHero.tsx`), while Intel/Platform/Agent switch via the activity bar
   and stage tabs — three switch idioms for "where am I?", plus a
   "← Back to editor" escape hatch because users get lost.
4. Oversized branding. The titlebar carries logo + full "KryomCode" wordmark
   next to the crumb, and the home hero takes the full center
   (`hero.css`, 27 px title, 56 px padding) while chat answers render at
   12 px — the welcome is grander than the work.
5. Two agent homes, four containers. Autonomous runs (stage) vs session tabs
   (editor) vs Implementation panel (`AgentPanel.tsx`) vs read-only Tasks
   report (`AgentTasksPanel.tsx`) split one mental model with different
   vocabularies (run / session / plan / tracked plan / impl plan).
6. Terminal is a command-run form, not a terminal. One-shot `runCommand()`
   per entry, fully buffered 100 KB output rendered after close, no pty, no
   stdin, input locked while running (`TerminalPanel.tsx`, terminal audit
   §1–§4). Good runner (validated, scrubbed, tree-kill, exit codes); wrong
   product surface for an IDE bottom panel.
7. No AI streaming anywhere. Chat, agent, and research answers arrive as one
   block after a spinner + elapsed clock (`AiChat.tsx`, `KryomAIResponse`
   has no stream fields). Honest, but unresponsive-feeling on long answers.
8. Composer friction. Ctrl+Enter-only send, fully disabled while loading (no
   queue), 12,000-char cap with no counter (`AiChat.tsx`, `MetaAIWorkspace.tsx`).
9. No command palette. `QuickOpen.tsx` (Ctrl+P) is files-only fuzzy search
   (3,000 indexed / 60 shown); no symbol/command modes.
10. Fixed 900 px floor. `body min-width: 900px` (`app.css:14`) plus
    `BrowserWindow minWidth 900 / minHeight 600` (`main.cjs:464-468`); below
    the floor is clipping, not adaptation. The 13-item activity bar has no
    overflow story for short windows.
11. Token duality (partly fixed). Phase 1 unified values under `tokens.css`
    with `--kryom-*` aliases, but base-rule surgery and legacy-block deletion
    were deferred — consumption still spans old and new names, and the
    quarantine test is the only guard.
12. Research rendering is flat. Claims, evidence, and uncertainty share
    generic `.plan-view` / `.plan-commands` containers (60+ reuses in
    `ResearchPanel.tsx`); the rich backend (credibility, evidence spans,
    depth profiles) has no distinct visual language.
13. Glyph icons and five tab idioms. `◧ ◫ ▶ ✓ ✕` unicode chrome plus
    `.editor-tab` / `.panel-tab` / `.session-tab` / `.research-tabs` /
    `.stage-tabs` with different heights and active treatments.
14. Settings are skeletal. Two sections (`general` | `providers`), a dead
    hidden Theme row (removed in Phase 0), a hardcoded 2-model list beside
    the real provider catalog (`SettingsModal.tsx`, `models.ts`).

What already works and must survive: origin-scoped cancellation
(user-terminal/diagnostics/agent + structural git isolation); approval
double-gate with main-side re-validation; observed-run verification
(`executionRunId`); secret scrubbing; dialog queue; workbench tab model with
split groups; token-integrity and Monaco-theme tests.

---

## 3. Final product information architecture

One activity bar selects the place. The center header names the place. No
other switch idiom selects places.

```
KryomCode
├─ Titlebar: icon · breadcrumb · command center · layout controls
├─ Activity bar (left, 48px)
│  ├─ Explorer ......... sidebar: project tree, file ops, git badges
│  ├─ Search ........... sidebar: file search (+ symbol search later)
│  ├─ Source Control ... sidebar: git status/commit/history (moved from bottom)
│  ├─ Run and Debug .... sidebar: diagnostics entry + debug console link
│  ├─ Extensions ....... sidebar: extensions/skills/workflows/templates
│  ├─ AI Workspace ..... right panel: Chat / Research / Build modes
│  ├─ Knowledge ........ right panel: research sessions, briefs, memory
│  ├─ History .......... right panel: AI threads, runs, transcripts
│  └─ Settings (bottom)  modal dialog (sections, see §4)
├─ Center: editor groups (Monaco) · welcome (no-project home) · diff views
├─ Right: AI Workspace panel (dockable/resizable, 300–520px)
├─ Bottom: Terminal · Problems · Output · Debug Console · Tasks
└─ Status bar: state · branch · file · language/cursor · model · tasks
```

Decisions:

- Intel/Platform hubs cease to be center destinations. Their tabs (project
  index, planning, specialists, quality, providers, integrations, perms,
  updates) move into the sidebar (Extensions), the AI Workspace (runs), and
  Settings — they never take over the editor.
- Source Control moves to the sidebar (VS Code-addressable); the bottom
  panel keeps no git tab. Git history stays reachable from the sidebar view.
- "Run and Debug" is a sidebar destination for diagnostics entry; live
  verification output stays with the agent run console (§6), and interactive
  debugging output lives in the bottom Debug Console.
- Knowledge (research sessions/briefs/memory) and History (threads/runs)
  are right-panel views sharing the AI Workspace dock, not center pages.
- No center stage. The center holds the editor, the welcome home, and diff
  views only. The "← Back to editor" button is deleted; the editor is one
  click away (Explorer double-click / Ctrl+1), surfaced in empty states.
- Exactly one switch idiom: the activity bar. The titlebar mode switch and
  the hero mode switch are both deleted (§4.A).

---

## 4. Final IDE layout

Target geography (1440×900 wireframe):

```
┌─ native menu: File Edit Selection View Go Run Terminal Help ────────────┐
│ [◈] my-project › src › theme.ts • │ ⌘ Search files, commands… │ ◧ ◩ ◪ │  40px titlebar
├──┬────────────┬──────────────────────────────────┬──────────────────────┤
│  │ EXPLORER   │ theme.ts ×  auth.ts ×  diff ⋮ ▾  │ CHAT · RESEARCH·BUILD│
│E │ 🔍 filter  │ ───────────────────────────────── │ ──────────────────── │
│x │ ▸ src      │  1  import …                      │ USER · 14:02         │
│p │ ▸ tests    │  2  …14px JetBrains, kryom-dark   │ 14px question…       │
│l │ M theme.ts │                                   │ ◆ KRYOM · Spark · 3s │
│o │ U new.ts   │  Minimap off · markers on         │ 14px answer…         │
│r │            │                                   │ ┌ code: main.ts ──┐  │
│e │────────────│ ─────── bottom (264px) ─────────── │ └─────────────────┘  │
│r │            │ TERMINAL·PROBLEMS 2·OUTPUT·DEBUG· │ [chips] [composer]   │
├──┴────────────┴──────────────────────────────────┴──────────────────────┤
│ ✓ ready · main* · theme.ts · TS · Ln42 · Spark 1.3 · 0 running          │  24px status bar
└──────────────────────────────────────────────────────────────────────────┘
```

### A. Compact titlebar (40px, keep height)

Contains only: 18px KryomCode mark (icon, no wordmark) · workspace/project
breadcrumb with dirty dot · compact command center (palette entry, files +
commands) · layout toggles (sidebar / right panel / bottom, real SVG icons
replacing `◧ ◫`) · autosave state moves to the status bar. DELETE the
Chat/Research segmented (`Chrome.tsx` `title-modes`) and the `Auto-save` chip
from the titlebar. Native menu and OS window controls stay native.

### B. Activity bar (48px)

Nine destinations, registry-driven (keep the `activity-registry.ts` engine,
trim membership). Order below is final; areas: S = sidebar, R = right panel,
M = modal.

| # | Label | Area | Tooltip | Shortcut | Active state |
|---|-------|------|---------|----------|--------------|
| 1 | Explorer | S | Explorer (project files) | Ctrl+Shift+E (keep) | accent indicator + filled icon |
| 2 | Search | S | Search in project | Ctrl+Shift+F (keep) | same |
| 3 | Source Control | S | Git status, commit, history | Ctrl+Shift+G (keep) | same + count badge |
| 4 | Run and Debug | S | Diagnostics and debug | Ctrl+Shift+D (keep) | same |
| 5 | Extensions | S | Extensions, skills, workflows | Ctrl+Shift+X (new) | same |
| 6 | AI Workspace | R | Chat, Research, Build | Ctrl+Shift+A (repurposed) | same |
| 7 | Knowledge | R | Research briefs and memory | Ctrl+Shift+K (new) | same |
| 8 | History | R | Threads, runs, transcripts | Ctrl+Shift+H (new) | same |
| 9 | Settings | M | Settings (bottom-pinned) | Ctrl+, (new) | dialog open state |

Removed ids: `git`+`run` panel items (→ sidebar destinations above), `intel`,
`platform`, `agent` center items (→ §3), `ai` action (→ AI Workspace, §5/§6),
`home` center item (→ welcome is automatic when no project/tabs, reachable via
palette otherwise), `tools`/`memory`/`account` (→ Extensions / Knowledge /
Settings-Account section). Legacy stored ids (`connections`, `profile`, and
any removed id) fall back to Explorer via the existing `readLocalActivity`
guard. The bar scrolls with a fade for short windows (fixes 600px heights).

### C. Explorer sidebar (260px default, 180–420, persisted, resizable)

Project tree with file/folder ops (new/rename/delete/duplicate), visible
filter box, git badges with an in-view legend (M/U/S), native context menus
until a DOM menu reaches parity, breadcrumbs in the editor header. Empty
state (no project): Open project · New project · Recent list · Clone (when
available) — never a dead tree. The sidebar never exceeds 420px and collapses
to an overlay drawer below 900px (§8).

### D. Main editor (largest share, always)

Monaco with generated `kryom-dark`/`kryom-light` themes (Phase 1, keep),
JetBrains Mono 14px default (10–24 adjustable, keep mechanics), minimap off,
diagnostics markers on. Tab management: unified code tabs in split groups
(keep `workbench-tabs.ts` code model); ADD drag-reorder, pinned tabs, preview
tabs, overflow menu; KEEP dirty dots, context menu, keyboard nav. Meta AI tab
kind is retired once threads move into the AI Workspace (§5, §10); until
then it stays byte-compatible. Breadcrumb row above tabs; file status +
diagnostics in-tab; contextual AI actions (Explain selection, Send to Chat,
Send to Build) via selection menu and command palette.

### E. AI Workspace panel (right, dockable/resizable)

The full spec is §5. Dock behavior: right-side, 360px default, 300–520
range, persisted per window; collapsible to the activity bar; never overlays
the editor except below 900px (§8). Default conversation is clean: messages
only — no permanent cards, no metadata walls. Context, plans, approvals,
diffs, and checks appear as inline attachments and drawers (§5/§6).

### F. Bottom panel (one panel, five tabs)

Tabs: Terminal · Problems (count badge) · Output · Debug Console · Tasks.
264px default, 120–600 range, persisted; resizable via the existing handle +
FitAddon reflow when xterm lands; collapsible (Ctrl+J); per-tab Clear;
maximize toggle. Git leaves the bottom (→ sidebar). Agent execution and
interactive terminal processes are architecturally separate: agent checks and
diagnostics keep the buffered `runCommand` path with origin tagging; user
shells move to `pty:*` in the future terminal milestone — the two never share
a cancel path (§6, §11.F).

### G. Status bar (single, 24px)

Segments, left→right: panel toggle · status message · running indicator
(scoped counts: "1 terminal · 1 check") · workspace name · git branch
(click → Source Control) · file + dirty · language · cursor · model badge
(Meta Muse · Spark 1.3, click → model picker) · provider state (click →
Provider Settings) · autosave · diagnostics summary (click → Problems) ·
agent state pill ("● executing run #12", click → run console). Compact mode
below 1280px hides language/cursor. No duplicate indicators: the titlebar
chip and any second branch/model display are removed.

---

## 5. AI Workspace architecture and interaction

One panel, three modes, one engine, one conversation. Switching modes never
loses context: the thread (messages, attachments, research brief, plan, run)
travels with the mode switch, and the mode only changes what the composer and
surface offer next.

Workspace wireframe (Chat mode shown; Research/Build share the frame):

```
┌─ AI WORKSPACE ─────────────────────────────────────────┐
│ [Chat|Research|Build]  [thread ▾] [history] [＋ new]   │  mode segmented + threads
│ [◆ Spark 1.3 ▾] [Context ✓] [file · +2 · brief §2 ⓘ]  │  model + context (independent)
├─ messages ─────────────────────────────────────────────┤
│ ┌ user ─────────────────────────────── [copy] [build]┐ │
│ │ YOU · 14:02 · ~1.2k chars                        │ │
│ │ 14px question text…                              │ │
│ └──────────────────────────────────────────────────┘ │
│ ┌ assistant ─────────────────── [copy] [retry] [pin]┐ │
│ │ ◆ KRYOM · Spark 1.3 · 3.2s                       │ │
│ │ 14px/1.6 answer, 20px rhythm                     │ │
│ │ ┌ code: main.ts ─────── [copy] [build] [wrap] ─┐ │ │
│ │ │ 12px JetBrains, numbers past 8 lines        │ │ │
│ └────────────────────────────────────────────────┘ │
│ ▸ streaming caret + elapsed + [Stop] (or clock)     │
├─ composer ─────────────────────────────────────────────┤
│ [chips: active file · +2 excerpts · brief §1–§4 ×]     │
│ ┌ textarea: Enter=send, Shift+Enter=newline ────────┐ │
│ │ Ask about your code…               1,204 / 12,000│ │
│ └──────────────────────────────────────────────────┘ │
│ [＋ Attach] [@ file] [model]        [Stop]/[Send ↑]  │
└────────────────────────────────────────────────────────┘
```

Mode surfaces:

- Chat: the conversation above. Ask/explain/debug/discuss. Code blocks carry
  Copy + Send-to-Build. No file edits happen here, ever (keep the
  `AiChat.tsx` routing guarantee).
- Research: objective input + depth + model + Run (keep `ResearchPanel`
  machinery); progress with step x/y + elapsed + Cancel-with-partial-results;
  tabs Overview · Plan · Sources (n) · Evidence · Findings · Report; claim /
  evidence / caveat card species with confidence badges (color + text, never
  color alone); citation chain claim [n] → source card (quote + URL + host +
  accessed-at + credibility); Copy-with-citations; header handoffs Ask in
  Chat / Implement in Build with an attach-preview popover.
- Build: the run console (§6): sticky RunHeader, pinned approvals, filterable
  timeline, detail drawer, composer with templates + blast-radius preview.
  Switching Chat → Build keeps the thread: the last answer becomes proposable
  task context, attachments persist, the brief stays attached as cited
  context with visible section refs.

Shared agent engine (one orchestration layer behind all modes):

- Conversation context + project context + research context in one thread
  record; model selection; tool access; planning; execution; approval gates;
  verification; task history. One thread record, three lenses.
- Model selection is a header picker in every mode, backed by the provider
  catalog (`useProviderModels('meta')` + fallback). Changing models
  mid-thread labels subsequent messages with the new model; history keeps
  per-message model labels. No mode owns a model; no model owns a mode.
- Meta AI duplication resolved: the `ai` activity action, the `meta-ai` tab
  kind, and the "Meta AI session" vocabulary are all retired once threads
  live in the workspace (§10). "Meta Muse · Spark 1.3" survives only as a
  model badge, a picker, and a status segment.

Composer contract (all three modes, one `Composer` kit component):

- Multiline textarea, resizable (drag + auto-grow to 200px, then scroll).
- Enter = send, Shift+Enter = newline, Ctrl+Enter = send (kept for existing
  users), Esc = stop while busy / clear drafts otherwise. A visible Send
  button always exists; keyboard alternatives are documented, not required.
- Live character counter against the 12,000 cap; stays enabled while
  loading — typing queues a follow-up draft with a visible "queued" chip;
  Send becomes Stop; the queued draft sends after.
- Attachments: ＋ Attach (file picker → excerpts, max 8, per-file chars +
  total budget bar), @ file reference, drag-drop, removable chips, research
  brief attach with section refs. Secret-scan note preserved.
- Stop/cancel: per-request Stop (button + Esc + generation guard against late
  responses, keep `AiChat` mechanics); agent stops use the origin-scoped
  channels (§6), never a global kill.

Message rendering: role eyebrow (10px caps + timestamp + ~chars) + 14px/1.6
bodies; assistant header adds AI glyph + model badge + latency; MarkdownLite
extended (tables, autolinked URLs, task lists, footnotes `[^n]`, keep the
no-HTML guarantee); code blocks with filename label, line numbers past 8
lines, wrap toggle, collapse past 40 lines, Copy + Send-to-Build; answers
past 60 lines collapse; per-message Copy / Retry-assistant / Pin-into-context.

States: empty (suggestion chips + 3 recent prompts + "attach active file"
one-click), loading (streaming caret + elapsed + Stop, or honest clock —
never fake tokens), error (classified title, Provider Settings link,
Retry-if-retryable, Dismiss — keep mechanics), completed (latency + model +
export .md), queued (visible chip), cancelled (partial-results note where
applicable). First a `useStreamText` seam that resolves one block today and
consumes `ai:stream` chunks later (UI ships once, transport swaps under it).

---

## 6. Unified Agent experience

One agent, one story. Within one glance the run console answers: doing /
changing / approval / verified. It is the Build-mode surface (§5) and the
only agent surface — `AgentWorkspace` (stage) and `MetaAIWorkspace` (tabs)
converge into it by extraction, not by rewrite.

Run console wireframe (Build mode):

```
┌─ RunHeader (sticky) ───────────────────────────────────┐
│ ● EXECUTING · run #12 · "Add dark-mode toggle"  [⏸][⏹]│  state dot + text
│ task · Spark 1.3 · 3 files · 2/5 checks · 04:12 [hist▾]│
├─ approvals (only when pending — pinned above timeline) ──┤
│ ⚠ APPROVAL: run `npm test` ?   [Approve] [Deny]        │  exact command+risk
│ touches 3 files · 0 deletions · policy: test-only ✓     │
├─ timeline (filterable) ──────────────────────────────────┤
│ [All][Approvals][Changes][Checks][Errors]    [follow ✓]│
│ 14:02:11 ◆ planning — 4 steps proposed      [view plan]│
│ 14:03:02 ✎ change  src/ui/theme.ts +48 −12  [diff]     │
│ 14:04:40 ✓ check  `npm test` exit 0 · 212ms [output]   │
├─ detail drawer (right, collapsible) ─────────────────────┤
│ diff / output / plan JSON for the selected event        │
└──────────────────────────────────────────────────────────┘
```

Consolidation (no backend rewrite):

- One home: shared presentational components in `src/components/agent/` —
  `RunHeader`, `TaskComposer`, `PlanApprovals`, `RunTimeline`, `ChangeDiffs`,
  `VerifyChecks`, `RunSummary` — extracted from `AgentWorkspace` /
  `AgentPanel` / `AgentTasksPanel`. Extract, don't fork: each extraction
  migrates all call sites and deletes the old CSS. No `Button2`-style
  parallel implementations.
- One vocabulary: run / thread / plan / change-set / check. Labels renamed;
  backend ids untouched. Impl plans, specialist runs, and orchestration runs
  link bidirectionally ("created by run #12", "spawned specialist run →").
- Multi-file changes: change-set manifest ordering (keep), per-file headers
  (path, +/− stats, create/modify/delete badge), unified + side-by-side
  toggle, collapse past 200 lines, per-hunk Approve/Reject (backend already
  applies per-edit — surface it), prominent "open in editor", checkpoints/
  undo with a "what changed since run start" file list, per-hunk and per-run
  revert.
- Checks: real output + exit codes (keep), ANSI color via the shared xterm
  renderer when it lands, wrap toggle, copy-all, duration, re-run-single-
  check; "refused by policy" stays visually distinct from failure.
- Summary: deterministic result grid (keep) + changed-since-run file list +
  next-suggested action ("2 checks failed → Start repair?") + export run
  transcript (.md).
- Composer: task templates (bugfix / feature / refactor / chore),
  blast-radius preview (files matched by context search),
  plan-preview-before-run toggle, research attach (exists — surface it),
  explicit history attach only (`AgentHistoryPicker` mechanics kept).
- Approvals pinned above the timeline, never buried: exact command or file
  list, blast-radius line, policy note, keyboard (A approve / D deny when
  focused, documented). Cancel/pause confirm when edits are applied-but-
  unverified ("3 changes applied, 0 verified — pause?").
- Timeline: grouping by phase, filter lenses, severity color + icon + text
  (never color alone), timestamps, follow-toggle, per-event detail drawer
  instead of infinite inline expansion. `role="log"`, virtualized past
  ~200 events.

Research-to-build workflow: Research header "Implement in Build" attaches the
brief (§1–§4 or selected sections, shown in a preview popover) as cited
context on a new Build task; the plan cites brief sections; the run timeline
links back to the brief; the brief gains a "used in run #12" reverse link.
Chat → Build carries the thread (§5); nothing is retyped.

Security gates preserved byte-for-byte in behavior: approval double-gate
(renderer propose + main-side re-validation of server-issued ids); policy
refusals rendered as refusals; origin-scoped cancellation
(`agent:cancel-verification` kills agent-origin checks only — never user
terminal or diagnostics); agent verification keeps the buffered `runCommand`
path forever and MUST NEVER call `pty:*` (enforced by review + an
`invokedBy: 'user-terminal'` assertion on pty spawn); no auto-run into
interactive shells — "Run in terminal" inserts text and requires Enter.

---

## 7. Dark/light design system

Start from the Phase 0/1 work. Do not create another token system. The job
now is consolidation: finish migrating consumption to `--kc-*`, fold the
refinement layer into base rules with visual baselines, then delete legacy
blocks. The quarantine test (`theme-tokens.test.ts`) stays green throughout.

### Token authority

- `src/styles/tokens.css` (imported first): theme-independent globals
  (fonts, type scale, radii, spacing, elevation, z-index, motion) + Premium
  Dark values + `--kryom-*` alias shim. `src/styles/theme.css` (imported
  last): Professional Light values for the same graph. No new colors, radii,
  or type sizes outside these two files.
- Dark surfaces: bg `#0E0F13` · sidebar `#14151B` · editor `#101116` · panel
  `#17181F` · raised `#1E1F29` · input `#121318` · strip `#1B1C26`; text
  `#E7E7EC` / dim `#B9B9C6` / faint `#8E8E9B` (11px+ only) / ghost `#6B6B78`
  (decorative only); accent violet `#8B7CFF`, accent button `#6556C8`,
  AI blue `#2E9BFF`, link `#7AA8FF`; status ok `#7EE2A8` / warn `#E8C874` /
  danger `#FF8F9A` with bg/border/soft companions.
- Light surfaces: bg `#F2F2F5` · sidebar `#ECECF0` · editor/panel `#FFFFFF` ·
  raised `#FFFFFF` + 1px border + `0 4px 16px rgba(20,20,40,.08)` (menus and
  dialogs only); text `#191A20` / `#4E4E59` / `#6E6E78`; accent `#5F4FD6`,
  AI/link `#0B5FFF`; status companions per the Phase 1 report (§9).
- Every text token ships a declared pair and floor: primary ≥ 12:1,
  secondary ≥ 7:1, tertiary ≥ 4.5:1, on-fill ≥ 4.5:1. Floors are asserted by
  the token harness; axe/Lighthouse sign-off on the five key views happens
  in the polish phase (§11.E). No contrast claim is asserted as measured
  until tooling passes.
- Full dark/light tables: Phase 1 report §8–§9 (authoritative values, not
  repeated here beyond the summary above).

### Typography / spacing / shape / motion

- Inter Variable (UI) + JetBrains Mono Variable (code/terminal), bundled
  offline via Fontsource (OFL-1.1), `font-display: swap`; fallbacks
  `system-ui, 'Segoe UI', …` and `'Cascadia Code', Consolas, monospace`.
  Monaco uses the same mono stack, 14px default.
- Scale: UI default 13px; reading (chat/research/agent/output prose) 14px;
  dense UI 12px; captions/tabs/status 11px; eyebrows 10px (labels only, never
  meaning alone); section titles 16–20px; home hero 27px only. Mono:
  code 12px, terminal 13px (user-adjustable 11–16), Monaco 14px (10–24).
  Tabular numerals for times/counters. Nothing below 10px.
- Radii (only these): s 4 · m 6 · l 8 · xl 12 · pill 999. Delete 5/7/10/14/
  20px one-offs as components migrate to the kit (§10).
- Spacing: xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32. Elevation: menu
  `0 8px 24px rgba(0,0,0,.45)`, dialog `0 16px 48px rgba(0,0,0,.5)` (dark);
  minimal shadows, no gradients or glowing borders anywhere.
- Focus: 2px accent outline + `:focus-visible` on every new interactive
  component; skip link ("Skip to editor"); landmark audit. Hover: subtle
  wash (`rgba(255,255,255,.05)` dark / `rgba(20,20,40,.05)` light); active:
  strip fill; disabled: dedicated tokens (fg/bg/border), never bare opacity
  on faint text. Motion: fast 120ms / base 180ms; global
  `prefers-reduced-motion` kill-switch (Phase 1 installed it — extend to all
  new spinners/transitions); streaming caret is static under reduced motion.
- Semantic mapping: accent = interactive/brand; AI blue = model/AI signal
  (badges, glyphs, streaming caret); link = links; info/warn/danger
  companions = status cards only. One accent doing six jobs was the old bug;
  each token has one job now.

---

## 8. Layout dimensions and responsive behavior

Grounded in actual constraints, not imposed: `BrowserWindow` 1440×900
default, `minWidth 900 / minHeight 600` (`main.cjs:464-468`); `body
min-width: 900px` (`app.css:14`); panel limits left 180–420 (fallback 260),
bottom 120–600 (fallback 264) with window-aware clamping (`App.tsx:105-128,
396-409`); activity bar 48px; titlebar 40px; status bar 24–26px.

Minimum supported dimensions: 900×600 stays the floor for this milestone
(it is the shipped floor in both CSS and the window). Below-floor behavior
is graceful adaptation, not clipping:

| Viewport | Sidebar | AI panel | Bottom | Status | Editor |
|----------|---------|----------|--------|--------|--------|
| ≥1440×900 | docked 260 | docked 360 | docked 264 | full | full |
| 1280–1440 | docked 260 | docked 320 | docked 240 | compact (hide language/cursor) | full |
| 900–1280 | docked, min 180 | docked, min 300 | docked, min 120 | compact | shrinks, tabs get overflow menu |
| 900 wide edge | overlay drawer (non-modal) | overlay drawer | full-width sheet | compact | keeps ≥ ~420px |
| <900 (unsupported) | overlay only | overlay only | sheet | compact + graceful note | never clips; window floor stays 900 |

Rules:

- Sidebar collapse: toggle (Ctrl+B) hides to the activity bar; below 900px
  it opens as a non-modal overlay drawer that dismisses on Esc/outside.
- AI panel collapse: toggle (Ctrl+Shift+A selects; Esc or toggle collapses);
  below 900px it overlays from the right; threads, drafts, and runs survive
  collapse (hidden, not unmounted — keep the existing hidden-persist
  mechanics for runs/hubs).
- Bottom panel: resizable 120–600, collapsible (Ctrl+J), maximize toggle;
  below 760px height it becomes a full-width sheet above the status bar.
- Panel resizing: existing `ResizeHandle` + clamping kept; ADD xterm
  FitAddon reflow when the renderer lands, and pty resize (cols/rows) in the
  future terminal milestone. No resize may push the editor below ~420px or
  steal keyboard focus.
- Overflow: tab strips (editor, sessions, research, bottom) get scroll +
  overflow menus; the activity bar scrolls with a fade; long crumbs, chips,
  and model names ellipsis-guard (existing guards kept).
- Layout persistence: sidebar/bottom/AI widths, open tabs, active mode,
  thread selection, and bottom tab persist across restarts (extend the
  existing settings + `session-restore` + localStorage keys; retired keys
  keep their startup cleanup). Reset-to-defaults restores 260/264/360.
- 1366×768 (small laptop): sidebar 180 + AI 300 + editor ~830 — usable
  without overlays; status compact. 1440×900 (default): full three-column
  with defaults. 1920×1080: editor breathes; AI panel may widen to 420 by
  user choice; no content max-widths that waste space except reading
  surfaces (chat/research prose cap ~720px for line length, code scrolls).
- HiDPI: SVG-only icons in chrome; verify 125%/150%/200% Windows scaling per
  phase (§15).

---

## 9. Key workflows

Each flow names the surfaces it touches; none crosses an application
boundary because there are none left.

1. Launch with no project. Welcome home in the center (recent projects,
   Open, New, Clone) + Explorer empty state + AI Workspace available in
   Chat mode (project-less threads load at startup, keep `meta-sessions`
   mechanics). Status shows "No project selected".
2. Open an existing project. Palette / menu / welcome → folder picker →
   Explorer populates with git badges, project sessions restore, diagnostics
   run entry appears, status shows workspace + branch. Tabs from
   `session-restore` reopen.
3. Create a new project. Template picker (existing dialog, moved under
   File menu + welcome) → scaffold → opens as in flow 2 with a README
   preview tab.
4. Start an AI conversation. AI Workspace → ＋ new (Ctrl+Alt+N) → thread
   opens in Chat with active-file context chip offered; type, Enter sends.
   Thread persists per project (keep the 50-cap, stale-save merge).
5. Switch Chat → Research → Build without losing context. Mode segmented in
   the workspace header; the thread (messages, chips, brief, plan, run)
   persists; the composer and surface adapt (§5). Research attach-preview and
   Build task-prefill confirm what travels; nothing retypes.
6. Research a scientific topic. Research mode → objective + depth + model →
   Run → determinate step progress + elapsed + Cancel → Sources/Evidence/
   Findings/Report tabs with claim/evidence/caveat cards, confidence badges,
   citation chain, Copy-with-citations, export .md/.html (print-CSS .pdf
   later, no new dep).
7. Research → implementation task. "Implement in Build" → preview popover
   (brief §1–§4 as cited context) → Build composer prefilled, brief attached
   → plan cites sections → run links back → brief shows "used in run #12".
8. Agent modifies multiple files. Build composer (template + blast-radius
   preview + plan-preview toggle) → plan proposed → approvals (exact files /
   commands / risks) → per-hunk diffs → apply → checks run → summary.
9. Review and approve changes. Approvals pinned above the timeline with
   blast radius + policy note; diffs unified/side-by-side, collapse >200
   lines, per-hunk Approve/Reject, open-in-editor; A/D keyboard when focused.
10. Run tests and verify. Checks run via origin-tagged `runCommand`
    (`origin: 'agent'`), real output + exit codes + durations; re-run single
    check; "verified" appears only for observed runs. Refusals render as
    refusals, never failures.
11. View diffs and revert. Change-set manifest order; per-hunk and per-run
    revert; checkpoints/undo with "changed since run start" list; post-repair
    summaries name what changed.
12. Terminal and diagnostics. Bottom Terminal tab runs user commands
    (run-form today, pty tabs in the future milestone); Problems tab lists
    diagnostics with click-to-marker; Debug Console shows debug output; each
    Stop kills only its own origin (terminal/diagnostics/agent).
13. Switch AI models. Header picker or status model badge → catalog-backed
    list with current-model fallback; per-message model labels; in-flight
    requests keep their model; provider failures route to Provider Settings
    from the error box.
14. Restore previous sessions. Restart reopens tabs, threads, runs history,
    briefs, and panel layout; transcripts exportable (.md); jump-to-latest on
    scroll-up; rename-inline, pin, status filters in History/Knowledge.

Interaction contracts across flows: command palette (Ctrl+Shift+P commands,
Ctrl+P files, `@` symbols later — QuickOpen fuzzy core extracted to
`utils/fuzzy.ts`); global search (name/content kept, recent searches
persist); context menus (Explorer native until DOM parity, editor tabs DOM);
drag-drop (files into composer/attachments, editor tab reorder/split);
resizable panels (§8); notifications (transient toasts + Output log entries,
never modal for non-blocking events); approval dialogs (pinned, not modal,
except the unskippable native destructive gate — keep); loading/error states
per §5 (honest clock/caret, classified errors, retry scoping).

---

## 10. Component reuse/consolidation map

Rule: reuse as-is where honest; consolidate by extraction (migrate all call
sites, delete old CSS, no parallel `X2`); remove only after the replacement
is verified green + manually journey-tested. Nothing below is deleted in this
milestone — this table authorizes future phases.

| Component / area | Verdict | Notes |
|---|---|---|
| `activity-registry.ts` engine | REUSE | Keep registration/validation; trim builtins to §4.B nine |
| `ActivityBar.tsx` | CONSOLIDATE | Same component, new membership + scroll/fade + SVG set |
| `Chrome.tsx` TitleBar | CONSOLIDATE | Delete `title-modes`; icon-only brand; add command center; SVG layout toggles |
| `Chrome.tsx` StatusBar | CONSOLIDATE | Same segments + agent pill + model badge; compact mode |
| `Explorer.tsx` | REUSE + extend | Add filter box, badge legend; keep tree/ops/menus |
| `SearchPanel.tsx` | REUSE + extend | Keep modes; persist recents; symbol `@` later |
| `GitPanel.tsx` | MOVE | Bottom → sidebar view; keep toolbar/lists/commit; add history |
| `EditorPanel.tsx` + `EditorTabs.tsx` | REUSE + extend | Keep Monaco wiring/themes; add reorder/pin/preview/overflow/breadcrumbs |
| `workbench-tabs.ts` | REUSE, then shrink | Keep code model + splits; retire `meta-ai` + `extension` kinds after workspace migration |
| `WelcomePage.tsx` + `HomeHero.tsx` | CONSOLIDATE | Slim hero (no mode switch); welcome = automatic home, not a destination |
| `AiChat.tsx` | CONSOLIDATE | Becomes Chat mode: 14px, Enter-send, queue, counter, streaming seam; keep honesty/error/retry/history mechanics |
| `ChatSessions.tsx` | CONSOLIDATE | Becomes thread switcher inside the workspace + History view |
| `MarkdownLite.tsx` | EXTEND | Add tables/autolink/task lists/footnotes; extract `CodeBlock`; keep no-HTML guarantee + tests |
| `ResearchPanel.tsx` | CONSOLIDATE | Becomes Research mode + Knowledge entries; card species + citations; keep services/polling/handoffs |
| `AgentWorkspace.tsx` | CONSOLIDATE | Run console core → Build mode; extract `agent/*` kit |
| `AgentPanel.tsx` | CONSOLIDATE | Plan/review/apply + checkpoints → Build detail drawer + `agent/*` |
| `AgentTasksPanel.tsx` | CONSOLIDATE | Read-only report → History transcripts; backend-records-only rule kept |
| `MetaAIWorkspace.tsx` | RETIRE after replacement | Threads move to workspace; `useMetaWorkspace`, prompts, history picker merge; delete only when journey tests pass |
| `AgentHistoryPicker.tsx` | REUSE | Explicit-attach-only + ranking + project isolation kept |
| `history-relevance.ts`, `meta-timeline.ts`, `intent.ts` | REUSE | Ranking/classification/intent logic untouched |
| `IntelligenceHub.tsx` | DISPERSE | Tabs → Extensions sidebar / Build / Settings; no center home |
| `PlatformHub.tsx` | DISPERSE | Tabs → Extensions sidebar / Settings; no center home |
| `TerminalPanel.tsx` | REUSE, then layer | Keep run-form + scoping; xterm renderer (T1), pty tabs (future) |
| `ProblemsPanel.tsx` | REUSE + extend | Keep list/run; scoped Stop kept; click-to-marker; count badge |
| `OutputPanel.tsx` + `output-log.ts` | REUSE | Renderer event log kept; per-tab Clear |
| `TasksPanel.tsx` | REUSE | Column lists kept in bottom panel |
| Debug Console | NEW (thin) | Bottom tab over existing diagnostics/debug output paths |
| `dialogs.tsx` queue | REUSE | FIFO + focus return + tests untouched |
| `SettingsModal.tsx` | CONSOLIDATE | Sections: General / Appearance / AI & Models / Terminal / Keyboard / Account / Advanced + search |
| `QuickOpen.tsx` | EXTEND | Extract fuzzy core; grow into palette (commands, then symbols) |
| `ShortcutsDialog.tsx` | EXTEND | New rows only for wired shortcuts (palette, model, mode, approve/deny) |
| `AboutDialog`, `DiagnosticsDialog`, `TemplatePickerDialog` | REUSE | Keep; repoint entry points |
| `Connections/Profile/Memory/Extensions` panels | REDISTRIBUTE | → Extensions sidebar / Knowledge / Settings-Account |
| `tokens.css` + `theme.css` + token tests | REUSE + consolidate | Only token authority; migrate consumption, fold refinement into base, delete legacy blocks last |
| `monaco-themes.ts` + setup + tests | REUSE | Keep generation + registration; extend rules as needed |
| Origin-scoped cancel, approvals, `runCommand`, scrubbing, tree-kill | REUSE (frozen behavior) | May gain UI, never lose guarantees; covered by existing + new tests |
| `panelRightWidth` setting, `TerminalPanel` self-contained variant, retired keys | REMOVE when safe | Dead surface; remove with tests green + no references |

Shared kit to build (`src/components/ui/`, each with CSS + test + ≥2 call
sites before it ships): `Button` · `Icon` (SVG, 16/20px) · `Tabs` · `Composer`
· `CodeBlock` · `DiffView` · `Markdown` · `EmptyState`/`ErrorState`/
`LoadingDots` · `SearchInput` · `Segmented` · `Badge`/`Chip`/`StatusDot` ·
`Tooltip` · `Menu` (DOM) · `Drawer` · `VirtualList`. Order: Markdown +
CodeBlock → Button + Tabs + Segmented → Composer → DiffView → states/inputs/
icons/tooltip/menu. Codemod tokens + radii + type first so extractions land
on final values.

---

## 11. Implementation roadmap

Incremental, each phase shippable alone. Global gates per phase: `npm test` +
`npm run test:renderer` + `check:syntax` + `check:workbench` +
`check:test-manifest` + `npm run build` green; dark/light screenshots at
1440/900 archived; journey checklist (§14) manually passed. No phase rebuilds
working systems; removals happen only after replacement verification.

### Phase A — Unified IDE Shell

- Scope: compact titlebar (§4.A); activity bar 9 destinations (§4.B) with
  scroll/fade; sidebar organization + Explorer filter/legend + empty states;
  center = editor/welcome/diffs only (stage retired, hubs dispersed);
  status bar consolidation (§4.G); navigation cleanup (delete title/hero mode
  switches, "← Back to editor", duplicate indicators); command palette v1
  (commands + files via extracted fuzzy core).
- Reuse: registry engine, Chrome/Explorer/Search/Editor/QuickOpen/dialogs,
  panel resize + persistence mechanics, token system.
- Consolidate: TitleBar, StatusBar, ActivityBar membership, welcome hero,
  hub tabs into Extensions/Settings.
- Remove after verified: `title-modes` block, hero mode switch, `intel` /
  `platform` / `agent` / `ai` / `home` / `git` / `run` / `tools` / `memory` /
  `account` activity ids (with legacy-id fallback kept), stage container.
- Dependencies: none (starts immediately). Risks: shortcut churn
  (repurposed Ctrl+Shift+A, new Ctrl+Shift+X/K/H, Ctrl+,) — mitigate with
  Shortcuts dialog + palette discoverability; hub dispersal content audit.
- Acceptance: §14.A. Regression: existing App/ActivityBar/Chrome/session
  tests + new registry-membership + palette tests. Manual: all 14 flows' nav
  steps, restart persistence, 900/600 window behavior.

### Phase B — Unified AI Workspace

- Scope: right dock (360 default, 300–520, persisted, collapsible, overlay
  <900px); Chat + Research modes in the workspace; thread record shared
  across modes; `Composer` kit (Enter-send, queue, counter, chips,
  drag-drop); message rendering (§5); `useStreamText` seam (one block now);
  MarkdownLite extensions + `CodeBlock` extract; History + Knowledge views;
  model picker independent of mode; retire `DiscoveryMode` title/hero hosts.
- Reuse: `AiChat` honesty/error/retry/history mechanics, `ChatSessions`
  persistence, `ResearchPanel` services/polling/handoffs, provider catalog.
- Consolidate: `AiChat` → Chat mode, `ResearchPanel` → Research mode,
  `ChatSessions` → thread switcher + History, `MarkdownLite` + CSS.
- Remove after verified: `WelcomePage` Chat/Research hosting (welcome keeps
  home content), `DiscoveryMode` prop plumbing in Chrome/App.
- Dependencies: Phase A (dock + palette + activity destinations). Risks:
  thread-record migration (project + global sessions) — migrate with
  versioned loaders + fallback to legacy files; composer behavior change
  (Enter-send) — keep Ctrl+Enter + setting + announcement.
- Acceptance: §14.B. Regression: AiChat/ChatSessions/MarkdownLite suites
  extended; new Composer + thread-migration tests. Manual: flows 4–7, 13–14.

### Phase C — Shared Agent Experience

- Scope: Build mode = run console (§6); `agent/*` kit extraction;
  planning/approval/execution/verification in one surface; multi-file
  change-sets with per-hunk review + revert; research-to-build workflow with
  cited context + reverse links; task templates + blast-radius preview;
  agent state pill in status bar; retire `meta-ai` tab kind + `ai` action +
  stage `AgentWorkspace` once journey-tested.
- Reuse: autonomous-run/plan-store/tool-policy/checkpoint backends,
  `AgentHistoryPicker`, approval + origin-scoped cancel + observed-run
  verification (frozen behavior), change-set ordering.
- Consolidate: `AgentWorkspace` + `AgentPanel` + `AgentTasksPanel` →
  `agent/*` kit + Build mode + History transcripts.
- Remove after verified: `MetaAIWorkspace` (+ `useMetaWorkspace` merge),
  `meta-ai` tab kind, `extension` tab kind if still producer-less, stage
  agent container.
- Dependencies: Phase B (workspace dock, Composer, thread record). Risks:
  "two homes" transition confusion — mitigate with in-product pointers
  ("runs moved to Build") for one release; per-hunk approve surfacing must
  not change apply semantics — covered by plan-store/change-set tests.
- Acceptance: §14.C. Regression: agent backend suites untouched-green; new
  kit component tests + cross-surface journey test. Manual: flows 5, 7–11.

### Phase D — Integrated Workbench

- Scope: bottom panel five tabs (Git → sidebar, Debug Console added);
  per-tab Clear + maximize + count badges; editor/AI integration (selection
  actions, Send-to-Chat/Build, click-to-marker everywhere); drag-reorder/
  pin/preview/overflow editor tabs; breadcrumbs; panel resize hardening
  (§8 rules); xterm T1 render layer over `runCommand` (ANSI, selection,
  scrollback, font settings) with `<pre>` fallback setting — honest runner,
  still a runner.
- Reuse: bottom mechanics, `TerminalPanel` controller + scoping, Problems/
  Output/Tasks, `ResizeHandle`, EditorPanel/Monaco wiring.
- Consolidate: `GitPanel` move, tab idioms into `Tabs` kit, button/input
  families into kit, tooltips → `Tooltip` progressively.
- Remove after verified: bottom Git tab (after sidebar parity), old tab CSS
  per migrated surface, unicode chrome glyphs.
- Dependencies: Phase A (shell); xterm T1 needs no other phase but ships
  here. Risks: sidebar Git discoverability — mitigate with palette +
  status-branch clickthrough; xterm bundle/packaging — pure JS, low risk,
  `pack` smoke required.
- Acceptance: §14.D. Regression: terminal/problems/git/output suites +
  new Git-move + T1 renderer tests. Manual: flows 2–3, 9–12, resize matrix.

### Phase E — Professional Polish

- Scope: dark/light refinement with visual baselines; token-consumption
  migration + refinement-into-base + legacy-block deletion (quarantine green
  throughout); Settings sections + search; keyboard map completion; responsive
  behaviors (§8 table); reduced-motion/contrast/forced-colors audit;
  performance pass (virtualization, poll hygiene, Markdown memoization);
  `pack`/`dist` smoke per platform.
- Reuse: everything; this phase deletes (legacy CSS, dead settings, glyphs).
- Consolidate: final kit sweep (remaining one-off buttons/tabs/chips/cards).
- Remove after verified: legacy value blocks, hardcoded color leaks, radius
  one-offs, dead Theme-row remnants, `panelRightWidth` + retired keys.
- Dependencies: Phases A–D (polish applies to final surfaces). Risks:
  base-rule surgery without baselines — forbidden; archive screenshots first,
  diff after; contrast regressions — harness + axe before sign-off.
- Acceptance: §14.E. Regression: full suites + token/monaco/contrast tests +
  new a11y tests. Manual: §15 checklist in full, both themes, 4 viewports.

### Separate Future Milestone — Interactive Terminal (node-pty)

Not part of Phases A–E. Evaluate xterm.js (done: adopt, terminal audit §6.2)
and node-pty at kickoff (Electron 45 compat check first — the scheduling
risk). Scope: `pty.service` + `pty:*` IPC (profile allowlist, cwd guard,
`invokedBy` assertion) + `PtyTerminal.tsx` tabs (spawn/rename/close/restart,
PowerShell/pwsh/CMD profiles, OSC cwd badge, exit banners) + Ctrl+C SIGINT +
resize propagation + packaging (`asarUnpack **/*.node`, CI matrix, signed-
build spot check) + runtime fallback to the T1 run-form with a banner (never
a dead tab). Agent/diagnostics/git stay on `runCommand` forever; `pty:*`
rejects agent-origin payloads (negative test); no auto-run into pty; tab
close reaps processes; shutdown reaps all. Acceptance: terminal audit §11 T2
checklist (maps to the 20-feature table) + origin-isolation live test.

---

## 12. Risks and backward compatibility

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | Thread/session migration loses history | High | Versioned loaders, legacy-file fallback, migration tests, backup before first write |
| 2 | Shortcut churn disorients users | Med | Keep Ctrl+Enter/Ctrl+P/Ctrl+B/Ctrl+J/Ctrl+1; palette + Shortcuts dialog surface the rest; one in-product pointer per moved destination |
| 3 | Two-homes transition (agent) confuses runs | Med | In-product "moved to Build" pointers for one release; no deletion until journey tests pass |
| 4 | Token consolidation regresses light theme | Med | Quarantine test green every commit; screenshot baselines before base-rule surgery; axe + harness before sign-off |
| 5 | Cancel-scope regression (killing foreign origins) | High | Origin tagging + isolation tests + live two-tenant test in every phase gate |
| 6 | node-pty vs Electron 45 friction (future) | Med | T1-first (value without pty); compat check at kickoff; CI matrix; runtime fallback |
| 7 | Output-flood perf (streaming/pty later) | Med | Batching + drop-counters + scrollback caps + virtualization; transcripts to disk |
| 8 | Fake-interactivity temptation (T1/streaming seam) | Process | Honesty rule (§1.3): runs labeled as runs, clock/caret until real chunks; review checklist per phase |
| 9 | Scope creep (splits, quake mode, SSH manager) | Med | Explicitly deferred; T2 v1 = tabs + profiles + core |
| 10 | No live verification in this blueprint | Low | Every `[VERIFY-LIVE]` item from the audits re-checked on implementer hardware before its phase ships |

Backward compatibility (binding):

- Stored state: `kryom.theme`, editor font size, panel sizes, recent
  projects, tab snapshots, project + global sessions keep their keys or gain
  versioned migrations with fallbacks. Legacy activity ids fall back to
  Explorer. Retired keys keep startup cleanup.
- IPC/API: `{ killed }` shapes, channel names, and bridge signatures stay
  compatible; new channels (`diagnostics:cancel`,
  `agent:cancel-verification`, future `pty:*`) are additive. `pty:*` never
  accepts agent-origin payloads.
- Security: sandbox + contextIsolation + method bridge, trusted-sender
  checks, dual approval gates, secret scrubbing, tree-kill, shutdown reaping
  — none weakened by any phase; each phase re-runs the security-adjacent
  suites.
- Unresolved questions: symbol-search backend choice for palette `@`-mode
  (existing symbol index is the leading candidate — verify coverage first);
  Settings-as-JSON-behind-UI timing (Phase E or later); print-CSS PDF export
  quality (verify on real briefs); sidebar-vs-bottom Git default if user
  testing splits (default: sidebar, §3).

---

## 13. Accessibility and performance requirements

Accessibility (WCAG 2.2 AA target):

- Contrast: token floors (§7) + harness + axe spot-checks per phase on
  chat/research/agent/terminal/settings; disabled tokens (no bare opacity);
  `::selection` token in both themes.
- Keyboard: every pointer flow has a key path (§4.B shortcuts + palette +
  A/D approvals + tab-strip nav + dialog Esc/focus-return); skip link;
  roving tabindex in strips; visible 2px focus everywhere via
  `:focus-visible`.
- Screen reader: aria labels kept and extended (toolbar, tabs, timeline
  `role="log"`, errors `role="alert"`, switches, steppers); meaning-bearing
  `title`s migrate to the delayed, Esc-dismissable `Tooltip`; xterm
  `screenReaderMode` + live-region run announcements when T1 lands; status
  dots always paired with text.
- Motion/contrast: global `prefers-reduced-motion` kill-switch; static
  caret under reduced motion; `forced-color-adjust` audit for
  dots/badges/timeline (`CanvasText`/`Highlight` mappings);
  `prefers-contrast` handling in Phase E.
- Hit targets: ≥24px (AA minimum) for all toolbar/tab/chip controls; 48px
  activity targets kept; touch long-press opens tooltips.

Performance:

- Long lists virtualized: agent timeline, terminal/xterm scrollback (5,000
  lines), output log, sessions/threads (agent timeline past ~200 events,
  chat past 50 full articles — memoize MarkdownLite articles).
- Poll hygiene: keep 1.5s agent / 2s terminal-status intervals (no faster
  without a push channel); cleanup on unmount (existing); streaming (S1)
  replaces chat polling with chunk IPC when the backend slice lands.
- Bundle: Fontsource variable cuts only (two files); xterm core+fit+
  web-links (~200–400KB) at T1; node-pty (future) via builder rebuild +
  `asarUnpack`; no new component/icon libraries — the kit is hand-built.
- Startup: fonts + tokens first, Monaco themes registered before mount
  (Phase 1, keep); font-readiness check + offline test per phase.

---

## 14. Detailed acceptance criteria

Global gates (every phase): `npm test`, `npm run test:renderer`,
`check:syntax`, `check:workbench`, `check:test-manifest`, `npm run build`
all green; `pack` smoke; dark/light screenshots at 1440 and 900 archived;
the journey below manually passed; no `[VERIFY-LIVE]` left unverified for
shipped behavior.

Manual journey (runs every phase): open project → edit → save → terminal
run → terminal Cancel with diagnostics running (diagnostics survives) →
Problems Stop with terminal running (terminal survives) → agent verification
Stop (foreign runs survive) → chat ask → research brief → agent plan →
approve → verify → export → destructive-command double-gate → theme toggle
(persisted) → restart restores tabs/threads/panels/fonts.

### 14.A Phase A — shell

- [ ] Titlebar: icon + crumb + command center + 3 SVG layout toggles only;
  no mode switch, no brand wordmark, no autosave chip.
- [ ] Activity bar shows exactly the §4.B nine; shortcuts wired; legacy ids
  fall back to Explorer; bar scrolls with fade at 600px height.
- [ ] Center holds editor/welcome/diffs only; no stage; hubs reachable via
  their new homes; no "← Back to editor".
- [ ] Palette v1: Ctrl+Shift+P commands, Ctrl+P files; every palette row
  executes a real command.
- [ ] Status bar matches §4.G; compact mode below 1280px; every pill
  click-through works.
- [ ] Restart restores layout; reset restores 260/264 defaults.

### 14.B Phase B — workspace

- [ ] One dock: Chat/Research modes, thread switcher, ＋ new, History,
  Knowledge; 300–520 resize persisted; overlay <900px.
- [ ] Mode switch preserves thread (messages, chips, brief refs); attach
  previews accurate; nothing retypes.
- [ ] Composer: Enter-send, Shift+Enter newline, Ctrl+Enter send, Esc stop;
  counter vs 12,000; queue-while-busy with visible chip; drag-drop attach;
  budget bar reflects 18k/4k caps.
- [ ] Messages: 14px bodies, model + latency headers, timestamps, Copy/
  Retry/Pin; code blocks labeled, numbered >8 lines, collapsible >40.
- [ ] Research: determinate progress, Cancel keeps partials, card species +
  confidence badges, citation chain, Copy-with-citations, export .md/.html.
- [ ] Model picker independent of mode; per-message model labels; provider
  failure routes to settings.
- [ ] Streaming seam: caret/elapsed/Stop states render; one-block resolve
  today; zero fake tokens (review checklist signed).

### 14.C Phase C — agent

- [ ] Build mode run console matches §6: sticky header, pinned approvals,
  filtered timeline, detail drawer, templates, blast-radius preview.
- [ ] Plan → approve → multi-file apply → checks → summary journey passes
  end-to-end on a real project with real approvals.
- [ ] Per-hunk Approve/Reject + per-hunk/per-run revert; checkpoints/undo;
  "changed since run start" accurate.
- [ ] Research-to-build: brief attaches with preview, plan cites sections,
  run links back, brief shows reverse link.
- [ ] Approval double-gate intact (server ids re-validated); refusals render
  as refusals; `agent:cancel-verification` kills agent runs only (live
  two-tenant test); agent never touches `pty:*`.
- [ ] "Verified" appears only for observed runs; checks show real output +
  exit codes + durations; transcripts export.

### 14.D Phase D — workbench

- [ ] Bottom: Terminal · Problems (badge) · Output · Debug Console · Tasks;
  per-tab Clear, maximize, collapse; Git fully in sidebar with history.
- [ ] Editor: reorder/pin/preview/overflow tabs, breadcrumbs, selection AI
  actions, click-to-marker from Problems/diffs/checks.
- [ ] Resize matrix (§8 table) passes at 1366×768, 1440×900, 1920×1080,
  900×600; editor never below ~420px; focus never stolen.
- [ ] T1 xterm: ANSI colors, unicode, 100KB output, exit≠0, timeout,
  truncation render dark+light; font 11–16 live; `screenReaderMode` on;
  `<pre>` fallback setting works; every run labeled as a run.

### 14.E Phase E — polish

- [ ] Token consumption migrated; quarantine green; legacy blocks deleted;
  zero hardcoded hex outside `tokens.css`/`theme.css`; zero `var(--kryom-`
  outside the shim.
- [ ] Settings: all sections + search; model list catalog-backed; keyboard
  map complete and mirrored in Shortcuts dialog.
- [ ] axe clean on chat/research/agent/terminal/settings; contrast floors
  measured; forced-colors + reduced-motion + 125/150/200% scaling verified.
- [ ] Virtualization in place (timeline/scrollback/log/sessions); no new
  interval faster than existing without push; offline font test passes.
- [ ] §15 checklist fully signed, both themes, four viewports; `dist` smoke
  per target platform.

---

## 15. Visual QA checklist

Capture per phase (archive, compare against baselines from Phase A onward).
No item is signed without a real screenshot on implementer hardware.

Dark + light × 1366×768 / 1440×900 / 1920×1080 / 900×600:

- [ ] Titlebar: 40px, icon-only brand, crumb ellipsis on long paths, command
  center hint, three SVG toggles, no mode switch.
- [ ] Activity bar: nine icons crisp at 100/125/150/200%, active indicator
  visible, Settings bottom-pinned, fade at 600px height.
- [ ] Sidebar: filter box, badge legend (M/U/S), section caps, empty state
  with Open/New/Recent, overlay drawer <900px.
- [ ] Editor: kryom theme bg/fg/gutter/cursor/selection, JetBrains Mono 14,
  tab reorder/pin/preview/overflow, breadcrumbs, markers, dirty dots.
- [ ] AI Workspace: mode segmented, thread switcher, model picker, clean
  default thread (messages only), chips, composer + counter + Send/Stop.
- [ ] Research: progress bar + step x/y + elapsed, card species distinct,
  confidence badges legible, citation links jump, handoff buttons prominent.
- [ ] Build: sticky header, pinned approval card, timeline filters, diff
  headers with stats, side-by-side toggle, check output blocks, summary grid.
- [ ] Bottom: five tabs, Problems badge count, per-tab Clear, maximize,
  T1 ANSI/unicode/exit chips (Phase D+).
- [ ] Status bar: all §4.G segments, compact mode <1280px, agent pill during
  a live run, model badge reflecting current model.
- [ ] States: empty/loading/error/completed/queued/cancelled for chat,
  research, build, terminal — each captured once.
- [ ] Type: 14px reading bodies, 12px code, 13px terminal, 10px eyebrows
  labels-only, tabular numerals on clocks/counters.
- [ ] Motion/off: reduced-motion run-through (no smooth scroll/spinner/
  blink), focus rings on full keyboard pass, forced-colors pass.
- [ ] No gradients, glows, oversized branding, duplicate indicators, unicode
  chrome glyphs, or hardcoded-color leaks in any capture.

---

*End of authoritative blueprint. Implementation waits for explicit approval.
Do not mark any item above verified without executing it.*
