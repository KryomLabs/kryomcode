# KryomCode — Phase 0 + Phase 1 Implementation Report

Phases: 0 (Engineering safety & cancellation isolation) + 1 (Unified design system & typography).
Authority: [UI/UX Audit](UI_UX_AUDIT.md), [Redesign Blueprint](UI_UX_REDESIGN_BLUEPRINT.md),
[Terminal Audit](TERMINAL_UX_AND_ARCHITECTURE_AUDIT.md) — all three read in full before implementation.
No commit or push was performed. No user changes were discarded (see §1).

Contents: [1](#1-initial-git-status-and-commit) git · [2](#2-baseline-verification-results) baseline ·
[3](#3-cancellation-issue-and-root-cause) root cause · [4](#4-files-changed) files · [5](#5-new-tests) tests ·
[6](#6-cancellation-isolation-design) design · [7](#7-design-token-architecture) tokens · [8](#8-dark-theme-hex-values)
dark · [9](#9-light-theme-hex-values) light · [10](#10-typography-configuration) type ·
[11](#11-monaco-integration) monaco · [12](#12-dependencies-added) deps · [13](#13-screenshots) screenshots ·
[14](#14-final-verification-results) verification · [15](#15-known-limitations) limits · [16](#16-remaining-work-for-phase-2)
phase 2.

---

## 1. Initial Git status and commit

- Branch: `main` (`.git/HEAD` → `refs/heads/main`).
- HEAD: `c0c5f4a2d9203a7cf1d9068ba86b8fba2b7a2c3a` — `fix(ci): set macOS Node heap via step env instead of GITHUB_ENV`.
- `ORIG_HEAD`: `ddff6c0953a473396ecae618981e8c8b35a39641` (informational; prior reset/merge pointer).
- No merge in progress (`.git/MERGE_HEAD` absent).
- The three audit documents (`docs/UI_UX_AUDIT.md`, `docs/UI_UX_REDESIGN_BLUEPRINT.md`,
  `docs/TERMINAL_UX_AND_ARCHITECTURE_AUDIT.md`) were created by the prior audit session and are
  presumed untracked; they were not modified by this implementation except for the status note
  appended to the Blueprint (see §4).
- LIMITATION (environment): the shell was unavailable for the entire session
  (`windows_elevated setup_required` — the `powershell` tool failed on every call, including `git
  status`). Modified / staged / untracked state therefore could not be enumerated. Preservation was
  enforced structurally instead: every edit used exact-match single-line anchors (any unexpected
  content fails the edit instead of overwriting), no reset/clean/checkout was possible or attempted,
  and the change set below is the complete list of files touched.

## 2. Baseline verification results

No baseline command could be executed — same environment failure as §1. The following were
identified from `package.json` (read, not run) as the required gates; the implementer MUST run them
in this order on a working machine before and after merging this work:

| # | Command | Purpose |
|---|---------|---------|
| 1 | `npm test` | Backend `node:test` suites (~70 files, incl. terminal/agent/diagnostics/git/IPC) |
| 2 | `npm run test:renderer` | Vitest renderer suites |
| 3 | `npm run check:syntax` | `node --check` over every `electron/**/*.cjs` |
| 4 | `npm run check:test-manifest` | Every `*.test.cjs` listed in the `test` script (no new backend test files were added, so this is unaffected) |
| 5 | `npm run check:workbench` | Workbench state-machine checks (untouched area) |
| 6 | `npm run build` | TypeScript + Vite production build |
| 7 | `npm run pack` | electron-builder packaging smoke (validates Fontsource + Monaco worker bundling) |

Recorded results: passed 0 / failed 0 / skipped 7 — all blocked on the environment, none attempted.
There are no "pre-existing failures" to report because nothing ran; any failure observed on first
execution must be bisected against `c0c5f4a`, not assumed to be caused by this change set.

## 3. Cancellation issue and root cause

VERIFIED — with one correction to the audit.

**What the audit claimed:** `terminal:cancel` kills unrelated Agent, Git, and diagnostics processes
through the shared `process-manager` registry.

**What the code actually showed:**

1. The shared registry (`electron/services/terminal/process-manager.cjs`, global `active` Map) is
   used by exactly two producers: the user terminal form (`terminal:run`) and diagnostics runs
   (`diagnostics:run`, which also serves AgentPanel verification and autonomous-run checks).
2. **Git was never shared.** `git.service.cjs` imports only `buildChildEnv` + tree-kill helpers, keeps
   a private `activeChildren` set, and cancels through its own `git:cancel` channel. The audit's
   git claim was inaccurate; git isolation is structural and was left untouched (plus a regression
   test now pins it).
3. The defect was **bidirectional and self-documented**: `terminal:cancel` → `killAllProcesses()`
   was invoked by THREE Stop buttons — `TerminalPanel.tsx:186`, `ProblemsPanel.tsx:124`, and
   `AgentPanel.tsx:865` — with comments stating "Stop uses the same kill-all cancel as the terminal
   panel." Any Stop killed every in-flight run of the other two surfaces, and `terminal:status`
   listed foreign runs in the user's "Running:" line.

**Root cause:** no ownership metadata on registry entries + a single global kill path with no scope
parameter, reached from three unrelated UI surfaces.

**Fix:** origin tagging at registration (`user-terminal` | `diagnostics` | `agent`, server-assigned,
renderer never supplies), per-origin kill, and three cancel channels (see §6). Only verified problems
were fixed; the git path was not modified.

## 4. Files changed

No files were renamed or deleted. Line-ending note: edited regions use LF per `.editorconfig`;
pre-existing CRLF lines were left untouched (see §15).

**Phase 0 — cancellation isolation (implementation):**

- `electron/services/terminal/process-manager.cjs` — origins, `normalizeOrigin`,
  `killProcessesByOrigin`, filtered `listProcesses`; `killAllProcesses` reserved for shutdown.
- `electron/services/terminal/terminal.service.cjs` — `origin` option threading; scoped
  `cancelRunningProcesses(origin = 'user-terminal')` (same `{ killed }` shape); filtered status.
- `electron/services/diagnostics/diagnostics.service.cjs` — `origin` option (default
  `diagnostics`); new `cancelDiagnostics()` export.
- `electron/ipc/terminal.ipc.cjs` — run/cancel pinned to `user-terminal`.
- `electron/ipc/diagnostics.ipc.cjs` — `source` allowlist (`diagnostics` | `agent`, reject
  otherwise); new `diagnostics:cancel` channel.
- `electron/ipc/agent.ipc.cjs` — new `agent:cancel-verification` channel.
- `electron/services/agent/autonomous-run.cjs` — both verification sites tagged `origin: 'agent'`.
- `electron/preload.cjs` — `cancelDiagnostics`, `cancelAgentVerification` bridge methods.
- `src/electron.d.ts` — `KryomRunningProcess.origin`, `runDiagnostics` `source?`, two new cancel
  signatures.
- `src/components/TerminalPanel.tsx` — Running line filtered to `user-terminal`; prefilled
  `'npm run build'` value removed (empty input + placeholder).
- `src/components/ProblemsPanel.tsx` — Stop uses `cancelDiagnostics()`; stale kill-all comment
  corrected.
- `src/components/AgentPanel.tsx` — verification tagged `source: 'agent'`; Stop uses
  `cancelAgentVerification()`; stale comment corrected.
- `src/components/SettingsModal.tsx` — dead hidden Theme row (with stale "not implemented" label)
  removed; nothing else changed.
- `electron/wiring.test.cjs` — export lists extended (`killProcessesByOrigin`,
  `normalizeOrigin`, `PROCESS_ORIGINS`, `cancelDiagnostics`).

**Phase 0 — cancellation isolation (tests):**

- `electron/services/terminal/process-manager.test.cjs` — new `process-origin-isolation` suite
  (7 tests).
- `electron/services/terminal/terminal.service.test.cjs` — new `terminal origin-scoped
  cancellation` suite (6 tests).
- `electron/services/diagnostics/diagnostics.service.test.cjs` — in-flight-cancel test rewritten
  to the scoped contract + cross-origin survival assertions.
- `electron/ipc/ipc.integration.test.cjs` — channel registry extended (2 channels); new
  cross-scope journey test.
- `src/components/TerminalPanel.test.tsx` — NEW: empty-input + Running-line scoping (3 tests).

**Phase 1 — design system, typography, Monaco:**

- `src/styles/tokens.css` — NEW: unified token authority (dark values, aliases, refinement layer).
- `src/styles/theme.css` — rewritten: Professional Light values, TODO/backfill + legacy Meta block
  removed, component styles byte-preserved.
- `src/main.tsx` — Fontsource imports + `tokens.css` first.
- `package.json` — 2 Fontsource dependencies (see §12).
- `index.html` — `theme-color` → `#0e0f13`.
- `src/utils/theme.ts` — `monacoTheme` → `kryom-dark`/`kryom-light`; meta colors match palette;
  new `MONACO_FONT_FAMILY`.
- `src/utils/monaco-themes.ts` — NEW: `KRYOM_DARK`/`KRYOM_LIGHT` theme data + registration.
- `src/utils/monaco-setup.ts` — registers both themes before any editor mounts.
- `src/components/EditorPanel.tsx` — themed via `monacoTheme()`, JetBrains Mono stack, ligatures.
- `src/styles/theme-tokens.test.ts` — rewritten harness: tokens.css coverage, alias quarantine,
  semantic-token presence, WCAG contrast floors.
- `src/utils/theme.test.ts` — updated mapping/meta expectations + font-stack test.
- `src/utils/monaco-themes.test.ts` — NEW: theme data validity + token correspondence (9 tests).

**Documentation:**

- `docs/PHASE_0_1_IMPLEMENTATION_REPORT.md` — NEW (this file).
- `docs/UI_UX_REDESIGN_BLUEPRINT.md` — status note appended (roadmap Phases 0–1 implemented).

## 5. New tests

| Suite | Tests | What they prove |
|-------|-------|-----------------|
| `process-manager` origin isolation | 7 | Origin tagging/defaults, list filtering, scoped kill, zero-kill scopes, failed-kill retention, unregistered-cancel no-op, git-registry independence |
| `terminal.service` scoped cancellation | 6 | Cancel A while B runs (both directions), unaffected completion, diagnostics/agent matrix, unknown-origin normalization, empty-scope zeros, post-failure cleanup |
| `diagnostics.service` scoped cancel (rewritten) | 1 | Diagnostics cancel resolves `cancelled` + terminal run survives + own-scope cleanup |
| `ipc.integration` journey (new) | 1 | End-to-end cross-scope isolation over real IPC + `{killed: 0}` agent channel |
| `TerminalPanel` renderer (new file) | 3 | Empty input + placeholder, Running-line filtering, hidden line for foreign runs |
| `theme-tokens` harness (rewritten) | 9 | Brace balance (5 files), kc/kryom coverage, light completeness, alias coverage, kryom quarantine, semantic presence, dark + light contrast floors |
| `monaco-themes` (new file) | 9 | Base/inherit, hex validity, required keys, rule validity, CSS correspondence, alignment, registration calls |
| `theme.test` (extended) | 1 new | JetBrains-first fallback stack |

Updated-but-not-weakened: `wiring.test` (new exports asserted), `ipc.integration` channel registry
(exact-size assertion extended), diagnostics cancel test (same outcomes, scoped mechanism).

## 6. Cancellation isolation design

```
register: runCommand(cmd, { origin }) ──► registry entry { child, command, startedAt, origin }
                                              │ origin ∈ user-terminal | diagnostics | agent
                                              │ default user-terminal (historical behavior)
cancel:   terminal:cancel ──────────► killProcessesByOrigin('user-terminal')
          diagnostics:cancel ───────► killProcessesByOrigin('diagnostics')   [NEW]
          agent:cancel-verification ► killProcessesByOrigin('agent')         [NEW]
          shutdown (before-quit) ───► killAllProcesses()                    [unchanged]
status:   terminal:status ──────────► all entries WITH origin; renderer shows own scope
```

Guarantees: origins are assigned by main-process callers only (the renderer's `diagnostics:run`
`source` is allowlisted to two values and rejected otherwise — never coerced); unknown origins
normalize to the default scope instead of throwing; failed kills stay registered for retry under
the same scope; unregister-on-close prevents stale references; the `{ killed }` IPC shape is
unchanged on every channel; `killAllProcesses` is now shutdown-only. Autonomous runs keep their
per-run AbortController path (precise) and treat externally cancelled checks as first-class
`cancelled` outcomes (already-handled code path, now reachable only from agent-owned UI).

Isolation matrix (§3.3 reqs 3–6): terminal↔diagnostics↔agent pairwise covered by service tests +
IPC journey; git covered structurally (separate registry/channel) + pinned by the independence
test. Races (req 8): exit/cancel/timeout precedence logic untouched; scoped kill only narrows the
victim set. Cleanup (req 7/9): close-handler unregister + empty-registry assertions in every new
test.

## 7. Design token architecture

`src/styles/tokens.css` (imported first) is the single authority:

- **Globals** (`html:root`, beats legacy `:root`): `--kc-font-ui/mono`, type scale
  (`text-10…20`, `mono-11…13`, tracking), radius scale (s/m/l/xl/pill), spacing
  (xs…2xl), elevation, z-index, motion.
- **Premium Dark** (`html .ide`, beats legacy `.ide`): full 62-token semantic graph — surfaces
  (bg/sidebar/editor/panel/alt/deep/raised/input/well/strip/tint), text (4 steps + on-accent),
  borders (4), accents (violet family + AI blue + link + info set), status (ok/warn/danger/error
  + bg/border/soft companions), controls (btn/focus/selection/hover/scroll), disabled set.
- **Legacy alias shim**: all 18 `--kryom-*` names re-declared as `var(--kc-*)` aliases —
  theme-adaptive automatically, drift-impossible, consumption quarantined by test.
- **Refinement layer**: token-driven application (type scale, mono unification, color-leak
  repairs, radius mapping, elevated surfaces, focus/selection/disabled, tabular numerals,
  reduced-motion kill-switch) at higher specificity than legacy rules.

`src/styles/theme.css` (imported last) carries the Professional Light values for the same 62
tokens plus frozen component styles. `app.css` / `meta-ai.css` / `hero.css` are frozen legacy:
their value blocks are superseded but untouched, so the visual delta is reviewable in two files
and fully reversible. Layout constants (`activity-width`, `titlebar-height`, `statusbar-height`)
stay in `app.css`, exempted from theming by test.

Deliberate deviation from the Blueprint: the CSS import order was NOT reshuffled (tokens prepended
only) because every override wins by specificity — order-independent and lower-risk.

## 8. Dark theme HEX values

KryomCode Premium Dark (`tokens.css`, `html .ide`):

| Group | Tokens |
|-------|--------|
| Surfaces | bg `#0E0F13` · sidebar `#14151B` · editor `#101116` · panel `#17181F` · panel-alt `#14151B` · panel-deep `#121319` · raised `#1E1F29` · input `#121318` · well `#0E0F13` · strip `#1B1C26` · tint `#232139` / border `#3B3860` |
| Text | `#E7E7EC` · dim `#B9B9C6` · faint `#8E8E9B` · faint-soft `#8E8E9B` · ghost `#6B6B78` · on-accent `#FFFFFF` |
| Borders | `#26272F` · soft `#1F2027` · strong `#34353F` · input/btn `#3B3B46` |
| Accent | `#8B7CFF` · dim `#6556C8` · soft `#C4B5FD` · btn `#6556C8` (deepened for white-text contrast) · AI `#2E9BFF` / deep `#1E7FE0` · link `#7AA8FF` · info `#7AA8FF` bg `#16283F` border `#24466E` |
| Status | ok `#7EE2A8` soft `#A9EFC5` bg `#1D3A2A` border `#2E5C3F` · warn `#E8C874` bright `#FBBF24` bg `#3D3220` border `#66592C` · danger `#FF8F9A` soft `#F1AEB5` bg `#3D2226` border `#6B2C36` btn `#B2424E` hover `#C2525F` · error `#FF7A93` · risk `#FF7A93` |
| Controls | btn `#24242C` hover `#33333E` · focus `#8B7CFF` · selection `rgba(139,124,255,.28)` · hover `rgba(255,255,255,.05)` · scroll `#3E3F4A` · quote `#55555F` · disabled fg `#6B6B78` bg `#1A1B21` border `#26272F` |

## 9. Light theme HEX values

KryomCode Professional Light (`theme.css`, `html[data-theme='light'] .ide`):

| Group | Tokens |
|-------|--------|
| Surfaces | bg `#F2F2F5` · sidebar `#ECECF0` · editor `#FFFFFF` · panel `#FFFFFF` · panel-alt `#ECECF0` · panel-deep `#FFFFFF` · raised `#FFFFFF` · input `#FFFFFF` · well `#F1F1F4` · strip `#E9E9EF` · tint `#EFEDFD` border `#D3CDF7` |
| Text | `#191A20` · dim `#4E4E59` · faint `#6E6E78` · faint-soft `#6E6E78` · ghost `#A6A6B0` · on-accent `#FFFFFF` |
| Borders | `#D9D9E0` · soft `#E6E6EB` · strong `#C4C4CD` · input `#C9C9D1` · btn `#D0D0D7` |
| Accent | `#5F4FD6` · dim `#6556C8` · soft `#4A3FA8` · btn `#5F4FD6` · AI/link/info `#0B5FFF` · AI-deep `#004FC4` · info bg `#E8F0FE` border `#BFD6FA` |
| Status | ok `#1A7F4B` soft `#146C3E` bg `#E2F4E9` border `#BFE3CB` · warn `#8F6200` bright `#A86A00` bg `#FAF0D7` border `#E6D18A` · danger `#D92D20` soft `#B42318` bg `#FDE8E8` border `#F0B6BC` btn `#D92D20` hover `#B42318` · error/risk `#D92D20` |
| Controls | btn `#F0F0F3` hover `#E4E4E9` · focus `#5F4FD6` · selection `rgba(95,79,214,.22)` · hover `rgba(20,20,40,.05)` · scroll `#C2C2CA` · quote `#B9B9C4` · disabled fg `#A6A6B0` bg `#F0F0F3` border `#D9D9E0` |

Theme selection behavior unchanged (`kryom.theme` localStorage, OS preference on first run only);
existing preferences preserved — no stored keys added, removed, or migrated.

## 10. Typography configuration

- UI: **Inter Variable** (`@fontsource-variable/inter`), stack
  `'Inter Variable', system-ui, -apple-system, 'Segoe UI', sans-serif`.
- Mono: **JetBrains Mono Variable** (`@fontsource-variable/jetbrains-mono`), stack
  `'JetBrains Mono', 'Cascadia Code', Consolas, monospace` (mirrored in `MONACO_FONT_FAMILY`).
- Both OFL-1.1, bundled locally via Fontsource (offline, no runtime CDN), `font-display: swap`
  built into the packages. Activation requires `npm install` (new dependencies, see §12).
- Scale (task table mapped): UI default 13px (unchanged base) · reading (chat/research/agent
  prose) 12→**14px** · section titles 16–20px · metadata 10–12px · buttons 12px · inputs 13px ·
  editor 14px (user-adjustable 10–24, preserved) · terminal 12→**13px** · code blocks 11→**12px**.
- One code voice: every `Consolas`-hardcoded site (terminal, diffs, diagnostics, output log,
  shortcuts, agent checks, code blocks) now resolves through `--kc-font-mono`.
- No other element was enlarged; density preserved, hierarchy added.

## 11. Monaco integration

- New `src/utils/monaco-themes.ts`: `KRYOM_DARK` (base `vs-dark`) and `KRYOM_LIGHT` (base `vs`)
  theme data derived from the §8–§9 tokens (editor bg/fg, gutter, cursor accent, selection wash,
  line highlight, widget, find matches, diff washes, whitespace/indent guides) + 6 token rules
  each (comment/keyword/string/number/type/function), dark↔light aligned.
- Registered once in `monaco-setup.ts` before any editor mounts; `EditorPanel` consumes
  `monacoTheme()` (`kryom-dark`/`kryom-light`) + `MONACO_FONT_FAMILY` + ligatures. Language
  support, workers, markers, and font-size mechanics untouched.
- Typing is structural-minimal (`MonacoThemeHost`) so the module compiles against any Monaco
  version; the data shape is also assignable to `IStandaloneThemeData` under strict variance.
- Existing `vs`/`vs-dark` mapping and its test were updated (not deleted).

## 12. Dependencies added

| Package | Version | License | Why |
|---------|---------|---------|-----|
| `@fontsource-variable/inter` | `^5.3.0` | OFL-1.1 | Bundled offline Inter Variable (verified on npm registry: 5.3.0, index.css, full weight range) |
| `@fontsource-variable/jetbrains-mono` | `^5.3.0` | OFL-1.1 | Bundled offline JetBrains Mono Variable (verified: 5.3.0, OFL-1.1) |

Justification: the task mandates local bundled fonts with no runtime network dependency; variable
cuts carry every weight in two files (minimal bundle delta, no duplication); pure CSS+woff2, no
native code, no Electron rebuild, builder-safe (`dist/**` already packaged). No other dependencies
added; explicitly NOT added: xterm.js, node-pty (future milestone), icon/component libraries.

## 13. Screenshots

None — no GUI access in this environment (no shell to launch the app, no browser tooling).
Before/after screenshots MUST be captured on the implementer's machine per the Blueprint visual
checklist (dark/light × 1440/900 widths × chat/research/agent/terminal/settings) before sign-off.
No visual claim in this report is asserted as seen.

## 14. Final verification results

Same environment limitation as §2: **no suite, build, or check could be executed here.** The
verification actually performed was exhaustive static review:

- Every edited hunk re-read after application (backend cancellation paths, IPC handlers, renderer
  call sites, theme utilities, editor wiring, both stylesheets in full, all new tests).
- Contract cross-checks: `{ killed }` shapes preserved on all cancel paths; wiring + IPC channel
  registries extended consistently; `KryomRunningProcess` only consumed (never constructed) in the
  renderer; existing tests' reliance on default origins traced individually (only the documented
  diagnostics-test contract change required an update).
- New-token coverage traced by hand against the rewritten harness rules (all consumed names defined
  in both themes; legacy consumption quarantined; contrast pairs computed against floors with
  margin — see the harness comments).

To complete verification, run §2 commands 1–7 on a working machine, then the journey checklist:
open project → edit → save → terminal run → terminal Cancel with diagnostics running → Problems
Stop with terminal running → agent verification Stop → chat ask → research brief → agent plan →
approve → verify → export → destructive-command double-gate → theme toggle (persisted) → restart
restores tabs/sessions/panels/fonts. Do NOT merge on review alone.

## 15. Known limitations

1. **Nothing executed.** All tests are written but unrun; treat the suites as red until observed
   green (see §14 for the exact runbook).
2. **Font binaries need `npm install`.** Until installed, the stacks fall back to system fonts
   (verified by code path: Fontsource import → CSS `@font-face`; missing package = build-time
   resolution error, loud, fixed by installing). `npm run pack` must be re-verified for font asset
   inclusion.
3. **Mixed line endings.** Edited/new lines are LF (`.editorconfig`); pre-existing CRLF lines were
   preserved for minimal diffs. Recommend a repo-wide EOL normalization + `.gitattributes` as a
   separate commit (explicitly NOT done here to keep this change set reviewable).
4. **Refinement-layer strategy.** Phase 1 visual deltas ride higher-specificity token-driven
   overrides rather than rewritten base rules (chosen because base-rule surgery is unverifiable
   without GUI). Consolidation into base rules + legacy-block deletion belongs to a later milestone
   with visual baseline tooling.
5. **No visual verification** (§13) and no live cancellation testing beyond code paths; the
   two-tenant live test in the harness gate must be run manually once.
6. **Contrast floors** assert computed ratios with margin but are not a substitute for axe/Lighthouse
   sign-off on the five key views (tracked for the hardening phase).

## 16. Remaining work for Phase 2

Per the STOP condition, none of the following was started: main IDE layout / navigation redesign,
command palette, Chat/Research/Agent workspace redesigns, xterm.js, node-pty, interactive terminal
architecture. Prepared by this phase and ready to consume: scoped cancel channels (terminal T1
needs them), unified tokens + type scale (every redesign composes on them), Monaco themes (editor
surface), origin-tagged status (terminal tabs later). Recommended next milestone: Blueprint Phase 4
(Navigation + palette v1) then Phase 5 (Terminal T1 xterm render) — highest premium-per-day after
this foundation, with AI streaming (S1) as the first vertical slice once the surface ships.
