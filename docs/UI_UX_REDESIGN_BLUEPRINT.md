# KryomCode — UI/UX Redesign Blueprint

Status: PROPOSAL ONLY. Implements nothing. Companion to the [UI/UX Audit](UI_UX_AUDIT.md) (findings) and the
[Terminal UX & Architecture Audit](TERMINAL_UX_AND_ARCHITECTURE_AUDIT.md) (terminal track).

> IMPLEMENTATION STATUS (Phase 0+1): roadmap Phases 0–1 plus terminal T0 preconditions are
> implemented — see [Phase 0+1 Implementation Report](PHASE_0_1_IMPLEMENTATION_REPORT.md). Test
> suites could not be executed in the implementation environment; run the §14 runbook before merge.
All file/line references point at the audited tree; “Change:” lines name the intended edit sites for the
implementation phase — do not apply until approved.

Contents: [1](#1-design-principles) principles · [2](#2-typography-system) type · [3](#3-theme-system)
themes · [4](#4-chat-redesign) chat · [5](#5-research-redesign) research · [6](#6-agent-redesign) agent ·
[7](#7-shared-component-system) shared kit · [8](#8-main-ide-layout) IDE · [9](#9-responsive--accessibility-targets)
responsive/a11y · [10](#10-redesign-vs-preserve) preserve/redesign · [11](#11-phase-12--decision-answers)
decisions · [12](#12-implementation-roadmap) roadmap · [13](#13-acceptance-criteria) acceptance ·
[14](#14-regression-strategy) regression.

---

## 1. Design principles

1. **Editor first.** The code surface is the hero; chrome shrinks and quiets around it.
2. **One system.** One token graph, one radius scale, one type scale, one tab idiom, one composer kit.
3. **Honesty is the brand.** Real streaming or an honest clock; real verification or no checkmark; refusals
   shown as refusals. Never trade truth for shimmer.
4. **Restrained Kryom identity.** Graphite surfaces, one violet accent, one blue “Meta/AI” signal; no
   gradients, glows, or oversized playful cards.
5. **Density with hierarchy.** 12–13 px UI is fine; 12 px *body reading* is not. Labels small, reading
   comfortable, display rare.
6. **Keyboard-complete.** Every pointer flow has a key path; palette-first navigation.
7. **No native dependencies except node-pty** (terminal track only, late, reversible).

---

## 2. Typography system

### 2.1 Recommendation (decisive)

| Role | Choice | Why |
|------|--------|-----|
| UI | **Inter Variable** (OFL, bundled via `@fontsource-variable/inter`) | Drawn for 11–13 px UI; tabular figures; huge x-height; OFL = bundle-safe; variable = one file (~300 KB woff2) |
| Mono | **JetBrains Mono** (OFL, bundled via `@fontsource/jetbrains-mono`) | Distinctive but professional; ligatures; excellent at 12–13 px; OFL = bundle-safe |
| Fallbacks | UI: `system-ui, 'Segoe UI', …`; Mono: `'Cascadia Code', Consolas, monospace` | Zero-flash offline fallback; Cascadia already referenced in `meta-ai.css:24` |
| Editor | JetBrains Mono (Monaco `fontFamily`), 14 px default | Unifies editor with terminal/code blocks; ligatures on, minimap stays off |

Why not the others: Geist is excellent but distribution is Vercel-centric (no official Fontsource-equivalent
long-term guarantee at audit time — re-check); IBM Plex Sans is wider and heavier-feeling at 12 px;
Segoe UI alone is fine but intentionally “default Windows”, not distinctive; Cascadia Code as *primary* mono
is good but its character disambiguation and ligature set trail JetBrains Mono; Fira Code is wider and
looser at small sizes. Inter + JetBrains Mono is the Cursor/Zed-class pairing and keeps a Kryom voice.

Packaging: two Fontsource variable/static packages, imported in `main.tsx` before `app.css`, covered by
`files: dist/**` already; add a startup font-readiness check + offline test (see §14). No native code.

### 2.2 Type scale (exact tokens)

Base 13 px UI. All sizes in px, weights numeric, leading unitless, tracking in em.

```
--kc-font-ui:   'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif
--kc-font-mono: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace

--kc-text-10: 10px / 600 / 1.4 / +0.06em   — eyebrow labels ONLY (role rows, section eyebrows)
--kc-text-11: 11px / 500 / 1.45 / +0.01em  — chips, captions, tab meta, status bar, tooltips
--kc-text-12: 12px / 450 / 1.5  / 0        — dense UI (lists, trees, toolbar, buttons-small)
--kc-text-13: 13px / 450 / 1.55 / 0        — UI default (inputs, menus, dialogs, sidebar)
--kc-text-14: 14px / 450 / 1.6  / 0        — READING default (chat answers, findings, report, agent messages)
--kc-text-16: 16px / 600 / 1.4  / -0.01em  — section titles, empty-state headings
--kc-text-20: 20px / 650 / 1.3  / -0.015em — panel heroes (rare: stage headers)
--kc-text-27: 27px / 650 / 1.25 / -0.02em  — home hero ONLY (keep current 27px, tighten leading)

--kc-mono-11: 11px / 450 / 1.6  — inline code, badges, timestamps
--kc-mono-12: 12px / 450 / 1.65 — code blocks, terminal, diffs, verification output
--kc-mono-13: 13px / 450 / 1.7  — terminal default (user-adjustable 11–16 in settings)
--kc-mono-14: 14px              — Monaco default (user-adjustable 10–24, unchanged mechanics)
```

Rules: nothing below 10 px; 10 px never carries meaning alone (paired with icon/color/position); reading
surfaces (chat/research/agent/output prose) move 12 → 14 px; code moves 11 → 12 px (terminal 13 px);
headings keep 650 (Inter renders 600–650 crisply); tabular numerals for times/counters
(`font-variant-numeric: tabular-nums`).

Change: `src/styles/*.css` (replace hardcoded `Consolas`/sizes), `src/components/EditorPanel.tsx`
(`fontFamily` + generated Monaco theme), `src/main.tsx` (font imports), new `src/styles/tokens.css`
(see §3.4). Keep `font-synthesis: none`.

---

## 3. Theme system

### 3.1 KryomCode Premium Dark (proposed HEX)

Evolved from the current palette (identity preserved), with deliberate surface steps and AA-checked text.

| Token | HEX | Role / notes |
|-------|-----|--------------|
| `--kc-bg` | `#0E0F13` | App base (slightly deeper than current `#101114`) |
| `--kc-sidebar` | `#14151B` | NEW: sidebar distinct from app base |
| `--kc-editor` | `#101116` | NEW: editor/stage canvas, between base and sidebar |
| `--kc-panel` | `#17181F` | Cards, message surfaces, wells-up |
| `--kc-raised` | `#1E1F29` | Popovers, menus, dialogs, hover-lift |
| `--kc-input` | `#121318` | Inputs, composer fields |
| `--kc-strip` | `#1B1C26` | Selected rows, active tabs |
| `--kc-text` | `#E7E7EC` | Primary text (target ≥ 12:1 on bg) |
| `--kc-text-dim` | `#B9B9C6` | Secondary (target ≥ 7:1) |
| `--kc-text-faint` | `#8E8E9B` | Tertiary, 11 px+ only (target ≥ 4.5:1 on panel) |
| `--kc-text-ghost` | `#6B6B78` | Decorative/placeholder only — never meaningful text |
| `--kc-border` | `#26272F` | Dividers |
| `--kc-border-soft` | `#1F2027` | Card hairlines |
| `--kc-border-strong` | `#34353F` | Inputs, buttons |
| `--kc-accent` | `#8B7CFF` | KEEP: brand violet — interactive highlights, active states |
| `--kc-accent-dim` | `#6556C8` | KEEP: fills (hero mark, active pills) |
| `--kc-accent-soft` | `#C4B5FD` | KEEP: on-dark accent text |
| `--kc-accent-btn` | `#6F5FE0` | Slightly deepened for white-text contrast (target ≥ 4.5:1) |
| `--kc-ai` | `#2E9BFF` | NEW (from `--kryom-meta` `#0082fb`, lifted for dark): “model/AI” signal — model badges, AI glyphs, streaming caret |
| `--kc-link` | `#7AA8FF` | Links on dark (from `#6ea8fe`, lifted) |
| `--kc-ok` | `#7EE2A8` | KEEP + text/bg/border companions |
| `--kc-warn` | `#E8C874` | KEEP + companions |
| `--kc-danger` | `#FF8F9A` | KEEP + companions |
| `--kc-focus` | `#8B7CFF` | 2 px outline (keep mechanics) |
| `--kc-selection` | `rgba(139,124,255,.28)` | NEW: `::selection` token |
| `--kc-hover` | `rgba(255,255,255,.05)` | NEW: hover wash for rows/buttons-ghost |
| `--kc-scroll` | `#3E3F4A` | Scrollbar thumb |
| `--kc-on-accent` | `#FFFFFF` | Text on accent fills |
| `--kc-disabled-fg` | `#6B6B78` | Disabled text (no more bare opacity on faint text) |

Radius scale (only these): `--kc-radius-s: 4px` (inputs-inner, badges) · `--kc-radius-m: 6px`
(buttons, inputs, tabs) · `--kc-radius-l: 8px` (cards, messages) · `--kc-radius-xl: 12px`
(dialogs, hero mark) · `--kc-radius-pill: 999px` (chips, toggles). Delete 5/7/10/14/20 px one-offs.

### 3.2 KryomCode Professional Light (proposed HEX)

| Token | HEX | Role / notes |
|-------|-----|--------------|
| `--kc-bg` | `#F2F2F5` | App base (keeps `#FFFFFF` for editor/cards — separation without gray soup) |
| `--kc-sidebar` | `#ECECF0` | Sidebar |
| `--kc-editor` | `#FFFFFF` | Editor/stage canvas |
| `--kc-panel` | `#FFFFFF` | Cards, messages |
| `--kc-raised` | `#FFFFFF` | + 1 px border + restrained shadow `0 4px 16px rgba(20,20,40,.08)` for menus/dialogs only |
| `--kc-input` | `#FFFFFF` | Inputs |
| `--kc-strip` | `#E9E9EF` | Selected rows/tabs |
| `--kc-text` | `#191A20` | Primary (target ≥ 14:1 on white) |
| `--kc-text-dim` | `#4E4E59` | Secondary (target ≥ 7:1) |
| `--kc-text-faint` | `#73737E` | Tertiary (target ≥ 4.5:1) |
| `--kc-text-ghost` | `#A6A6B0` | Decorative only |
| `--kc-border` | `#D9D9E0` | Dividers |
| `--kc-border-soft` | `#E6E6EB` | Hairlines |
| `--kc-border-strong` | `#C4C4CD` | Inputs/buttons |
| `--kc-accent` | `#5F4FD6` | Darkened violet for light surfaces (target ≥ 4.5:1 as text) |
| `--kc-accent-dim` | `#6556C8` | Fills |
| `--kc-accent-soft` | `#4A3FA8` | On-light accent text |
| `--kc-accent-btn` | `#5F4FD6` | Primary buttons (white text) |
| `--kc-ai` | `#0B5FFF` | AI signal on light (current link blue — now with its own job) |
| `--kc-link` | `#0B5FFF` | Links |
| `--kc-ok` / bg / border | `#1A7F4B` / `#E2F4E9` / `#BFE3CB` | Keep current light sets |
| `--kc-warn` equivalents | `#8F6200` / `#FAF0D7` / `#E6D18A` | Keep |
| `--kc-danger` equivalents | `#D92D20` / `#FDE8E8` / `#F0B6BC` | Keep |
| `--kc-focus` | `#5F4FD6` | 2 px outline |
| `--kc-selection` | `rgba(95,79,214,.22)` | `::selection` |
| `--kc-hover` | `rgba(20,20,40,.05)` | Hover wash |
| `--kc-scroll` | `#C2C2CA` | Thumb |

Contrast: every text token ships with a declared pair and target (primary ≥ 12, secondary ≥ 7,
tertiary ≥ 4.5, on-fill ≥ 4.5); Phase 0 adds automated ratio checks over the token file (see §14).
No contrast claim above is asserted as measured — all must pass tooling before sign-off.

### 3.3 Monaco themes (new)

Generate `kryom-dark` / `kryom-light` Monaco themes at build time from the token file (single source):
background `--kc-editor`, foreground `--kc-text-dim`-ish, line numbers faint, cursor accent, selection
`--kc-selection`, find-match warn wash, diff-insert ok wash / diff-remove danger wash. Wire via
`monaco.editor.defineTheme` in `utils/monaco-setup.ts`; replace `vs`/`vs-dark` in `EditorPanel.tsx:477`
and `theme.ts:63-65`. MarkdownLite code colors and agent diff colors derive from the same token set.

### 3.4 Token architecture

- New `src/styles/tokens.css`: `:root` (shared: fonts, radii, z-index, motion) + `html[data-theme]`
  overrides. **Delete the `--kryom-*` system**: codemod `var(--kryom-X)` → `var(--kc-Y)` per mapping table
  (authored in Phase 0; `--kryom-meta` → `--kc-ai`), remove `meta-ai.css:6-24` and `theme.css:114-129`.
- Import order becomes `tokens.css → app.css → meta-ai.css → hero.css → theme.css` (theme last wins).
  Extend `theme-tokens.test.ts`: every consumed token defined in both themes (exists) + no hardcoded hex
  outside `tokens.css` (new) + no `var(--kryom-` (new) + contrast-ratio spot checks (new).
- Remove the `TODO(verify)` backfill (`theme.css:12-13`) by completing tokenization, and delete the dead
  Settings “Theme” row (`SettingsModal.tsx:238-248`).

---

## 4. Chat redesign

Target: a premium AI coding assistant — calm, fast-feeling, transparent about context, one keystroke from
the agent.

### 4.1 Layout (wireframe)

```
┌─ ai-toolbar ─────────────────────────────────────────────┐
│ [Kryom AI] [model ▾] [Context ✓] [file·+2·research ⓘ]   │  ← keep, tighten to 36px
│                                        [history] [clear] │
├─ ai-messages ────────────────────────────────────────────┤
│ ┌ user (left, tinted) ─────────────────────────────────┐ │
│ │ YOU · 14:02:11                          [copy] [agent]│ │  ← 10px eyebrow + timestamp
│ │ 14px question text…                                  │ │
│ └──────────────────────────────────────────────────────┘ │
│ ┌ assistant ───────────────────────────────────────────┐ │
│ │ ◆ KRYOM AI · Muse Spark 1.3 · 3.2s      [copy] [retry]│ │  ← AI glyph, model, latency
│ │ 14px/1.6 answer, 20px paragraph rhythm                │ │
│ │ ┌ code: main.ts ─────────────── [copy] [agent] [wrap]┐│ │
│ │ │ 12px JetBrains Mono, line numbers >8 lines        ││ │
│ │ └───────────────────────────────────────────────────┘│ │
│ │ [sources: research brief §2 §5] (when attached)      │ │
│ └──────────────────────────────────────────────────────┘ │
│ ▸ streaming caret + “Stop” (streaming phase; else clock)│ │
├─ composer ───────────────────────────────────────────────┤
│ [context chips: file · +2 · research ×]                  │
│ ┌ textarea (Enter=send, Shift+Enter=newline, ⌄ queue) ─┐ │
│ │ Ask about your code…                    1,204 / 12k  │ │  ← live counter
│ └──────────────────────────────────────────────────────┘ │
│ [＋ Attach] [@ file] [model]            [Stop]/[Send ↑] │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Behavior changes (all in `AiChat.tsx` + `MarkdownLite.tsx` + CSS)

1. **Reading size 12 → 14 px** (§2.2); role eyebrow keeps 10 px caps + adds timestamp; assistant header
   adds model badge + latency (“3.2s”) from request timing (already measurable).
2. **Enter-to-send** as default with Shift+Enter newline; Ctrl+Enter keeps working; setting to flip
   (matches Cursor/Copilot/VS Code chat). Composer stays **enabled while loading**: typing queues a
   follow-up draft; Send becomes Stop; queued draft sends after (with visible “queued” chip).
3. **Streaming-ready states now, protocol later:** add `StreamingDots + caret + elapsed + Stop` state and a
   `useStreamText` seam that today resolves one block and later consumes `ai:stream` chunks — UI ships
   once, transport swaps underneath. (Backend slice tracked as roadmap item S1; no fake tokens, ever.)
4. **Message actions:** per-message Copy (keep), Retry-assistant (new, failed/weak answers), Pin (new,
   pins into context), timestamp, token-ish length (“~1.2k chars”), collapse for answers > 60 lines.
5. **Code blocks:** filename label when detectable, line numbers past 8 lines, wrap toggle, collapse past
   40 lines, Copy + Send-to-Agent (keep), language-aware header color (subtle, token-based).
6. **Markdown:** add tables, autolinked URLs, task lists, inline footnotes `[^n]` for research citations;
   keep the no-HTML-execution guarantee and extend `MarkdownLite.test.tsx`.
7. **Context:** keep the one-line summary + tooltip (a strength); add removable context chips above the
   composer; attachments gain drag-drop + per-file char counts + total budget bar (18k file / 4k summary
   caps visualized).
8. **History:** keep sessions tab bar + search; add rename-inline affordance, export conversation (.md),
   “New chat” shortcut (pick `Ctrl+Alt+N`, document), jump-to-latest pill on scroll-up.
9. **Empty state:** keep suggestion chips; add 3 recent prompts + “Attach the active file” one-click when
   context would otherwise fall back to summary.

Change: `AiChat.tsx`, `ChatSessions.tsx`, `MarkdownLite.tsx` (+tests), `app.css` chat sections,
`theme.css` session/attach sections, `ShortcutsDialog.tsx` (new rows), `menu.cjs` (optional items).

---

## 5. Research redesign

Target: a scientific instrument — provenance you can see, uncertainty you can trust, handoffs you can feel.

### 5.1 Layout (wireframe)

```
┌─ research-head ──────────────────────────────────────────┐
│ (◀ sessions) Objective input + [depth ▾] [model ▾] [Run]│
│ plan-first toggle: [✓ Propose plan for approval]         │
├─ progress (while running) ───────────────────────────────┤
│ Step 4/9 · searching “conformance” …  [Cancel]  00:41   │
│ ▓▓▓▓▓▓▓░░░░░  plan ✓ · queries 6/8 · sources 23         │
├─ tabs ───────────────────────────────────────────────────┤
│ Overview · Plan · Sources (23) · Evidence · Findings · Report · [Export ▾] [Ask] [Implement]
├─ body (example: Findings) ───────────────────────────────┤
│ ┌ finding ── confidence: HIGH ───────────── [cite] [pin]┐│
│ │ 14px claim text… [1][3]                               ││
│ │ “quoted span…” — source [1] host · accessed date      ││
│ │ ⚠ contested: source [7] disagrees → view              ││
│ └───────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### 5.2 Behavior changes (in `ResearchPanel.tsx` + CSS + services as needed)

1. **Visual language for evidence:** three distinct card species replace generic `.plan-commands` —
   `claim-card` (white/panel, left accent edge), `evidence-card` (well bg, mono quote span, source link),
   `caveat-card` (warn wash, “contested / low-evidence / stale” badge). Confidence badges
   (HIGH/MED/LOW) are color + text, never color alone.
2. **Citation chain:** every claim cites `[n]` → click scrolls to source card → source card shows captured
   quote + URL + host + accessed-at + credibility signals (already in services: `credibility`, `evidence`).
   Copy-with-citations button per finding and per report.
3. **Plan-first mode:** optional “propose plan → approve → run” gate reusing the agent approval idiom
   (same component, see §7) — research plans become reviewable artifacts.
4. **Progress:** determinate step progress (x/y from `steps`), per-step status icons (keep glyphs, add
   color+text), elapsed clock, cancel that reports partial results (“kept 14 sources from 5 steps”).
5. **Sources:** keep type/access/text filters; add sort (relevance/date/credibility), host-initial avatar
   (no external fetch — offline-safe), “open externally” + “copy citation” per card, bulk exclude/include.
6. **Report/Export:** keep template select; surface format + size estimate in-panel; export writes .md/.html
   (and .pdf later via print CSS, not a new dep); brief revisions diffable.
7. **Handoffs:** prominent `Ask in Chat` / `Implement in Agent` header buttons with preview popover (“will
   attach brief §1–§4 as cited context”); chat already honors `researchSessionId` — add the reverse link
   (“asked in chat 2×” on the session).
8. **History:** keep list/search/rename/delete; add pin + status filter (complete/partial/failed) + last-run
   summary line.

Change: `ResearchPanel.tsx` (+tests), `app.css` research sections (replace `.plan-commands` reuse),
`ResearchPanel.test.tsx`, possibly `research.service` for plan-first (gated addition).

---

## 6. Agent redesign

Target: one agent, one story — always answer doing / changing / approval / verified within one glance.

### 6.1 Consolidation (no backend rewrite)

- **One home:** `AgentWorkspace` (stage) becomes the run console; `MetaAIWorkspace` tabs become
  “task threads” that EMBED the same run console components (composer, timeline, approvals, diffs, checks)
  instead of parallel implementations. Shared presentational components in `src/components/agent/`:
  `RunHeader`, `TaskComposer`, `PlanApprovals`, `RunTimeline`, `ChangeDiffs`, `VerifyChecks`, `RunSummary`.
- **One vocabulary:** run = execution; thread = persistent task container; plan = proposed steps; change-set
  = file edits; check = verification. Rename labels only (backend ids untouched).
- **Impl plans / specialist runs / orchestration** (Intel) stay power features but link bidirectionally
  (“created by run #12”, “spawned specialist run →”).

### 6.2 Run console (wireframe)

```
┌─ RunHeader (sticky) ─────────────────────────────────────┐
│ ● EXECUTING · run #12 · “Add dark-mode toggle”  [⏸][⏹]  │  ← state dot + text, never color alone
│ task · model · 3 files · 2/5 checks · 04:12 · [history ▾]│
├─ approvals (only when pending — pinned above timeline) ──┤
│ ⚠ APPROVAL: run `npm run migrate` ?  [Approve] [Deny]   │  ← exact command, risk list, policy note
├─ timeline (filterable) ──────────────────────────────────┤
│ [All][Approvals][Changes][Checks][Errors]    [follow ✓] │
│ 14:02:11 ◆ planning — 4 steps proposed        [view plan]│
│ 14:03:02 ✎ change  src/ui/theme.ts +48 −12   [diff]     │
│ 14:04:40 ✓ check  `npm test` exit 0 · 212ms  [output]   │
├─ detail drawer (right, collapsible) ─────────────────────┤
│ diff / output / plan JSON for the selected event         │
└──────────────────────────────────────────────────────────┘
```

### 6.3 Behavior changes

1. Sticky `RunHeader` with state dot + label, pause/resume/cancel, elapsed, counts, history switcher.
   Cancel/pause confirm when edits are applied-but-unverified (“3 changes applied, 0 verified — pause?”).
2. Approvals pinned above the timeline (never buried), with blast-radius line (“touches 3 files, 0
   deletions, 1 command”), policy note (“allowed by policy: test-only commands”), and keyboard
   (`A` approve / `D` deny when focused — documented).
3. Timeline: grouping by phase, filter lenses, severity color + icon + text, timestamps, follow-toggle,
   per-event detail drawer (diff/output/plan) instead of infinite inline expansion.
4. Diffs: file header (path, +/− stats, action badge create/modify/delete), unified + side-by-side toggle,
   collapse > 200 lines, per-hunk Approve/Reject (Cursor-class; backend already applies per-edit —
   surface it), “open in editor” prominent.
5. Checks: keep real output + exit codes; add ANSI color (terminal T1 renderer, shared), wrap toggle,
   copy-all, duration, re-run-single-check, “refused by policy” stays visually distinct from failure.
6. Summary: deterministic result grid (keep) + “what changed since run start” file list + next-suggested
   action (“2 checks failed → Start repair?”) + export run transcript (.md).
7. Composer: task templates (“bugfix”, “feature”, “refactor”, “chore”), blast-radius preview (files matched
   by context search), plan-preview-before-run toggle, research attach (exists — surface it).

Change: new `src/components/agent/*` (extracted from `AgentWorkspace`/`AgentPanel`/`AgentTasksPanel` —
extract, don’t fork), `useAgentRun.ts` (additive), `app.css`/`meta-ai.css` agent sections,
`diff.ts` (side-by-side support), tests per extracted component.

---

## 7. Shared component system

### 7.1 The kit (new `src/components/ui/`)

Each: one component + one CSS block + one test + usage in ≥2 places before it ships.

| Component | Replaces / unifies | Notes |
|-----------|-------------------|-------|
| `Button` (primary/secondary/ghost/mini/icon/danger) | 6 button idioms | 12/13 px, radius-m, focus ring, loading prop |
| `Icon` (SVG set, 16/20 px, stroke 1.7) | unicode glyphs in chrome | Activity registry paths + new set (play/pause/stop/check/x/warn/info/chevron/search/plus/file/diff/terminal/sparkle); glyphs remain ONLY in log-density spots with text labels |
| `Tabs` (underline/pill variants) | editor/panel/session/research/stage/settings tabs | Roving tabindex, counts, close buttons, overflow menu |
| `Composer` (textarea + footer + attachments + counter + queue) | ai/meta/agent-run composers | Enter-to-send setting, queue-while-busy, 12k counter, drag-drop attach |
| `CodeBlock` (extract from MarkdownLite) | chat/agent/research code | Copy/wrap/collapse/line-numbers/language label/Send-to-Agent slot |
| `DiffView` (extract from agent) | agent diffs; adopt in git + research-revisions | Unified/side-by-side, hunk actions, stats header |
| `Markdown` (extend MarkdownLite) | all prose | + tables, autolink, task lists, footnotes; same no-HTML guarantee |
| `EmptyState` / `ErrorState` / `LoadingDots` | per-panel idioms | Icon + title + hint + action slot; error takes `AIErrorKind`/retry |
| `SearchInput` | per-panel searches | Icon, clear, shortcut hint, debounce |
| `Segmented` | `.segmented` CSS (title/hero/settings) | One component, sizes s/m |
| `Badge`/`Chip`/`StatusDot` | status chips, git badges, model badges, state dots | Dot + text, never color alone |
| `Tooltip` | `title` attributes (progressive) | Delayed, keyboard-accessible, touch-long-press; keep `title` as fallback during migration |
| `Menu` (DOM) | tab context menu | Keyboard nav, submenus, danger items; explorer migrates off native menu later (keep native until parity) |
| `Drawer`/`SplitDetails` | agent detail expansion | Right-side detail pane pattern for agent/research/sources |
| `VirtualList` | — (new) | Long logs/timelines/sessions (terminal T2, agent timeline, output) |

### 7.2 Codemods and order

1. Tokens + radii + type first (§2–§3), so every extracted component lands on final values.
2. Extract `CodeBlock` + `Markdown` (most reused), then `Button` + `Tabs` + `Segmented`, then `Composer`,
   then `DiffView`, then states/inputs/icons/tooltip/menu.
3. Each extraction: new component + migrate all call sites + delete old CSS + tests. No parallel old/new
   (no `Button2`).

---

## 8. Main IDE layout

### 8.1 Target geography (wireframe, 1440 px)

```
┌─ native menu (keep) ─────────────────────────────────────┐
│ logo KryomCode · my-project › theme.ts • │ palette │ ◧ ◫ │  ← 40px: brand, crumb, palette hint, layout
├───┬──────────┬──────────────────────────────┬───────────┤
│   │ EXPLORER │ theme.ts ×  session: auth ×  │ (drawer   │
│ A │ filter   │ ───────────────────────────── │  when    │
│ c │ ▸ src    │ 1  import …                   │  open:   │
│ t │ ▸ tests  │ 2  …14px JetBrains, kryom-dark│  agent   │
│   │          │                               │  detail) │
│ 4 │──────────│ ─────────── bottom (280px) ─── │          │
│ 8 │          │ TERMINAL ▸vet │ PROBLEMS 2 │ … │          │
├───┴──────────┴──────────────────────────────┴───────────┤
│ ok ready · main* · TS · Ln 42 · Spark 1.3 · 0 running   │  ← 24px status bar
└──────────────────────────────────────────────────────────┘
```

### 8.2 Concrete changes

1. **Title bar (40 px, keep height):** brand + crumb (keep); REMOVE the Chat/Research segmented (discovery
   mode moves into the home view only); ADD command-palette entry (button + `Ctrl+Shift+P`);
   keep layout toggles with real SVG icons (replace `◧ ◫`).
2. **Activity bar (48 px, keep):** trim to 8: Explorer, Search, Source Control, Run/Debug, Agent, Research,
   Extensions, Accounts-bottom + Settings-bottom. Intel/Platform become Agent-console tabs, not center views;
   `home` becomes a house icon that toggles the welcome; `ai` action merges into Agent. Overflow: scrollable
   group with fade (fixes 600 px-tall windows).
3. **Sidebar (260 px default, keep mechanics):** add filter boxes (Explorer has none visible), badge legend
   (git), section headers in 11 px caps (unified), collapsible sections. Source Control OPTION: move GitPanel
   to sidebar (VS Code-addressable) and leave bottom Git as history — A/B with users; default to move.
4. **Center:** editor groups (keep splits, add drag-reorder + pinned + preview tabs + overflow menu);
   stage becomes the **Agent & Intel console** (tabs: Agent / Research-active / Intel / Platform) — one
   “AI side of the product” instead of three center identities; home keeps WelcomePage but loses the
   title-bar switch (mode tabs live in-view).
5. **“You are here”:** exactly one switch idiom — the activity bar selects the *place*; the center header
   shows the place breadcrumb; remove “← Back to editor” by making editor always one click away (activity
   Explorer double-click / `Ctrl+1` — both already exist, surface them).
6. **Bottom panel (280 px default):** terminal (T1/T2 — see Terminal audit) / Problems (count badge, click
   → marker) / Output / Git-history / Tasks; unified dense row idiom; per-tab Clear; panel-maximize toggle.
7. **Status bar (24–26 px):** keep items; add agent-state pill (● executing run #12 — click → console),
   terminal-shell indicator (pwsh · exit 0), research-active indicator; every pill clickable to its view.
8. **Command palette v1 (`Ctrl+Shift+P` / `Ctrl+K`):** commands (all menu items + view toggles + agent/research
   actions + theme toggle) THEN files (`Ctrl+P` merges as palette mode, VS Code-style).
   Reuses QuickOpen fuzzy core (`fuzzyScore` — extract to `utils/fuzzy.ts`).
9. **Search:** keep name/content modes; add symbol search (from existing symbol index services) as palette
   `@`-mode later; persist recent searches.
10. **Settings:** grow to sections General / Appearance (theme + UI density + terminal font) / AI & Models /
    Terminal (shell profiles — T2) / Keyboard (shortcut list + palette) / Advanced; search box; settings as
    JSON-behind-UI later. Delete dead Theme row in Phase 0.

Change: `App.tsx` (shell/stage/bottom), `Chrome.tsx` (title/status), `ActivityBar.tsx` + registry,
`EditorTabs.tsx`, `SettingsModal.tsx` (+ new sections), new `CommandPalette.tsx`, `QuickOpen.tsx`
(fuzzy extract), CSS shell sections.

---

## 9. Responsive & accessibility targets

- Minimum width 900 → **760 px**: below 900, sidebar overlays (non-modal drawer) instead of squeezing;
  below 760, bottom panel becomes full-width sheet; activity bar icon-only (already). Update BOTH
  `body min-width` and `BrowserWindow minWidth` together.
- Breakpoints: `≥1280` full · `900–1280` compact status (hide language/cursor) · `760–900` overlay sidebar ·
  `<760` unsupported-with-graceful-message (keep minWidth 760).
- Type floor: 10 px eyebrows only; interactive text ≥ 11 px; tertiary text ≥ 4.5:1 (token-guaranteed).
- Contrast: automated token-pair checks (§14) + axe spot-checks per phase; fix disabled-state tokens first.
- Motion: global `@media (prefers-reduced-motion: reduce)` kill-switch for smooth scroll/spinners/transitions
  (keep instant state changes); streaming caret never blinks under reduced-motion (static glyph).
- Focus: keep 2 px ring; add `:focus-visible` to all new interactive components + skip link (“Skip to editor”)
  + landmark audit (banner/nav/main/complementary/contentinfo).
- Tooltips: migrate meaning-bearing `title`s to `Tooltip` (delay 400 ms, Esc-dismiss, focusable content);
  keep `title` as fallback during migration.
- Forced colors: `forced-color-adjust` audit for dots/badges/timeline (use `CanvasText`/`Highlight` mappings).
- HiDPI: SVG-only icons (no glyph-dependence in chrome); test 125%/150%/200% Windows scaling per phase.

---

## 10. Redesign vs preserve

**Preserve (do not touch the mechanics):** dialog queue; workbench tab model; activity registry (trim items,
keep engine); `MarkdownLite` safety model (extend, don’t replace); agent honesty plumbing (approvals,
`executionRunId` observed runs, policy refusals); approval double-gate (dedupe UX only — see Terminal audit
§9); `terminal.service runCommand` path (extend with origin tagging, never replace — agent/git/diagnostics
depend on it); process-manager tree-kill; secret scrubbing; token-integrity test (extend); i18n scaffolding;
native menu structure (add items, keep roles).

**Redesign:** token graph (unify); type scale + fonts; Monaco themes; chat surface + composer; research cards
+ citations; agent console consolidation; terminal (T1 render, T2 pty); title/status bars; activity membership;
settings modal; palette (new); tab idioms (unify); button/input families (kit); tooltips; empty/error/loading
states; light-theme implementation (tokenize, delete overrides).

---

## 11. Phase 12 — decision answers

1. **What makes it look less professional?** Two token systems + hardcoded colors + nine radii; 10–13 px
   everything; stock Monaco/vs-themes as the hero surface; three navigation idioms with no “you are here”;
   form-instead-of-terminal and spinner-instead-of-streaming as the two most-felt interactions. (Audit §14.)
2. **Five biggest-leverage changes:** (a) unify tokens + radii + type scale (one week, transforms every
   screen); (b) Inter + JetBrains Mono + Monaco kryom themes (the product instantly looks intentional);
   (c) terminal T1 xterm render over `runCommand` (ANSI color, selection, scrollback — looks/feels real
   before pty); (d) single navigation model + command palette (the app becomes navigable); (e) chat reading
   size + Enter-to-send + streaming-ready states (the daily surface feels premium).
3. **Font combination:** Inter Variable (UI) + JetBrains Mono (code), bundled OFL via Fontsource, Cascadia/
   system fallbacks. Rationale in §2.1.
4. **Final themes:** graphite stepped dark (`#0E0F13`→`#1E1F29`) + white-editor light (`#F2F2F5` chrome /
   `#FFFFFF` canvas), one violet accent + one AI blue, AA-declared pairs, generated Monaco themes. §3.
5. **Chat/Research/Agent:** chat = 14 px reading + queued composer + streaming seam + message actions (§4);
   research = evidence card species + citation chains + plan-first + loud handoffs (§5); agent = one run
   console with sticky header + pinned approvals + filterable timeline + detail drawer + per-hunk diff
   review (§6).
6. **Terminal → real Windows terminal:** verdict A today; path = fix cancel scope → xterm render layer (T1)
   → node-pty persistent shells (T2) with profile allowlist, cwd validation, origin separation from agent
   execution. Full analysis in the Terminal audit.
7. **Main editor layout:** §8 wireframe — 40 px title (palette entry), 48 px activity (8 items), 260 px
   sidebar, split editor with kryom-dark Monaco, agent/intel console stage, 280 px bottom panel, 24 px
   status with agent/shell pills.
8. **Shared components:** 15-item `ui/` kit (§7) — Button, Icon, Tabs, Composer, CodeBlock, DiffView,
   Markdown, states, SearchInput, Segmented, Badge/Chip/StatusDot, Tooltip, Menu, Drawer, VirtualList.
9. **Redesign vs preserve:** §10 — preserve honesty/safety/state mechanics; redesign surface/system/navigation.
10. **Technical risks:** Audit §15 — streaming is a vertical slice; node-pty is the only native risk;
    light-theme fragility until tokenized; cancel-scope touches shared infra; font flash; Monaco theme sync;
    no runtime verification yet in this audit.
11. **Premium without replacing the stack:** yes — Electron/React/TS/Vite/Monaco are exactly what VS Code-class
    apps use (VS Code = Electron + Monaco). Every proposal here is React+CSS+Monaco config plus two font
    packages and (late, terminal-only) xterm/node-pty. No framework churn.
12. **Solo-dev hackathon sequence:** §12 below — Phase 0 safety/harness (0.5d) → tokens+type+fonts+Monaco
    (2d) → chat surface (1.5d) → nav+palette (1.5d) → terminal T1 (2d) → research cards (1d) → agent console
    v1 (2d) → light/a11y hardening (1d) → T2 pty only if green (3d+). Ship after every phase.

---

## 12. Implementation roadmap

Total ≈ 12–14 solo-dev days to premium-surface; T2 pty +3–5 days optional. Each phase: scope → files →
done-when. Stop/ship allowed after any phase.

| Phase | Days | Scope | Key files | Done when |
|-------|------|-------|-----------|-----------|
| 0 — Harness & safety | 0.5 | Extend token tests (no-hex, no-`--kryom-`, contrast); full suite baseline green; delete dead Theme row; document visual checklist | `theme-tokens.test.ts`, `SettingsModal.tsx:238-248`, suites | `npm test` + `test:renderer` green; light/dark screenshot pair archived |
| 1 — Tokens & scale | 1.5 | `tokens.css`; `--kryom-*` codemod; radius scale; type scale; `::selection`; hover wash; disabled tokens; delete overrides | `styles/*`, all components (mechanical) | Token tests green; no visual regression except intended tightening |
| 2 — Fonts & Monaco | 1 | Fontsource Inter+JB Mono; fallbacks; Monaco `kryom-dark/light` generated themes; `fontFamily` wiring; offline/font-flash test | `main.tsx`, `monaco-setup.ts`, `EditorPanel.tsx`, `theme.ts` | Editor + code + terminal share one mono; no FOUT on cold start |
| 3 — Chat surface | 1.5 | 14 px reading; Enter-to-send + queue; counters; message actions; code-block upgrades; Markdown tables/autolink/tasks; sessions export | `AiChat.tsx`, `ChatSessions.tsx`, `MarkdownLite.tsx` + tests, chat CSS | Chat checklist (send/stop/retry/attach/handoff/export) passes dark+light |
| 4 — Navigation | 1.5 | Title-bar cleanup; activity trim (13→8) + overflow; “you are here”; palette v1 (commands) + fuzzy extract; status pills | `App.tsx`, `Chrome.tsx`, `ActivityBar.tsx`, registry, new `CommandPalette.tsx` | Keyboard-only full traversal; palette runs 100% of menu commands |
| 5 — Terminal T1 | 2 | xterm render layer over `runCommand` (ANSI, scrollback, selection, links); cancel-scope fix (`origin` tagging); cwd+shell+exit display; remove `'npm run build'` prefill | `TerminalPanel.tsx`, `terminal.service.cjs`, `process-manager.cjs`, tests | 20-item terminal checklist incl. ANSI/long-output/exit/cancel-isolation |
| 6 — Research cards | 1 | Card species + citations + confidence; progress determinism; export surfacing; handoff prominence | `ResearchPanel.tsx` + tests, research CSS | Claim→source→quote chain click-tested; export round-trip |
| 7 — Agent console v1 | 2 | Extract `agent/` components; sticky header; pinned approvals; timeline filters + drawer; diff headers + collapse; check ANSI + copy | `AgentWorkspace.tsx`, `AgentPanel.tsx`, `agent/*`, `diff.ts`, CSS | Approve→verify→repair journey passes with real backend |
| 8 — Light + a11y | 1 | Tokenize stragglers; contrast tooling green; reduced-motion kill-switch; Tooltip pass 1; 760 px floor; forced-colors audit | `styles/*`, components, `main.cjs` minWidth | axe clean on 5 key views; 760/900/1440 + 150% scaling checked |
| S1 — AI streaming | 3+ | Provider SSE → `ai:stream` IPC → `useStreamText` → Markdown progressive render (throttled live region) | AI services, `ai.ipc`, `kryom.ts`/d.ts, `AiChat.tsx` | Streams with cancel-safe generation guards; no fake tokens |
| T2 — node-pty | 3–5 | Persistent shells (PowerShell/CMD), tabs, profiles, resize, Ctrl+C, history, restart (see Terminal audit §10) | NEW `pty.service.cjs`, `pty.ipc.cjs`, `PtyTerminal.tsx` | Full 20-feature checklist; agent path untouched; packaged build green |

Hackathon cut line: ship Phases 0–5 + 8 for maximum visible premium per day; 6–7 if agent/research demos
matter; S1/T2 only with slack (both are slices, not polish).

---

## 13. Acceptance criteria

Per-phase gates (all must hold before the next phase starts):

1. Suites green: `npm test` (node:test services) + `npm run test:renderer` (vitest) + `check:syntax` +
   `check:workbench` + `check:test-manifest`.
2. Token tests green, including the new no-hex / no-`--kryom-` / contrast checks.
3. Dark + light screenshot pair for every touched view, archived with the phase (visual diff by eye).
4. Keyboard-only traversal of every touched flow; new shortcuts documented in `ShortcutsDialog`.
5. No new hardcoded colors, font stacks, radii, or unicode-chrome-glyphs outside the kit.
6. No fake states: every spinner resolves from a backend record; every checkmark cites an observed run;
   every refusal renders as a refusal.
7. Performance smoke: 50-message chat, 200-event timeline, 100 KB terminal output, 3,000-file QuickOpen —
   no jank on the dev machine (note numbers; no formal perf harness required for v1).
8. Docs updated: this blueprint’s phase row checked + new shortcuts/settings recorded.

---

## 14. Regression strategy

- **Before Phase 1:** run and record the full baseline (`npm test`, `test:renderer`, all `check:*` scripts)
  on the implementer’s machine — this audit could not execute them (no shell).
- **Per phase:** baseline suites + new/updated tests for every touched component (renderer) and every
  touched service contract (main); theme-token tests extended, never weakened.
- **Visual:** screenshot pairs per touched view per phase (dark/light × 1440/900/760 widths); keep a
  `docs/VISUAL_BASELINE/` folder (git-ignored image pairs + checked-in checklist).
- **Journeys (manual, every phase):** open project → edit → save → terminal run → chat ask → research brief
  → agent plan → approve → verify → export; destructive command double-gate; offline chat; cancel-everything;
  restart restores tabs/sessions/panels.
- **Kill criteria (stop and roll back the phase):** any suite red > 2 h; light mode unreadable anywhere;
  approval gate bypassed or double-fired; agent verification unlinked from observed runs; cancel kills
  foreign-origin processes; packaged (`pack`/`dist`) build fails.
- **Post-hackathon:** add Playwright smoke (palette, chat send, terminal run, agent approve) and axe CI —
  explicitly out of hackathon scope, tracked here so it isn’t lost.
