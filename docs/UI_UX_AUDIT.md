# KryomCode — Complete UI/UX, Design System & Product Audit

Status: AUDIT ONLY. No application source, style, theme, font, config, or dependency was modified.
Scope: full renderer (`src/`), styles (`src/styles/`), Electron shell relevant to UX (`electron/main.cjs`,
`electron/preload.cjs`, `electron/menu.cjs`, `electron/ipc/`, terminal/agent/diagnostics services).
Method: static inspection of implementation (see [Files inspected](#17-files-inspected)).
No runtime, screenshot, or pixel inspection was possible in this environment (shell unavailable, app not
launched), so every finding below is code-grounded; any pixel-level or feel-based claim is explicitly marked
`[UNVERIFIED-VISUAL]`.

Companion documents:

- [UI/UX Redesign Blueprint](UI_UX_REDESIGN_BLUEPRINT.md) — tokens, themes, redesign proposals, roadmap.
- [Terminal UX & Architecture Audit](TERMINAL_UX_AND_ARCHITECTURE_AUDIT.md) — deep terminal analysis.

Contents: [1](#1-overall-score) score · [2](#2-top-20-design-issues) top 20 · [3](#3-application-ui-inventory)
inventory · [4](#4-visual-design-audit) visual · [5](#5-typography-audit) type · [6](#6-theme-system-audit)
themes · [7](#7-ai-chat-ux-audit) chat · [8](#8-deep-research-ux-audit) research · [9](#9-autonomous-agent-ux-audit)
agent · [10](#10-main-ide-and-workspace-audit) IDE · [11](#11-responsive-and-accessibility-audit) responsive/a11y ·
[12](#12-component-sharing-analysis) sharing · [13](#13-competitor-and-reference-patterns) references ·
[14](#14-why-it-does-not-look-premium-yet) why · [15](#15-technical-risks) risks · [16](#16-regression-and-verification-notes)
regression · [17](#17-files-inspected) files.

---

## 1. Overall score

### 1.1 Methodology

Ten-point scale per dimension, benchmarked against the stated target: a premium professional desktop
developer environment (VS Code / Cursor / Windsurf / Windows Terminal bar). Each dimension score is anchored
to inspected code, not screenshots. Overall score is the mean of the nine dimensions, rounded to one decimal.
All screenshot-based sub-claims are marked `[UNVERIFIED-VISUAL]` and did not move any score by more than
±0.5 on their own.

| # | Dimension | Score | One-line justification |
|---|-----------|-------|------------------------|
| D1 | Visual design & hierarchy | 5.0 | Coherent dark base and token pass, but dual token systems, radius chaos, hardcoded colors, small text |
| D2 | Typography & fonts | 4.0 | System stack is fine; mono is Consolas-hardcoded and inconsistent; 12 px chat body; Monaco stock |
| D3 | Theme system (dark + light) | 5.0 | Dark is decent; light is a fragile override bandaid; Monaco ignores the Kryom palette |
| D4 | AI Chat UX | 6.0 | Honest, well-engineered non-streaming chat; feels unresponsive on long answers; Ctrl+Enter-only send |
| D5 | Deep Research UX | 6.0 | Rich backend (plan/sources/evidence/findings/report/export); generic containers; polling; dense tabs |
| D6 | Autonomous Agent UX | 7.0 | Best-in-app honesty (approvals, observed-run verification); split across two surfaces; polling; glyph icons |
| D7 | Terminal (as a terminal) | 3.0 | It is a command-run form (verdict A), not a terminal; good runner, wrong product surface |
| D8 | IDE shell & workspace | 6.0 | VS Code-like bones (split groups, panels, native menu); no palette; nav sprawl; 900 px floor |
| D9 | Responsive & accessibility | 5.0 | Strong aria/focus foundations; tiny text, glyph icons, fixed minimums, no contrast theme |
| | **Overall** | **5.2 / 10** | **Competent engineering, pre-premium surface** |

Reading the score: 1–3 = missing/broken, 4–5 = functional but unrefined, 6 = good, 7–8 = professional,
9–10 = premium/reference. KryomCode's *engineering honesty* (no fake streaming, no invented agent progress,
observed-run verification, token-integrity tests) scores higher than its *surface*. The redesign blueprint
therefore leads with surface/system wins and explicitly preserves the honesty mechanisms.

---

## 2. Top 20 design issues

Severity: P0 = blocks the premium claim; P1 = major; P2 = medium; P3 = minor/polish.
`[U]` = needs runtime/visual confirmation where noted.

| Rank | Sev | Issue | Primary evidence |
|------|-----|-------|------------------|
| 1 | P0 | Terminal is a command-run form, not a terminal: no shell process, no stdin, no streaming, one input + Run button | `src/components/TerminalPanel.tsx:42,104-178,227-312`; `electron/services/terminal/terminal.service.cjs:50-180` |
| 2 | P0 | No AI streaming anywhere: chat, agent, and research answers arrive as one block after a spinner + elapsed clock | `src/components/AiChat.tsx:169-184,806-812`; `src/electron.d.ts:44-48` (`KryomAIResponse` has no stream fields) |
| 3 | P0 | Chat body text is 12 px (`line-height 1.65`) with 10 px role labels; research/agent/terminal all sit at 11–12 px mono/Body | `src/styles/app.css:936-998`; `src/components/TerminalPanel.tsx` output at 11–12 px Consolas |
| 4 | P0 | Two parallel token systems (`--kc-*` vs `--kryom-*`) with divergent values, plus hardcoded `#fff` / `#c9cad5` / `#101014` text and wells, plus light-theme override bandaids | `src/styles/app.css:1985-2006`; `src/styles/meta-ai.css:6-24`; `src/styles/theme.css:14-39,139-190` |
| 5 | P1 | Navigation sprawl: three center modes (editor / home / stage) + title-bar Chat/Research switch + hero mode switch + activity-bar center/action items; a “← Back to editor” button exists because users get lost | `src/app/App.tsx:87,323-327,2687-2699`; `src/components/Chrome.tsx:45-75`; `src/components/HomeHero.tsx:39-56` |
| 6 | P1 | Agent lives on two overlapping surfaces: `AgentWorkspace` (stage) and `MetaAIWorkspace` (editor tabs), plus `AgentPanel`, `AgentTasksPanel`, `AgentHistoryPicker`, tracked plans, impl plans, specialist runs | `src/components/AgentWorkspace.tsx`, `src/components/MetaAIWorkspace.tsx`, `src/components/AgentPanel.tsx` |
| 7 | P1 | `terminal:cancel` kills **all** registered processes (global `process-manager` registry shared with diagnostics, git, and agent verification) — the user Cancel button can kill agent/git work | `electron/services/terminal/process-manager.cjs:91-100+`; `electron/ipc/terminal.ipc.cjs:40-46`; consumers in diagnostics + git services |
| 8 | P1 | Composer sends with Ctrl+Enter only, is fully disabled while loading, and caps input at 12,000 chars with no counter or queue | `src/components/AiChat.tsx:855-877,926-952`; `MAX_PROMPT = 12000` in `MetaAIWorkspace.tsx:56` |
| 9 | P1 | No command palette; `QuickOpen` (Ctrl+P) is files-only fuzzy search (3,000 indexed / 60 shown), no symbol/command modes | `src/components/QuickOpen.tsx:18-19,51-68`; `src/components/ShortcutsDialog.tsx` (no palette row) |
| 10 | P1 | Fixed 900 px minimum width (`body min-width`, window `minWidth 900`) — no small-laptop story; activity bar has 13 fixed items with no overflow handling | `src/styles/app.css:12-16`; `electron/main.cjs:464-478`; `src/components/ActivityBar.tsx:103-128` |
| 11 | P1 | Border-radius chaos: 4, 5, 6, 7, 8, 10, 12, 14, 20 px across buttons, chips, cards, toggles, tabs | `src/styles/app.css` (e.g. `:844,:909,:1860,:2213,:2742`); `src/styles/theme.css:194-223`; `src/styles/hero.css:15-27` |
| 12 | P1 | Monaco uses stock `vs` / `vs-dark` with no Kryom theme and no `fontFamily` override — the editor (the hero surface) ignores the product palette | `src/components/EditorPanel.tsx:476-485`; `src/utils/theme.ts:63-65` |
| 13 | P1 | Research evidence/citation/uncertainty rendering reuses generic `.plan-view` / `.plan-commands` / `.finding-body` containers; visual distinction between claims, evidence, and uncertainty is weak `[U]` | `src/components/ResearchPanel.tsx` (60+ `plan-commands` matches); `src/styles/app.css:1322,1502` |
| 14 | P2 | Terminal input is pre-filled with the literal value `'npm run build'` (looks like a placeholder, actually executes on Run) | `src/components/TerminalPanel.tsx:42` |
| 15 | P2 | Status/title bars duplicate controls and use ambiguous unicode glyphs (`◧ ◫ ▶ ✓ ✕ …`) whose rendering varies by platform font | `src/components/Chrome.tsx:85-106`; `src/components/AgentWorkspace.tsx:57-100`; `src/components/ResearchPanel.tsx:36-49` |
| 16 | P2 | `MarkdownLite` has no tables, links, task lists, or autolink, and only approximate tokenizer highlighting — long technical answers render flat | `src/components/MarkdownLite.tsx:1-120` |
| 17 | P2 | Settings has only 2 sections, a dead hidden “Theme” row with a stale “Light theme is not implemented yet” tooltip, and hardcoded 2-model list that ignores the provider catalog | `src/components/SettingsModal.tsx:6,129-248`; `src/utils/models.ts:5` vs `src/hooks/useProviderModels.ts` |
| 18 | P2 | Polling everywhere (agent 1.5 s, terminal status 2 s, research interval) with no push channel; fine today, but it caps liveness work (streaming, timeline) later | `src/hooks/useAgentRun.ts:9`; `src/components/TerminalPanel.tsx:62-67`; `src/components/ResearchPanel.tsx:151-179` |
| 19 | P2 | Casing/label inconsistency: hub tabs are `SEARCH` / `PROVIDERS` / `PERMS` (all-caps) while research tabs are Title Case; session/stage/bottom tabs each have their own tab CSS | `src/components/IntelligenceHub.tsx:14-21`; `src/components/PlatformHub.tsx:11-28`; `src/components/ResearchPanel.tsx:21-28` |
| 20 | P3 | Dead/legacy surface remains: `panelRightWidth` setting with no right panel, unmounted `TerminalPanel` self-contained variant, `ExtensionTab` type with no producer, retired localStorage keys removed at startup | `src/electron.d.ts:533-539`; `src/components/TerminalPanel.tsx:385-396`; `src/state/workbench-tabs.ts:23-30`; `src/app/App.tsx:332-334` |

---

## 3. Application UI inventory

### 3.1 Shell and navigation

| Element | Implementation | Notes |
|---------|----------------|-------|
| Root layout | `src/app/App.tsx:2394` `main.ide` | TitleBar → shell → StatusBar → overlay dialogs |
| Custom title bar | `src/components/Chrome.tsx:23-109` | 40 px (`--kc-titlebar-height`); logo img + brand + crumb + Chat/Research segmented + autosave chip + `◧/◫` layout toggles |
| Native menu | `electron/menu.cjs` | File / Edit / Selection / View / Go / Run / Terminal / Help; accelerators mirror `ShortcutsDialog` |
| Activity bar | `src/components/ActivityBar.tsx` + `activity-registry.ts` | 48 px wide; 13 builtins (order 10–110); single tab stop + arrow navigation; Settings pinned at bottom |
| Activity areas | `activity-registry.ts:10` | `sidebar` (explorer, search, extensions, tools, memory, account), `panel` (git, run), `center` (intel, platform, agent, home), `action` (ai) |
| Sidebar | `App.tsx:2420`, `app.css:90-98` | 260 px default (180–420, persisted); Explorer / Search / Extensions / Connections / Memory / Profile |
| Resize handles | `src/components/ResizeHandle.tsx` + `app.css:1919-1967` | Left + bottom; `:focus-visible` styled; clamped to window (`App.tsx:112-128`) |
| Status bar | `Chrome.tsx:111+`, `app.css:581,2471` | Status, workspace, branch, file+dirty, language, cursor, model, provider, autosave, terminal, diagnostics |
| Center views | `App.tsx:87,323-327` | `editor` (split groups) · `home` (WelcomePage) · stage (`intel` / `platform` / `agent`, always mounted + `hidden`) |
| Bottom panel | `App.tsx:2745-2837`, `app.css:700-752` | Tabs terminal / problems / git / output / tasks; 264 px default (120–600, persisted); hidden-persisted |
| Command palette | — | **Does not exist.** QuickOpen is files-only |

### 3.2 Editor

| Element | Implementation | Notes |
|---------|----------------|-------|
| Tab model | `src/state/workbench-tabs.ts` | `code` + `meta-ai` + `extension` (extension unused); multi-group splits; pure transitions |
| Tab strip | `src/components/EditorTabs.tsx` | Context menu (right-click), dirty dot, `+` New Meta AI session; keyboard ←/→/Home/End |
| Code editor | `src/components/EditorPanel.tsx` | Monaco; minimap off; `fontSize` 10–24 (default 14); `automaticLayout`; no `fontFamily`; markers from diagnostics |
| Editor API | `EditorPanel.tsx:23-29` | revealLine / find / replace / expand / shrink selection (menu + `Ctrl+G/F/H`, `Shift+Alt+→/←`) |
| Meta AI tabs | `MetaAIWorkspace.tsx` in `EditorPanel` | Agent sessions as editor tabs (see §9) |
| Quick open | `src/components/QuickOpen.tsx` | Ctrl+P; subsequence fuzzy (name-weighted); 3,000 indexed / 60 shown |
| Go to line | Menu `Go` + `Ctrl+G` | Via editor API |
| File history | `App.tsx:298-303` | Back/forward (`Alt+←/→`) over opened files |

### 3.3 AI Chat

| Element | Implementation | Notes |
|---------|----------------|-------|
| Home/discovery | `WelcomePage.tsx` + `HomeHero.tsx` + `hero.css` | Centered hero (“What should we build & discover?”), mode segmented, prompt input → pending-prompt handoff |
| Conversation | `src/components/AiChat.tsx` (955 lines) | Toolbar → messages → loading → error → key notice → composer |
| Sessions | `src/components/ChatSessions.tsx` + `theme.css:225-306` | Conversation tab bar + search; per-project persistence in main |
| Markdown | `src/components/MarkdownLite.tsx` | Safe (no HTML exec); code+Copy+Send-to-Agent; h1–h3; lists; quotes; inline code; bold; approximate highlight |
| Model picker | `AiChat.tsx:95-104` | Backend catalog (`useProviderModels('meta')`) with current-model fallback |
| Context controls | `AiChat.tsx:105-108,580-610` | File-context checkbox + one-line summary + tooltip; secret-scan note |
| Attachments | `AiChat.tsx:219-270,879-924` | File picker → excerpts (max 8); chips with open/remove; per-conversation or local |
| Research attach | `AiChat.tsx:451-454,659-682` | Brief attached as cited context + Detach |
| Agent handoff | `AiChat.tsx:780-791,568-578` | “Open in Agent” on agent-intent user messages; code-block “Send to Agent” |
| Loading state | `AiChat.tsx:806-812` | Spinner + elapsed seconds + “Esc to stop” (no fake streaming — deliberate) |
| Error state | `AiChat.tsx:815-849` | Classified title (`meta-timeline.ts`), Provider Settings link, Retry-if-retryable, Dismiss |
| Empty state | `AiChat.tsx:699-759` | Contextual suggestion chips (Explain / tests / review / summarize) |
| Disabled state | `AiChat.tsx:876` | Whole composer disabled while loading |

### 3.4 Deep Research

Single component `src/components/ResearchPanel.tsx` (~1,400 lines). Tabs Overview / Plan / Sources /
Evidence / Findings / Report (`:19-28`). Objective input + depth select + model select (`:1155-1190`);
example prompts (`:30-34`); session list with search/rename/delete (`:1237-1300`); interval polling
(`:151-179`); cancel (`:307`); export with template select (`:220,:1110`); source cards with type/access/text
filters + selected-source detail (`:780-895`); findings/evidence blocks (`:896-1070`); handoffs
`onImplement` / `onAsk`; embeddable in agent tabs via `sessionId` + `onSessionChange`.

### 3.5 Autonomous Agent

Two surfaces + three satellites:

| Element | Implementation | Notes |
|---------|----------------|-------|
| Run workspace | `src/components/AgentWorkspace.tsx` (~1,100 lines) + `useAgentRun.ts` (1.5 s poll) | Header/status/history/controls; composer (task + research mode + file search ⩽8); plan approvals (risk list / command / file list); decomposition steps; `role="log"` timeline with unicode icons; proposed/applied changes with `diffLines` diffs; verification checks with real `<pre>` output; deterministic final-result grid |
| Session tabs | `src/components/MetaAIWorkspace.tsx` | Per-session conversation + embedded Implementation (`AgentPanel`) + embedded Research + compact composer + `AgentHistoryPicker` + `AgentTasksPanel` (resizable 120–520 px) |
| Implementation | `src/components/AgentPanel.tsx` | Plan → review → apply; context-snapshot provenance; freshness; change-set manifest ordering; checkpoints/undo |
| Tasks panel | `src/components/AgentTasksPanel.tsx` | Read-only per-session report (plan, changes, approvals, verification, research, errors) — backend records only |
| History picker | `src/components/AgentHistoryPicker.tsx` | Explicit-attach-only history refs (chat/research/sibling sessions); token-overlap ranking; project isolation |
| Run states | `AgentWorkspace.tsx:28-41` | analyzing / researching / planning / proposing / waiting_for_approval / executing / verifying / repairing / paused / completed / failed / cancelled |
| Policy/approval | `autonomous-run.cjs` + `tool-policy.cjs` | `reviewAgentCommand`; approvals cite server ids and are re-validated main-side; policy refusals render honestly |

### 3.6 Intel and Platform

| Element | Implementation | Tabs |
|---------|----------------|------|
| IntelligenceHub | `src/components/IntelligenceHub.tsx` | SEARCH / PLAN / SPECIALISTS / RUNS / QUALITY (project index, planning, specialists, quality) |
| PlatformHub | `src/components/PlatformHub.tsx` | PROVIDERS / EXTENSIONS / SKILLS / WORKFLOWS / INTEGRATIONS / TEMPLATES / PERMS / UPDATES |

Both ride the center stage (`App.tsx:2635-2662`), always mounted and `hidden` when not staged so runs survive
navigation.

### 3.7 Terminal and output panels

| Element | Implementation | Notes |
|---------|----------------|-------|
| Terminal | `TerminalPanel.tsx` (controller + view) | Input + Run/Cancel/Status/Clear; Up/Down history (50, in-memory); single-flight guard; max 20 entries; warnings; `<pre>` output; exit-code line; auto-scroll checkbox |
| Problems | `ProblemsPanel.tsx` | Diagnostics list + build/test command input + run |
| Git | `GitPanel.tsx` | Toolbar + staged/unstaged/untracked lists + commit message |
| Output | `OutputPanel.tsx` + `utils/output-log.ts` | Renderer event log (time/source/message) + Clear |
| Tasks | `TasksPanel.tsx` | Column task lists (bottom tab) |

### 3.8 Settings and themes

`SettingsModal.tsx`: two sections (`general` | `providers`). General = default-model select (hardcoded 2
models), AI-context checkbox, confirm-all checkbox, Auto-Save switch, editor-font stepper (10–24),
Appearance segmented (Dark/Light), plus a dead hidden “Theme” row (`:238-248`). Providers section hosts
`ProviderSettings`. Theme = `data-theme` on `<html>` (`utils/theme.ts`), OS preference only on first run,
`theme-color` meta updated. No terminal/UI-font/density/keyboard settings exist.

### 3.9 Modals, dialogs, dropdowns, popovers

| Element | Implementation | Notes |
|---------|----------------|-------|
| Dialog system | `src/components/dialogs.tsx` | FIFO queue (`confirm` / `prompt` / `resolveConflict` / `confirmCloseDirty`); focus return; Escape/overlay settle; has tests |
| Native gate | `electron/ipc/approval.cjs` | Unskippable native dialog for destructive commands (documented double-prompt wart with renderer confirm) |
| Settings / About / Shortcuts / Diagnostics / TemplatePicker | `SettingsModal` / `AboutDialog` / `ShortcutsDialog` / `DiagnosticsDialog` / `TemplatePickerDialog` | Modal dialogs; Shortcuts mirrors real accelerators only |
| QuickOpen | `src/components/QuickOpen.tsx` | Palette-style overlay, files-only |
| Context menus | `EditorTabs` tab menu (`meta-ai.css:139-171`); Explorer `onMenu` (native menu path) | Two menu technologies (custom DOM + native) |
| Dropdowns | Native `<select>` everywhere (model, depth, template, theme-dead-row) | No custom dropdown/popover component |
| Tooltips | Native `title` attributes everywhere | No custom tooltip component; no delay/touch story |

### 3.10 Inputs, buttons, composers, toolbars

Global `button` / `input` / `select` / `textarea` styling in `app.css:18-61` (12 px in `.ide`, radius 5–6,
`--kc-btn` fills). Variants observed: default button, `.secondary-button`, `.mini-btn`, `.icon-btn`,
`.stop-btn`, `.primary-button` (hero), `.suggest-chip`, `.segment`/`.segmented`, `.switch` (role=switch),
`.stepper`, `.attach-chip`, `.title-mode-btn`, `.title-layout-btn`, `.panel-tab`, `.session-tab`,
`.editor-tab`, `.research-tabs`, `.stage-tabs`. Three composers with three designs: `ai-composer` (chat),
`meta-composer` (agent tab), `agent-run-composer` (run workspace) + `hero-form` + `terminal-input`.
Toolbars: `ai-toolbar`, `output-toolbar`, `git-toolbar`, `terminal-input` (form-as-toolbar).

### 3.11 State coverage (loading / empty / error / success / disabled)

| State | Coverage | Examples |
|-------|----------|----------|
| Loading | Good | Chat elapsed-clock loader; terminal “Running…” + spinner; agent timeline events; research polling |
| Empty | Good | Chat suggestion chips; terminal “Enter a command…”; output “No events yet”; explorer empty actions |
| Error | Good | Classified AI errors + Retry/Dismiss; terminal inline error; agent “real errors” rows; crash ErrorBoundaries (sidebar/bottom/root) |
| Success | Honest but flat | “Command completed” / exit-code line; agent result grid; no misleading spinners (verified in code comments + observed-run verification) |
| Disabled | Inconsistent | Composer fully disabled while loading (chat); terminal input disabled while running; buttons use `opacity: 0.4` globally with no disabled-token |

---

## 4. Visual design audit

### 4.1 What works

- A real token pass exists (`--kc-*` block at `app.css:1985-2006`, `--kryom-*` at `meta-ai.css:6-24`) with a
  regression test (`theme-tokens.test.ts`) — rare and valuable.
- Layout bones are VS Code-like and predictable: 48 px activity bar, 260 px sidebar, split editor groups,
  bottom panel with tabs, status bar.
- Borders are restrained 1 px dividers; no heavy shadows or gradients were found in the inspected CSS.
- Scrollbars are subtle and themed (`app.css:2771-2785`).
- Reduced-motion is respected at least in terminal auto-scroll (`TerminalPanel.tsx:236-241`).

### 4.2 Why it does not look premium yet

1. **Two design systems.** `--kc-*` (IDE) and `--kryom-*` (meta layer) define the same concepts with
   different values (bg `#101114` vs `#101014`; text-dim `#bdbdc8` vs `#c9cad5`; ok `#7ee2a8` vs `#4ade80`;
   warn `#e8c874` vs `#fbbf24`). Chat/agent/research drift between the two depending on which file styled
   the container. Premium apps have one token graph.
2. **Hardcoded color leaks.** `#fff` text (`title-brand`, `md-heading`, `activity-btn.active`,
   `title-mode-btn.active`), `#c9cad5` secondary text, `#101014` code wells — papered over by grouped
   light-theme overrides (`theme.css:139-190`). Every new component risks inventing a third shade.
3. **Radius chaos.** 4/5/6/7/8/10/12/14/20 px radii across buttons, chips, cards, toggles, tabs, hero mark.
   Nothing reads as “one family”.
4. **Density without hierarchy.** Almost everything is 10–13 px. When labels, body, code, and captions share
   one size band, nothing is scannable: role labels shout in 10 px bold caps while 12 px answers whisper.
5. **Surface flatness.** Sidebar (`#151519`), panels (`#17171c`), wells (`#101014`), and app bg (`#101114`)
   sit within ~8 perceptual lightness steps; combined with 1 px `#292930` borders, regions blur together
   `[U]`. Premium dark themes separate app / sidebar / editor / elevated by deliberate steps.
6. **Button weight.** Global 8 px × 12 px buttons at 12 px are chunky next to dense 11 px labels and a
   40 px title bar; five button variants with no documented roles.
7. **Icon inconsistency.** Three icon languages: registry stroke SVGs (activity bar), unicode glyphs
   (`◧ ◫ ▶ ✓ ✕ … ⚠`, title/agents/research/terminal), and text buttons. Glyphs render differently per
   platform font and fail the “designed” test up close.
8. **Tab proliferation.** Five tab idioms: `.editor-tab`, `.panel-tab`, `.session-tab`, `.research-tabs`,
   `.stage-tabs` (+ `.settings-tabs`, `.chat-sessions`) — different heights, radii, active treatments
   (fill vs 2 px underline vs bold).
9. **Empty-space imbalance.** Hero takes full center (`padding: 56px 24px 32px`, 27 px title) while chat
   answers render at 12 px — the welcome is grander than the work. Bottom panel defaults to 264 px for a
   single-line command form.
10. **Accent overuse risk.** `#8b7cff` serves as text accent, focus ring, button tint, badge, empty icon,
    and tab underline. One accent doing six jobs reads as noise, not brand.

---

## 5. Typography audit

### 5.1 Current inventory (all code-grounded)

| Role | Family | Size / weight / leading | Location |
|------|--------|-------------------------|----------|
| UI base | `system-ui, 'Segoe UI', sans-serif` | 13 px (`.ide`), 12 px buttons | `app.css:1-6,2008-2013` |
| Meta layer | `system-ui, -apple-system, 'Segoe UI', sans-serif` | same band | `meta-ai.css:23` |
| Mono (IDE) | hardcoded `Consolas, monospace` (10+ sites) | 11–12 px, leading 1.5–1.7 | `app.css:679,1023,1063,1409,1421,1488,1614,1712,2290,2439,2587,3271,3480,3497` |
| Mono (meta) | `'Cascadia Code', Consolas, monospace` | token only | `meta-ai.css:24` |
| Editor (Monaco) | Monaco default (no override) | 14 px default, 10–24 adjustable | `EditorPanel.tsx:481-483`; `App.tsx:110,2077` |
| Chat body | UI base | 12 px / 1.65 | `app.css:968-975` |
| Chat role label | UI base | 10 px / 700 / +0.8 px tracking | `app.css:950-959` |
| Markdown headings | UI base | 13 px / 650 | `app.css:981-987` |
| Chips/labels/meta | UI base | 10–11 px | `app.css:844,905-913`; `theme.css:204-223` |
| Titles | UI base | hero 27 px, discovery 22 px, welcome 32 px, empty 16 px, brand 15 px | `hero.css:36-43`; `app.css:393,541,925` |

### 5.2 Findings

- **No bundled fonts, no font strategy.** System stack is a fine default, but combined with Consolas-only
  mono and Monaco defaults, KryomCode looks “undecided” next to Inter/Geist + JetBrains Mono/Cascadia peers.
- **Two mono stacks.** `--kryom-mono` prefers Cascadia Code; the IDE hardcodes Consolas. Same product, two
  code voices. (Cascadia Code ships with Windows Terminal/new Windows but is not guaranteed everywhere;
  Consolas is Windows-only — macOS/Linux fall back to generic `monospace`.)
- **Scale is compressed.** 10→13 px carries labels, body, code, and headings; then a jump to 22–32 px
  display sizes. Missing middle (14–16 px body, 18–20 px section titles) forces small-text reading.
- **Chat readability fails the premium bar.** 12 px/1.65 assistant answers with 10 px caps labels are
  reference-dense but tiring; code blocks at 11 px Consolas are worse.
- **Letter-spacing is ad hoc.** 10 px labels use +0.8 px; brand uses +0.02 em; nothing else tracks.
- **Terminal/editor/composer disagree.** Terminal 12 px Consolas/1.6; editor 14 px Monaco-default; composer
  inherits 12–13 px UI. Three “code voices” on one screen.
- **Good:** `font-synthesis: none` (`app.css:5`); tabular time strings (`en-GB` clocks); no fake bold/italic.

Font comparison and exact token recommendations are in the Blueprint (§2–§3).

---

## 6. Theme system audit

### 6.1 Dark (current, inspected)

`app.css:1985-2006` + `theme.css:14-39`:

| Token group | Values |
|-------------|--------|
| Surfaces | bg `#101114` · panel `#151519` · panel-alt `#17171c` · panel-deep `#111116` · input/well `#101014` · strip `#1d1d26` · tint `#232139` |
| Borders | `#292930` · soft `#232329` · btn `#3b3b46` · input `#3b3b46` · tint `#3b3860` |
| Text | `#e4e4e7` · dim `#bdbdc8` · faint `#858592` · faint-soft `#6e6e7a` |
| Accent | `#8b7cff` · dim `#6556c8` · soft `#c4b5fd` · btn `#7869e3` · on-accent `#ffffff` |
| Status | ok `#7ee2a8` (bg `#1d3a2a`) · warn `#e8c874` (bg `#3d3220`) · danger `#ff8f9a`/`#ff7a93` · link `#6ea8fe` |
| Chrome | btn `#24242c` / hover `#33333e` · focus `#8b7cff` · scroll `#42424d` |

Meta layer (`meta-ai.css:6-24`) diverges: bg `#101014`, surface `#17171c`, raised `#1d1d26`, text-dim
`#c9cad5`, accent `#8b7cff`, **meta blue `#0082fb`** (no `--kc-*` equivalent), ok `#4ade80`,
warn `#fbbf24`, error `#ff7a93`, radius `6px`.

### 6.2 Light (current, inspected)

`theme.css:65-129`: white bg, `#f3f3f5` panel, `#1e1e22` text, `#4c4c55` dim, `#7c7c87` faint, accent
`#6455d6`, link `#0b5fff`, status green/red/amber sets. Functionally complete but structurally fragile:
~20 grouped hardcode overrides (`theme.css:139-190`) plus a resolved-as-`unset` backfill history (see the
`TODO(verify)` at `theme.css:12-13`) mean light mode breaks silently whenever a component adds a hardcoded
color. Dead hidden “Theme” row in Settings (`SettingsModal.tsx:238-248`) still claims light is unimplemented.

### 6.3 Contrast and state gaps (code-level; verify with tooling at implementation)

- 10–11 px faint text (`#858592` on `#111116–#1d1d26`) is near the WCAG AA boundary for small text —
  must be measured, not assumed.
- Disabled state is global `opacity: 0.4` (`app.css:31-34`) with no disabled tokens; 0.4 × faint text is
  almost certainly below contrast floors (decorative-only use required).
- Selection styling: no `::selection` token found — native selection colors leak through.
- Focus is a 2 px accent outline (`app.css:36-43`) — good — but focus-on-dark `#8b7cff` against `#101114`
  needs a ratio check.
- Monaco `vs`/`vs-dark` ignore both palettes entirely (editor contrast is stock-Microsoft, not Kryom).

---

## 7. AI Chat UX audit

### 7.1 Conversation layout

Single-column articles at full width (`chat-message`, `max-width: 100%`), 9–12 px padding, 8 px radius,
10 px gaps. User messages get violet tint (`--kc-tint`); assistant messages sit on `--kc-panel-deep` with
a full border. Role row: `YOU` / `KRYOM AI · model` in 10 px bold caps + Copy + conditional “Open in
Agent”. Honest assessment: the layout is calm and scannable, but full-width bordered cards at 12 px read
more “issue tracker” than “premium assistant”; user/assistant distinction relies on tint alone and collapses
in light mode contrast terms `[U]`.

### 7.2 Streaming, markdown, code

- **No streaming** — the single biggest chat UX gap. The elapsed-clock loader (`AiChat.tsx:806-812`) is an
  honest placeholder, but 20–60 s answers with zero tokens feel broken to users trained by Cursor/Copilot.
  The backend contract (`KryomAIResponse`) has no stream fields, so this is a vertical slice, not a CSS fix.
- Markdown is safe and dependency-free but flat: no tables, links, task lists, autolink, or footnotes;
  highlighting is an approximate tokenizer, not a grammar. Long technical answers lose structure.
- Code blocks have Copy + “Send to Agent” (good routing: chat never edits files, `AiChat.tsx:568-578`),
  but no line numbers, no wrap toggle, no collapse for long blocks, no per-language treatment beyond a label.

### 7.3 Model, provider, context, attachments

Model picker is catalog-backed with graceful fallback (`AiChat.tsx:95-104`) — good. Provider failures route
to Provider Settings from the error box — good. Context line (file + dirty dot / workspace summary / +N
files / research) with an explanatory tooltip is excellent transparency. Attachments (max 8 excerpts, chips
with open/remove) are solid; missing: drag-drop, image/file-type affordances, size feedback before attach,
and any @-mention or `#file` inline reference.

### 7.4 Composer, stop/send, history, errors

- Ctrl+Enter-only send is unusual (Enter-to-send is the category default; no setting exists).
- Composer disabled while loading prevents follow-up queuing and prompt repair.
- 12,000-char cap with no counter; textarea grows to 200 px then scrolls (good).
- Stop is well-implemented (button + Esc + generation guard against late responses).
- Retry is correctly scoped (network/rate-limit/unknown only; auth/key route to settings).
- History: per-project restore with stale-save merge (50 cap, last-10 sent) + conversation tab bar with
  search — strong. Missing: export, fork/regenerate-assistant-only, token/cost visibility.

### 7.5 Long conversations and large prompts

`aria-live="polite"` + stick-to-bottom-unless-scrolled-up (`AiChat.tsx:133-159`) is correct. Gaps: no
virtualization (50 full MarkdownLite articles re-render per message — fine today, a risk if caps rise), no
jump-to-latest control, no per-message timestamps, no collapse for long assistant answers, no prompt history
(Up-arrow) in the composer.

---

## 8. Deep Research UX audit

Backend richness (objective → questions → queries → steps → plan → sources → evidence → findings → report →
export, with credibility scoring and depth profiles in `electron/services/research/`) exceeds the surface:

- **Input/modes:** single objective field + depth + model selects; three example prompts. No mode presets
  (quick/standard/deep described in services but surfaced only as depth), no source-type pre-filters, no
  “plan first, approve, then run” gate visible in the panel flow.
- **Progress/cancel:** interval polling with step icons (`✓ … ✕ – ○`); cancel exists (`:307`). No progress
  persistence story on window close; no per-step timing/cost.
- **Plan/sources/evidence/findings:** six tabs is a lot of chrome; every section reuses `.plan-view` /
  `.plan-commands` / `.finding-body`, so claims, evidence, and uncertainty all wear the same clothes.
  Citation affordances (jump from claim → source → quote) are present structurally but visually flat `[U]`.
- **Report/export:** report tab + export with template select — good bones. Missing: export format visibility
  in-panel, copy-with-citations, diff between brief revisions.
- **History:** session list with search/rename/delete — good; missing: pinning, folders, cross-session compare.
- **Handoff:** `onImplement` (→ agent) and `onAsk` (→ chat) props exist and chat carries `researchSessionId`
  as cited context with Detach — the handoff *architecture* is a genuine strength; the handoff *moments*
  (buttons, confirmations, previews) need prominence and feedback.

---

## 9. Autonomous Agent UX audit

### 9.1 The four questions (graded against the brief)

| Question | Verdict | Evidence |
|----------|---------|----------|
| What is it doing? | GOOD | Run states (11, labeled), live event timeline (`role="log"`), step icons, emitting `phase`/`analysis`/`proposal`/`command`/`check` events |
| What will it change? | GOOD | Plan approvals show risk list / exact command / file list; diffs via `diffLines` before apply; change-set manifest ordering |
| What needs approval? | GOOD | `waiting_for_approval` state; approval group with actions; server-issued ids re-validated main-side (`autonomous-run.cjs:1219-1224`) |
| What is verified? | EXCELLENT | Checks carry real `<pre>` output + exit codes; `executionRunId` binds reports to observed runs (`plan-store.cjs:1615`); policy refusals render as refusals, not failures |

No misleading success indicators were found in the inspected render paths; the codebase repeatedly asserts
“nothing invented” (`AgentWorkspace.tsx:7-9`, `AgentTasksPanel.tsx:4-9`, `useAgentRun.ts:1-5`) and the
verification plumbing backs it. `[U]` Full journey click-through (start → approve → verify → repair →
summary) was not runtime-tested and must be acceptance-tested at implementation.

### 9.2 Remaining UX gaps

- **Two homes.** Autonomous runs (stage) vs session tabs (editor) vs Implementation panel vs Tasks panel
  split one mental model (“my agent’s work”) across four containers with different vocabularies
  (run / session / plan / tracked plan / impl plan).
- **Timeline legibility.** Every event is a unicode glyph + message line; no grouping, filtering, severity
  color, timestamps-with-dates, or “only show approvals/changes/errors” lens. Long runs will bury approvals.
- **Diffs.** `diffLines` inline diffs are correct but lack file headers with path+stats, side-by-side option,
  large-diff collapse, or “open in editor” depth (exists via `onOpenFile` — needs prominence).
- **Terminal output.** Verification output is static `<pre>`; no ANSI color, no wrap toggle, no copy-all,
  no linkified paths. (Fixed by the terminal T1 render layer — see Terminal audit.)
- **Repair/cancel/recovery.** Repair cycles, pause/resume/cancel, checkpoints/undo all exist backend-side;
  surface prominence and post-recovery “what changed since” summaries need design attention `[U]`.
- **Composer.** Task composer + research-mode select + file search (⩽8) is good; missing: prompt templates,
  plan-preview-before-run, estimated blast radius, dry-run mode.

---

## 10. Main IDE and workspace audit

- **Activity bar:** 48 px, registry-driven (extensible — good), but 13 mixed-area items (sidebar/panel/
  center/action) with hints only on some; `ai` (action) vs `agent` (center) vs `home` (center) is confusing
  naming; no overflow/scroll story for 600 px-tall windows; active = white icon + indicator (subtle `[U]`).
- **Explorer:** tree + git badges + new file/folder/refresh + empty actions + native context menu — solid;
  badge legend is undiscoverable; no file nesting, no drag-drop noted, no breadcrumb in editor header
  (breadcrumbs CSS exists in `meta-ai.css:85-102` — usage unverified).
- **Editor tabs:** unified code+AI tabs with splits are a real differentiator; context menu + dirty dot +
  `+` session button + keyboard nav all present. Missing: drag-reorder/pinned tabs/preview tabs/tab overflow
  menu `[U]`, close-others UX beyond menu.
- **Monaco:** stock themes, no font family, 14 px default, minimap off, markers wired, find/replace/expand
  wired. Reads “default embed”, not “KryomCode editor”.
- **Bottom panel:** five tabs, resizable, hidden-persisted — right mechanics. Terminal tab dominates the
  default height for a one-line form; Problems/Output/Tasks/Git are thin and could share a denser idiom.
- **Source Control:** bottom-panel Git (toolbar + 3 lists + commit) vs activity `git`/`run` panel items —
  placement is VS Code-heretical (SCM usually sidebar) but internally consistent; judge by user testing.
- **Workspace switching:** Chat/Research discovery switch lives in the title bar AND the hero; Intel/Platform/
  Agent live in the activity bar AND stage tabs; editor/home switching uses a “← Back to editor” button.
  Three switch idioms for one job (where am I?).
- **Search & palette:** file search (name/content) + QuickOpen files-only; no symbol search, no command
  palette, no settings search. Palette is the highest-leverage missing IDE feature after the terminal.
- **Keyboard:** genuinely good coverage (files/tabs/navigate/views/run/composers) with an honest shortcuts
  dialog; missing palette, theme toggle, terminal-focus (`Ctrl+\`` toggles the tab, focus behavior `[U]`).

---

## 11. Responsive and accessibility audit

### 11.1 Responsive / window behavior

- Hard 900 px minimum (`body min-width` + window `minWidth 900`, `minHeight 600`); below-900 behavior is
  clipping, not adaptation. 1280×720 laptops lose ~1/3 of width to sidebar+activity+bottom defaults.
- One media query found (`theme.css:368`, ≤720 px chat tweaks) — effectively no responsive system.
- Panels clamp to window size on resize (`App.tsx:396-409`) — good; no breakpoint-driven layout changes.
- High-DPI: no `devicePixelRatio`-dependent logic found; Electron/Chromium scales natively — likely fine `[U]`.
- Text clipping: `muted`/crumb/tab/session-chip all ellipsis-guard — good; long German/technical strings in
  48 px-adjacent fixed chips may clip `[U]`.

### 11.2 Accessibility

Strengths: aria labels are pervasive (toolbar, tabs, timeline `role="log"`, errors `role="alert"`, dialogs,
switches, steppers); roving/single-tab-stop patterns in activity bar and tab strips; visible 2 px focus
outlines; dialogs return focus and trap via queue; reduced-motion respected in terminal scroll; English-only
i18n is honest (`src/i18n/index.ts`).

Gaps:

1. 10–11 px text + faint grays + 0.4-opacity disabled state → contrast must be measured; several pairs are
   likely below AA.
2. Icon meaning lives in `title` tooltips (no delay control, no touch/keyboard access, Windows-only timing).
3. Unicode glyph icons (`◧ ◫ ▶ ✓ ✕ …`) convey state by shape alone; screen-reader names exist in most places
   (`aria-hidden` + text) but the visual channel is font-fragile.
4. No high-contrast / forced-colors support found; no `prefers-contrast` handling.
5. Reduced-motion honored once (terminal); spinners (`loading-dot`), smooth scrolls, and transitions elsewhere
   need a global media-query guard.
6. Chat `aria-live="polite"` re-announces whole-message appends — acceptable, but streaming later must use
   throttled live regions, not per-token announces.
7. No skip links; no landmark audit (`main`/`nav`/`aside`/`section` exist but roles/labels are uneven).
8. Canvas-free UI (good for a11y); Monaco brings its own screen-reader support (stock, unconfigured).

---

## 12. Component sharing analysis

### 12.1 Shared today (keep)

`dialogs` (queued modals), `MarkdownLite` (chat/agent/research/briefs), `ResizeHandle`, `ErrorBoundary`
(root/sidebar/bottom), `meta-timeline` (timeline build + AI error classification), `models` (display names),
`command-confirm` (pre-execution confirm), `output-log`/`OutputPanel` (event log), `activity-registry`
(nav), `workbench-tabs` (tab model), `useProviderModels`, `useFocusTrap`, `Theme` utils, `theme-tokens.test`.

### 12.2 Duplicated (unify in redesign — see Blueprint §7)

- Composers ×3: `ai-composer` / `meta-composer` / `agent-run-composer` (+ `hero-form`, `terminal-input`).
- Tabs ×5+: editor / panel / session / research / stage (+ settings) tab CSS + behaviors.
- Buttons ×6+: default / secondary / mini / icon / stop / primary / suggest-chip / segment.
- Token systems ×2: `--kc-*` / `--kryom-*`.
- Mono stacks ×2: Consolas-hardcoded / `--kryom-mono`.
- Context menus ×2: DOM menu (tabs) / native menu (explorer).
- Empty/error/loading idioms per panel (no shared `EmptyState` / `ErrorState` / `LoadingDots`).
- Search inputs per panel (sessions, research, files, history — no shared `SearchInput`).
- Diff rendering (agent-only; research/export and git could share).

---

## 13. Competitor and reference patterns

Pattern-level analysis from public product knowledge (interaction patterns only, no branding).
Not screenshot-verified against current versions — re-check at implementation.

| Product | Patterns worth borrowing | What KryomCode should NOT copy |
|---------|--------------------------|-------------------------------|
| VS Code | Command palette as universal entry; activity→sidebar→editor→panel→status geography; settings as searchable UI; extension-contributed views; peek/hover idiom | Stock look; settings JSON cliff; terminal+problems+output as undifferentiated tabs |
| Cursor | Agent/Composer inline diff review with accept/reject per hunk; codebase-aware chat context chips (`@file`/`@folder`); checkpoint/restore framing for agent runs | Chat-first layout that buries the editor; opaque “it just worked” summaries |
| Windsurf (Cascade) | Plan-then-execute visibility; terminal command proposals as reviewable cards; deep codebase graph surfaced as “memories” | Heavyweight flow for trivial edits; brand-heavy chrome |
| Zed / Antigravity-class | Speed-first chrome (thin bars, 12–13 px UI, collaboration-grade presence); agent timeline as first-class artifact; prediction-state transparency (“what I’m doing now”) | Collaboration chrome KryomCode doesn’t need; exotic keymaps |
| Windows Terminal | Profile-driven shells (PowerShell/CMD/Azure/SSH); acrylic/tabs/panes; `quake mode`; full ANSI + unicode + ligatures; settings UI + JSON duality | Acrylic/blur weight; settings complexity for v1 |
| Modern research tools (Elicit/Consensus/Perplexity-class) | Claim→citation→source-quote chain; study/source cards with method+quality badges; uncertainty labels (“low evidence”, “contested”); export-with-citations | Paywalled-source UX; answer-first layouts that hide provenance |

How KryomCode stays distinctive: (1) the Research → Plan → Review → Execute → Verify pipeline as one
visible spine (nobody else wires cited research into agent context and observed-run verification);
(2) honesty-as-brand (no fake streaming, no invented checks, policy refusals shown); (3) violet-on-graphite
identity kept restrained; (4) MetaAI session tabs unifying chat/plan/research per task — extend, don’t flatten.

---

## 14. Why it does not look premium yet

Five sentences. (1) Two token systems, hardcoded colors, and nine radii mean the surface was assembled, not
designed. (2) Everything is 10–13 px, so hierarchy collapses and reading tires. (3) The hero surfaces —
Monaco, chat answers, terminal output — wear stock/default styling while chrome around them is custom, an
inversion of where polish should concentrate. (4) Navigation offers three ways to be somewhere (center modes,
title switch, activity areas) with no persistent “you are here”. (5) The two most-felt interactions —
terminal and streaming answers — are a form and a spinner, so the product *feels* prototype-grade no matter
how good the agent backend is.

---

## 15. Technical risks

1. **Streaming is a vertical slice** (provider → IPC → state → render), not a style fix; partial streaming
   (fake tokens) would destroy the honesty brand — do real SSE/chunked IPC or keep the clock.
2. **node-pty is the only native dependency proposed** (packaging/AV/ConPTY risks — see Terminal audit);
   everything else in the blueprint is dependency-light by design.
3. **Light-theme fragility** — any component edit can regress light mode until hardcoded colors are
   tokenized; the `theme-tokens.test.ts` harness must be extended first (Phase 0).
4. **Cancel-scope fix first** — scoping `terminal:cancel` to user-terminal runs changes shared
   process-manager behavior relied upon by diagnostics/git/agent; needs the existing `node:test` suites
   green before/after.
5. **Monaco custom theme** must be generated for both themes and kept in sync with tokens (build-time
   generation from the token file, not hand-maintained JSON).
6. **Font bundling** adds ~0.5–1 MB and a font-loading flash risk; needs `font-display: swap`-equivalent
   handling and offline-first packaging tests.
7. **No runtime verification was possible in this audit** — every `[U]` item needs eyes-on-glass before its
   redesign ships; budget a visual pass per phase.

---

## 16. Regression and verification notes

- Electron services: `npm test` (`node:test` across ~70 service suites — terminal, agent, research,
  diagnostics, git, wiring, IPC integration). Must stay green; extend `terminal.service.test.cjs` and
  `process-manager.test.cjs` for cancel scoping.
- Renderer: `npm run test:renderer` (vitest: AiChat, AgentWorkspace, ChatSessions, dialogs, ErrorBoundary,
  HomeHero, MarkdownLite, ResearchPanel, WelcomePage + theme token/theme tests). Add tests for every new
  shared component and every touched composer/tab/button.
- Token integrity: extend `theme-tokens.test.ts` to fail on hardcoded hex in component CSS and on
  `--kc-*`/`--kryom-*` drift (single-source check).
- Syntax/state gates: `npm run check:syntax`, `check:workbench`, `check:test-manifest` (see package.json).
- Manual smoke per phase: dark+light screenshot pair, 900 px + 1440 px + HiDPI, keyboard-only traversal,
  screen-reader spot check, reduced-motion on, offline chat, destructive-command double-gate, agent
  approve→verify→repair loop, research export, settings round-trip.
- None of the above could be executed in this audit environment (shell unavailable); first implementation
  step is re-running all suites on the implementer’s machine.

---

## 17. Files inspected

Primary reads (full or major sections): `package.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx`
(§1-500, §2394-2920, targeted), `src/api/kryom.ts`, `src/electron.d.ts` (key interfaces + `KryomAPI` head),
`src/styles/app.css` (targeted sections across 3,500+ lines), `src/styles/theme.css` (full),
`src/styles/meta-ai.css` (tokens + selector map), `src/styles/hero.css` (head), `src/styles/theme-tokens.test.ts`
(head), `src/utils/theme.ts`, `src/utils/models.ts`, `src/utils/command-confirm.ts`, `src/components/ActivityBar.tsx`
(head), `src/components/activity-registry.ts` (full), `src/components/Chrome.tsx` (TitleBar + StatusBar head),
`src/components/TerminalPanel.tsx` (full), `src/components/AiChat.tsx` (full), `src/components/MarkdownLite.tsx`
(head), `src/components/ResearchPanel.tsx` (head + structural map), `src/components/AgentWorkspace.tsx`
(head + structural map), `src/components/MetaAIWorkspace.tsx` (head), `src/components/AgentPanel.tsx` /
`AgentTasksPanel.tsx` / `AgentHistoryPicker.tsx` (headers), `src/components/EditorPanel.tsx` (head + Monaco
options), `src/components/EditorTabs.tsx` / `Explorer.tsx` / `SearchPanel.tsx` / `GitPanel.tsx` /
`ProblemsPanel.tsx` / `OutputPanel.tsx` / `TasksPanel.tsx` / `ChatSessions.tsx` (structural),
`src/components/IntelligenceHub.tsx` / `PlatformHub.tsx` (tab maps), `src/components/WelcomePage.tsx` /
`HomeHero.tsx` / `QuickOpen.tsx` (heads), `src/components/SettingsModal.tsx` (sections + general),
`src/components/ShortcutsDialog.tsx` (full shortcut list), `src/components/dialogs.tsx` (head),
`src/components/ChatSessions.tsx`, `src/state/workbench-tabs.ts` (head), `src/hooks/useAgentRun.ts` (head),
`src/hooks/useProviderModels.ts` (listed), `src/i18n/index.ts` (head), `src/components/meta-timeline.ts`
(error taxonomy), `electron/main.cjs` (window + shutdown), `electron/preload.cjs` (bridge head),
`electron/menu.cjs` (accelerator map), `electron/ipc/terminal.ipc.cjs` (full),
`electron/ipc/approval.cjs` (gate), `electron/ipc/platform.ipc.cjs` (extension-command context),
`electron/services/terminal/terminal.service.cjs` (full), `electron/services/terminal/process-manager.cjs`
(head), `electron/services/terminal/command-validator.cjs` (patterns head),
`electron/services/diagnostics/diagnostics.service.cjs` + `electron/services/git/git.service.cjs`
(runCommand usage), `electron/services/agent/autonomous-run.cjs` + `plan-store.cjs` (policy/verification
usage), `docs/` manifest (39 files present; audit adds 3).

Listed but not content-inspected (headers/signatures only — detail unverified):
`ResizeHandle`, `TemplatePickerDialog`, `DiagnosticsDialog`, `AboutDialog`, `ErrorBoundary`,
`ConnectionsPanel`, `MemoryPanel`, `ExtensionsPanel`, `ProfilePanel`, `ProviderSettings`, `FileIcons`,
`MetaMark`, `AiKeyNotice`, `history-relevance`, `intent`, `useMetaWorkspace`, `useFocusTrap`,
`utils/{paths,languages,output-log,session-restore,diff,monaco-setup}`, `state/meta-sessions` (partial),
`vite.config.ts`, `vitest.config.ts`, `tsconfig`, `electron/security/*`, remaining `electron/ipc/*` and
`electron/services/*` beyond those above. Where this audit cites them, it cites only confirmed signatures.
