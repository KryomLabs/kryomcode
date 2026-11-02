# KryomCode — Terminal UX & Architecture Audit

Status: AUDIT ONLY. No source, dependency, or config modified. `xterm.js` / `node-pty` were NOT installed.
Companion to the [UI/UX Audit](UI_UX_AUDIT.md) and the [Redesign Blueprint](UI_UX_REDESIGN_BLUEPRINT.md)
(roadmap Phases 5/T2 implement this document).

Method: static inspection of the renderer terminal UI, the preload/IPC bridge, the main-process executor,
and every consumer of the shared command path. The app was not launched (no shell in this environment), so
interactive behavior claims rest on code paths, and each is cited. Anything requiring live confirmation is
marked `[VERIFY-LIVE]`.

Contents: [1](#1-verdict) verdict · [2](#2-current-architecture) architecture · [3](#3-component-reference)
components · [4](#4-ux-audit) UX · [5](#5-twenty-feature-gap-table) 20-feature gap · [6](#6-dependency-analysis)
deps · [7](#7-security-audit) security · [8](#8-separation-user-terminal-vs-agent-execution) separation ·
[9](#9-migration-plan) migration · [10](#10-t2-target-architecture) T2 design · [11](#11-acceptance-checklists)
acceptance · [12](#12-risks) risks.

---

## 1. Verdict

**The current terminal is (A) a command execution form — decisively, not borderline.**

| Capability | Required for | Present? |
|-----------|--------------|----------|
| One-shot command → buffered result | A | YES — the entire design |
| Persistent shell process across commands (`cd` sticks, env persists, prompts) | B | NO — every run is a fresh `spawn(..., {shell: true})` with `cwd: workspaceRoot` |
| Interactive pty (stdin streaming, ANSI cursor control, job control, Ctrl+C → SIGINT, readline/history in-shell) | C | NO — no pty, no stdin channel, no resize, no streaming IPC |

Supporting facts: renderer awaits one `runCommand()` promise per entry (`TerminalPanel.tsx:147`); main
buffers stdout+stderr into one string capped at 100 KB (`terminal.service.cjs:87-101`); output renders only
after process close (`TerminalPanel.tsx:343-376`); IPC exposes exactly run/classify/cancel/status
(`terminal.ipc.cjs`, `preload.cjs:62-78`) — no `write`, `resize`, `data`, or session handles; input is
disabled while a command runs (`TerminalPanel.tsx:271`), which is impossible in a real terminal.

As a *command runner* it is good (7/10): validated input, secret-scrubbed env, tree-kill, timeout,
advisory warnings, native destructive gate, exit codes, history, auto-scroll. As a *terminal* it scores
3/10 (Audit D7) and cannot satisfy the brief’s 20-feature target without the T1→T2 migration in §9–§10.

---

## 2. Current architecture

### 2.1 End-to-end flow (one run)

```
Renderer                              Preload                 Main
useTerminalController                 window.kryom            terminal.ipc ──► approval.cjs ──► terminal.service
  │ runTerminalCommand()              │                         │ runCommand(text)
  │  ├─ single-flight guard (ref)    │                         │
  │  ├─ confirmCommandRun() ─────────┼─ terminal:classify ─────┤ classifyCommand (advisory warnings)
  │  │    └─ dialogs.confirm (UX)    │                         │
  │  ├─ history push (≤50, memory)   │                         │
  │  ├─ entries push {id,cmd,null}   ├─ terminal:run ──────────┤ assertNonEmptyString (≤2000)
  │  │                               │                         │ confirmDestructiveCommand (NATIVE dialog, unskippable)
  │  │                               │                         │ spawn(cmd, {cwd: ROOT, shell: true, windowsHide, env: scrubbed})
  │  ├─ 2s status poll ──────────────┼─ terminal:status ───────┤ listRunningProcesses()  (registerProcess metadata)
  │  │                               │                         │ stdout+stderr ─► append() (merge, ≤100KB)
  │  │                               │                         │ 120s timer ─► killProcessTree (taskkill /T /F on win32)
  │  └─ await result ────────────────┘◄── {exitCode,output,    │ close/error ─► resolve (never reject on exit≠0)
  │      entries map id→result            timedOut,cancelled,  │
  │      status line mapping              outputLimited,       │
  │      (completed/failed/               warnings}            │
  │       cancelled)                                          │
  └─ cancel() ───────────────────────┼─ terminal:cancel ───────┤ killAllProcesses()  ⚠ kills EVERYTHING (see §8)
```

### 2.2 Process lifecycle

- Spawn: `spawn(command, {cwd: workspaceRoot, shell: true, windowsHide: true, env: buildChildEnv()})`
  (`terminal.service.cjs:73-79`). POSIX additionally detaches into its own process group (`shouldDetach()`).
- Registry: `process-manager.cjs` `active: Map<proc-N, {child, command≤200 chars, startedAt}>`; kill marks
  via `WeakSet` so `cancelled` reports honestly; detached-group marks guard POSIX signaling.
- Termination: win32 `taskkill /pid <pid> /T /F` (tree, forced) → fallback `child.kill()`; POSIX group
  `SIGTERM` → fallback `child.kill()` (`process-manager.cjs:49-89`).
- Timeout: 120 s default (`TIMEOUT_MS`), per-call overridable via `options.timeoutMs`; timeout wins over
  later cancel marks (`terminal.service.cjs:160-162`).
- Shutdown: `main.cjs:729` calls `killAllActiveProcesses()` — stragglers die with the app. Good.
- Restart-after-close: N/A (no persistent process to restart).

### 2.3 Working directory, encoding, buffering

- CWD is **always** the workspace root (`getWorkspaceRoot()`; throws “Open a project folder first” when
  none). No per-command/per-session cwd, no `cd` persistence (each run re-spawns), no cwd display in UI.
- Encoding: `chunk.toString()` (utf8 default). No explicit code-page handling — PowerShell/CMD output on
  non-UTF8 code pages may mojibake `[VERIFY-LIVE]`; `windowsHide: true` avoids console windows.
- Buffering: fully buffered to 100 KB, then `outputLimited` + “Output truncated.” No streaming, no backpressure
  design, no ANSI parsing (raw escape sequences would render as literal text `[VERIFY-LIVE]`).
- stdout/stderr are **merged** (`child.stdout.on('data', append)` + same for stderr) — the UI cannot
  distinguish error output. Exit code is the only failure signal.

### 2.4 Cancellation and errors

- Renderer Cancel → `terminal:cancel` → `killAllProcesses()` → `{killed: N}`; the in-flight promise resolves
  with `cancelled: true` + “Cancelled by user.” Single-flight ref prevents overlapping *renderer* runs, but
  the main executor itself is concurrent-safe (registry supports many children) — agent/git/diagnostics runs
  proceed alongside.
- Spawn errors (`'error'` event) resolve (not reject) with `exitCode: 1` + appended message — honest.
- Approval declines (native Cancel) reject and the renderer treats them as cancellations, not failures
  (`TerminalPanel.tsx:162-173`) — correct UX.
- Pre-aborted signals and timeout-vs-cancel precedence are handled and commented — careful code.

---

## 3. Component reference

| Layer | File | Responsibility (inspected) |
|-------|------|----------------------------|
| Renderer UI | `src/components/TerminalPanel.tsx` (396 lines) | `useTerminalController` (input/history/single-flight/poll/cancel/clear) + `TerminalPanelView` (form, running list, error, entries, auto-scroll) + unused self-contained `TerminalPanel` |
| Renderer confirm | `src/utils/command-confirm.ts` | `confirmCommandRun`: warnings ∨ confirm-all → `dialogs.confirm`; scan failure fails closed |
| Renderer dialogs | `src/components/dialogs.tsx` | FIFO modal queue; destructive confirm styled `danger` |
| Preload | `electron/preload.cjs:62-78` | `runCommand` / `cancelCommand` / `getTerminalStatus` / `classifyCommand` — method-per-channel, no raw `invoke` |
| IPC | `electron/ipc/terminal.ipc.cjs` (72 lines) | `terminal:run` (trust + validate + native gate + run), `terminal:cancel`, `terminal:status`, `terminal:classify` |
| Native gate | `electron/ipc/approval.cjs` | `confirmDestructiveCommand`: native `showMessageBox` for destructive patterns (documented double-prompt wart) |
| Executor | `electron/services/terminal/terminal.service.cjs` (200 lines) | `runCommand`, env scrub, timeout, buffering, flags; `MAX_COMMAND_LENGTH 2000`, `MAX_OUTPUT_LENGTH 100_000`, `TIMEOUT_MS 120_000` |
| Registry | `electron/services/terminal/process-manager.cjs` | register/unregister/list/kill-all/tree-kill/kill-marks/detached-marks |
| Classifier | `electron/services/terminal/command-validator.cjs` | `DESTRUCTIVE_PATTERNS` (rm-rf, rd /s, del /s/q, format/mkfs, forkbomb, shutdown/… — advisory labels, explicitly “not a safety verdict”) |
| Consumers | `diagnostics.service.cjs:53`, `git.service.cjs`, `autonomous-run.cjs` (via diagnostics + `tool-policy`), `main.cjs:729` | Agent verification, git ops, diagnostics, shutdown cleanup all share `runCommand`/registry |
| Types | `src/electron.d.ts:70-83,1787-1791` | `KryomTerminalResult`, `KryomRunningProcess`, bridge signatures |
| Tests | `terminal.service.test.cjs`, `process-manager.test.cjs` (node:test) | Validation, echo, warnings, cancel, timeout, concurrency — extend for origin scoping |
| Styles | `app.css:629-680,1596-1616` | `.terminal-panel/input/output/log/entry`; 12 px Consolas; link-colored `> command` line |

---

## 4. UX audit (current form, judged as a terminal)

1. **No shell identity.** No profile (PowerShell/CMD), no prompt, no cwd, no shell badge — the `>` glyph and
   “Enter a command…” placeholder are the entire terminal metaphor. Users cannot tell what will interpret
   their command (`shell: true` = cmd.exe on Windows by default `[VERIFY-LIVE]`).
2. **Prefilled value trap.** Input initializes to the literal `'npm run build'` (`TerminalPanel.tsx:42`) —
   it looks like a suggestion but Runs on submit. Must be a placeholder + recent-command affordance instead.
3. **No streaming.** Long builds/tests show “Running…” for up to 120 s with zero output, then a wall of text.
   The #1 felt gap after shell absence.
4. **No stdin.** Anything prompting (publish login, `git commit` editor, `choice`, REPLs, `ssh`) hangs until
   timeout; there is no indication input was requested. Dangerous + confusing.
5. **Single-flight UI, multi-tenant backend.** The form locks during a run while agent/git/diagnostics runs
   continue invisibly; Cancel then kills those too (§8). The UI implies “my one command” but operates “all
   commands”.
6. **No sessions/tabs.** One scrollback, 20 entries max, then silent eviction (`.slice(-20)`). No split, no
   rename, no per-tab cwd/shell.
7. **Merged streams, no ANSI.** Errors aren’t red, links aren’t links, tables misalign if padded with escapes;
   100 KB truncation is a suffix note, not a managed scrollback.
8. **History is amnesiac.** 50 commands, in-memory, Up/Down only, lost on reload, no search (`Ctrl+R`), no
   persistence per shell.
9. **Status is a poll.** “Running: …” line refreshes every 2 s while *renderer* `running` is true; agent/git
   processes appear in the same line with no origin label — confusing and leaky.
10. **Good bones to keep:** exit-code line with timeout/truncated/cancelled qualifiers; warnings with “Review
    before trusting”; approval-decline-as-cancel; auto-scroll + reduced-motion; Clear; aria-labeled input;
    history recall; 2 s poll cleanup on unmount.

---

## 5. Twenty-feature gap table (brief §“Proposed target experience”)

| # | Feature | Today | T1 (xterm render, no pty) | T2 (node-pty) |
|---|---------|-------|---------------------------|---------------|
| 1 | Real interactive PowerShell session | ✗ (`shell:true` one-shots) | ✗ (still one-shots) | ✓ persistent `powershell.exe -NoLogo` |
| 2 | CMD support | △ (whatever `shell:true` picks) | △ explicit label | ✓ profile picker (pwsh/powershell/cmd) |
| 3 | Persistent shell process | ✗ | ✗ | ✓ pty per tab, survives commands |
| 4 | Multiple terminal tabs | ✗ (20-entry list) | △ entry groups labeled as runs (no tabs) | ✓ tabs + rename + close + relaunch |
| 5 | New terminal profile | ✗ | ✗ | ✓ profile defs (shell, args, cwd, icon) |
| 6 | CWD display | ✗ (always root, undisclosed) | ✓ disclose root + per-run cwd | ✓ live prompt-cwd via shell integration (OSC) or `pwd` poll fallback |
| 7 | Real-time stdout/stderr | ✗ (post-close wall) | △ simulated stream (chunked render of buffered output — honest labeling required) | ✓ true `pty.onData` stream, stderr-marked |
| 8 | Interactive keyboard input | ✗ (input locked while running) | ✗ | ✓ xterm → pty write, incl. arrows/tab/completion |
| 9 | Command history | △ 50, memory, Up/Down | △ same + persistent per-profile file | ✓ in-shell (PSReadLine/cmd) + persistence |
| 10 | Ctrl+C / process termination | △ Cancel button (kills ALL) | ✓ scoped cancel (origin-tagged) | ✓ SIGINT to foreground pty + scoped kill + tab kill |
| 11 | Clear terminal | ✓ entries clear | ✓ xterm clear + scrollback | ✓ + `Clear-Host` parity |
| 12 | Restart terminal | N/A (nothing persists) | N/A | ✓ relaunch pty in same tab (new PID, banner) |
| 13 | Split terminal | ✗ | ✗ | Optional — only if xterm layout cost is small; defer past v1 |
| 14 | Resizable bottom panel | ✓ (120–600 px, persisted) | ✓ + xterm `FitAddon` reflow | ✓ + pty `resize(cols,rows)` on panel resize |
| 15 | Font family/size settings | ✗ (12 px Consolas fixed) | ✓ terminal font settings (family+size, JetBrains Mono default) | ✓ same |
| 16 | Selection & copy/paste | △ native `<pre>` selection | ✓ xterm selection + `Ctrl+Shift+C/V` + link-open | ✓ same + bracketed paste |
| 17 | Unicode & ANSI color | ✗ (escapes literal) | ✓ full ANSI render via xterm | ✓ same + true interactive apps |
| 18 | Long-running commands | △ 120 s cap, no output until end | ✓ chunked progress render, cap raised/configurable per run | ✓ no cap for interactive shells; caps stay for `runCommand` path |
| 19 | Accurate exit code & status | ✓ exit code + flags | ✓ + per-run status chips | ✓ + last-exit per tab + shell-death banners |
| 20 | Shell closure & process errors | △ resolve-with-flags | ✓ same, better surfaced | ✓ `onExit` handling, restart offer, orphan reaping |

Rule for T1 honesty: T1 must NEVER fake interactivity — label runs as runs (“ran in 4.2s · exit 0”), never
as a shell session. The xterm surface in T1 is a *renderer*, not a *terminal*; the prompt row stays a form
until T2.

---

## 6. Dependency analysis

### 6.1 Installed today (from `package.json`)

React 19, React-DOM 19, Monaco 0.57 + `@monaco-editor/react` 4.7, Vite 6, Electron 45,
electron-builder 26, TypeScript 5.7, Vitest 3, testing-library, jsdom, docx, mammoth, dotenv, undici.
**No `xterm`, no `node-pty`, no shell/terminal helpers of any kind.** Nothing to remove; everything to add
is additive.

### 6.2 `xterm.js` (+ `@xterm/addon-fit`, `addon-web-links`, `addon-search` optional)

- Pure JavaScript/TypeScript, no native code, no node-gyp, no postinstall. Bundles through Vite like any
  dep. Electron-safe (used by VS Code’s own terminal UI layer conceptually; xterm powers VS Code, Hyper,
  and countless Electron terminals).
- License MIT. Size ~200–400 KB min (core + fit + web-links) — negligible in an Electron app.
- API fit: `Terminal` (cols/rows, font, theme), `FitAddon`, `WebLinksAddon`, `SearchAddon`, `SerializeAddon`
  (scrollback export — nice for run transcripts), `write()/writeln()`, `onData` (T2 input), `onResize`.
- Risk: LOW. Usable in T1 immediately as a renderer for `runCommand` output (with ANSI parsing it already
  does), then as the T2 frontend unchanged. No packaging changes. Recommend pinning `^5.5` (stable 5.x line;
  re-check latest at implementation).

### 6.3 `node-pty` (T2 only)

- Native module (C++, node-gyp, prebuilds). Electron requires a rebuild against Electron’s Node
  (`electron-builder install-app-deps` handles it when configured) and `asarUnpack` for the `.node`
  binaries. ConPTY (modern Windows pseudo-console) is used on Win10+; falls back cleanly.
- License MIT. Maintenance: historically steady (Microsoft-origin, community-maintained); verify latest
  release + Electron 45 compat at implementation — THIS is the scheduling risk, not the API.
- Windows specifics: works with `powershell.exe`, `pwsh`, `cmd.exe`; dwSize/resize supported; Unicode via
  ConPTY; AV false-positive risk is low but nonzero for apps spawning shells (mitigate: signed binaries,
  standard install paths, no obfuscation).
- Alternatives considered and rejected: raw `child_process` pipes to `powershell.exe` (achieves “B” but no
  cursor apps, no job control, broken readline — a dead-end that still costs IPC design); `node-pty` forks
  (smaller community); embedding Windows Terminal (not embeddable as a component).
- Packaging checklist (T2): `electron-builder` npmRebuild on install; `asarUnpack: **/*.node` (extend the
  existing single-entry `asarUnpack`); CI matrix win/mac/linux `dist` smoke; signed-build AV spot check;
  fallback: if pty spawn fails at runtime, degrade to T1 run-form with a banner (never a dead tab).
- Risk: MEDIUM (packaging + version compat), contained by the T1-first sequence and the runtime fallback.

### 6.4 What NOT to add

No shell parser, no custom ANSI parser (xterm does it), no `shell-quote` auto-escaping magic (explicit user
input only), no persistent-shell-via-pipes half-step, no third PTY abstraction. Two deps total for the whole
terminal track: `xterm` family (T1) + `node-pty` (T2).

---

## 7. Security audit (current — must be preserved and extended)

| Control | Status | Location |
|---------|--------|----------|
| Renderer has no Node/fs/shell | ✓ (sandbox + contextIsolation + method bridge) | `main.cjs:472-477`, `preload.cjs:1-7` |
| Trusted-sender checks on all terminal IPC | ✓ | `terminal.ipc.cjs` (every handler) |
| Input validation (non-empty ≤ 2000 chars) | ✓ both layers | `terminal.ipc.cjs:27`, `terminal.service.cjs:38-48` |
| Advisory destructive classification | ✓ (explicitly advisory) | `command-validator.cjs:1-4`, patterns `:6-30+` |
| Renderer confirm (destructive ∨ confirm-all ∨ scan-fail) | ✓ fail-closed | `command-confirm.ts:5-46` |
| Main-process native gate (unskippable) | ✓ | `approval.cjs` via `terminal.ipc.cjs:32-35` |
| Secret scrubbing from child env | ✓ | `terminal.service.cjs:26-36` (`isSecretKey`) |
| Tree-kill (no orphaned grandchildren) | ✓ win32 + POSIX | `process-manager.cjs:49-89` |
| Shutdown reaping | ✓ | `main.cjs:729` |
| No auto-run (every execution user-initiated or approval-gated) | ✓ | terminal form; agent approvals; diagnostics explicit |

Known warts (do not regress, fix in plan): (1) destructive interactive commands prompt twice (renderer +
native — `approval.cjs:9-13`); (2) `terminal:cancel` kills foreign-origin processes (§8 — the live P1);
(3) `windowsHide` + `shell:true` means the effective shell is implicit — T2 makes it explicit and
allowlisted.

---

## 8. Separation: user terminal vs agent execution (REQUIRED reading for T2)

### 8.1 The shared pipe today

`terminal.service.runCommand` + the global `process-manager` registry serve FOUR masters: the user terminal
form, diagnostics checks, git operations, and agent verification (via diagnostics + `executionRunId`
observed-run binding in `plan-store.cjs:1615`). This sharing is load-bearing: agent honesty (“verified” =
exit observed) depends on it.

### 8.2 The live defect

`terminal:cancel` → `cancelRunningProcesses()` → `killAllProcesses()` kills the union of all four masters’
children. A user pressing Cancel during `npm run build` can kill an in-flight agent verification check or
git operation, which then reports `cancelled`/failed for reasons invisible in its own UI. Fix BEFORE any
terminal expansion (roadmap Phase 5 precondition):

1. Tag registry entries with `origin: 'user-terminal' | 'diagnostics' | 'git' | 'agent' | 'system'` at
   `registerProcess` (thread through `runCommand(command, {origin})`; default `'system'` for unknown
   callers — no caller breaks).
2. Scope `terminal:cancel` to `origin === 'user-terminal'`; return `{killed, origins}`; renderer status line
   shows scoped counts.
3. Agent/diagnostics/git cancellation stays on their own paths (AbortSignal already threads through
   `runCommand(options.signal)` — reuse, don’t invent).
4. Status API returns origin labels; the terminal “Running:” line shows user-terminal runs only.
5. Extend `process-manager.test.cjs` + `terminal.service.test.cjs`: cross-origin cancel isolation,
   default-origin back-compat, status filtering.

### 8.3 T2 separation architecture (non-negotiable)

- **Two executors, two IPC namespaces, one registry with origins.**
  `runCommand` (buffered, approval-gated, origin-tagged) KEEPS serving agent/diagnostics/git/user-run-form
  forever. NEW `pty.service` (interactive shells) serves ONLY user-driven terminal tabs via NEW `pty:*` IPC.
- Agent code paths MUST NEVER call `pty:*`. Enforce by code review + an `approval.cjs`-adjacent assertion:
  `pty_spawn` requires `{invokedBy: 'user-terminal'}` and rejects any payload carrying agent/run/plan ids.
- Interactive shells are user agency (VS Code parity): typing in YOUR shell is not approval-gated per
  keystroke — the gate model for pty is *creation-time* (allowlisted profile + validated cwd + explicit New
  Terminal click), not per-command. Destructive-pattern classification still runs on *pasted* multi-line
  blocks as an advisory banner (“this paste contains rm -rf — review”), never a block.
- No auto-run into pty: tabs spawn at a prompt; nothing types for the user except explicit “Run in terminal”
  actions (agent command proposals, task runner) which INSERT text and require Enter (VS Code behavior).
- CWD validation: pty cwd must be the workspace root or a subdirectory (reuse `resolveAgainstRoot` +
  existing traversal guards); “no project” tabs open at the user home with a banner, never at `/`/system32.
- Lifecycle: tab close → SIGHUP/tree-kill + registry removal; window close → kill all pty (extend `main.cjs:729`
  path); restart = new pty, old scrollback optionally kept as transcript.

---

## 9. Migration plan (preserves everything)

### Phase T0 — Preconditions (with Blueprint Phase 0; 0.5 day)

- Baseline suites green; archive dark/light terminal screenshots.
- Land the §8.2 origin-tagging + cancel scoping + tests. (Blocking: nothing below ships without it.)
- Replace the `'npm run build'` prefilled value with placeholder + “recent commands” dropdown (history already
  in-memory; persist to `localStorage` per workspace).

### Phase T1 — xterm render layer over `runCommand` (Blueprint Phase 5; ~2 days)

Goal: look/feel real, stay honest (a beautiful runner, still a runner).

1. Add `xterm` + `@xterm/addon-fit` (+ `addon-web-links`, `addon-search` if cheap). No preload/IPC changes.
2. New `XtermRunView`: each entry renders into an xterm instance (ANSI colors, 5,000-line scrollback,
   selection, link-open, search). Chunked post-close write with progress (“rendering 84 KB…”) for huge outputs.
3. Header row per run: shell label (`cmd.exe` disclosed), cwd (root disclosed), duration, exit chip.
   Stderr gets best-effort red ONLY if separable — it isn’t (merged) — so T1 adds exit-chips + warn/error
   keyword tinting clearly labeled “heuristic”, or nothing. Prefer nothing over fake.
4. Terminal font settings (family fixed to mono stack, size 11–16, default 13) — first terminal settings,
   reused by T2.
5. Running-state honesty: indeterminate progress + elapsed + streamed *status* (“still running… 42s”),
   plus TRUE streaming where free: poll-based “tail mode” is NOT free (buffered backend) — do not fake it.
   Instead show the running command + elapsed + cancel prominently.
6. Keep `<pre>` fallback behind a setting (`terminal.renderer: xterm | plain`) for accessibility/compat.
7. Tests: renderer tests for view states; service tests untouched (no service change); a11y: xterm
   `screenReaderMode` on + live-region announcements for run completion.

### Phase T2 — node-pty persistent shells (Blueprint addendum; 3–5 days)

1. Deps + packaging: `node-pty`, `electron-builder` rebuild config, `asarUnpack: **/*.node`, CI matrix
   smoke, signed-build spot check. Runtime fallback to T1 view if pty spawn fails.
2. Main `pty.service.cjs`: `spawn({profile, cwd, cols, rows}) → {id, pid}`, `write(id, data)`,
   `resize(id, cols, rows)`, `kill(id, signal?)`, `list()`, `onData/onExit` via `webContents.send`
   (batched, 8–16 ms window, backpressure-drop oldest with counter — never unbounded).
3. IPC `pty.ipc.cjs`: `pty:spawn/write/resize/kill/list` with trust + profile-allowlist + cwd validation +
   `invokedBy` assertion (§8.3). Preload additions mirror existing style (no raw invoke).
4. Renderer `PtyTerminal.tsx`: tab strip (new/rename/close/restart), xterm + fit per tab, profile picker
   (PowerShell 5.1 / pwsh 7 if present / CMD), cwd badge (OSC 7 shell integration + fallback), exit banners,
   scrollback persist per tab (serialize addon, capped), settings (font, scrollback lines, bell, paste
   behavior).
5. Ctrl+C → pty SIGINT (foreground process), not tab kill; tab kill via close × (confirm if child processes
   of user origin are alive — reuse tree-alive check); restart relaunches profile in place.
6. Long-lived correctness: window-close reaps pty; crash-recovery offers transcript reopen (scrollback file,
   not process resurrection — never pretend a dead shell is alive).
7. Tests: service tests with a stub pty (spawn/write/resize/kill/exit), IPC trust/validation tests,
   packaging smoke (`pack` then launch + open terminal + `echo` round-trip).

### What stays forever

`runCommand` + `terminal:run` + approval double-gate + origin registry serve agent/diagnostics/git and the
“T1 run” affordance inside T2 terminals (“Run command…” quick action). The run-form is not deleted — it
becomes the deterministic, approval-gated, log-friendly executor next to the free interactive shell. Both
surfaces share the xterm renderer, font settings, and exit-chip language.

---

## 10. T2 target architecture (reference)

```
Renderer (sandboxed)                        Preload              Main
PtyTerminal.tsx ── tabs[] ──► xterm/Tab         window.kryom       pty.ipc ──► pty.service ──► node-pty ──► powershell.exe
  │ onData(key/click/paste) ──► pty:write ──────► │                 │ validate ─► profile allowlist + cwd guard
  │ onResize ──► pty:resize ────────────────────► │                 │ spawn ────► {id,pid} + registry origin:'user-pty'
  │ tabs: spawn/kill/restart/list
  │ webContents 'pty:data' ──► xterm.write (batch)
  │ webContents 'pty:exit' ──► banner + restart offer
  │
  └─► runCommand path UNCHANGED (agent/diagnostics/git/T1-run) ──► terminal.ipc ──► terminal.service
```

Data-plane rules: main→renderer `pty:data` batches (≤64 KB / 16 ms), drops counted + surfaced (“2.1 MB
dropped — output too fast; transcript truncated”); renderer→main `pty:write` capped per keystroke event
(paste chunked, 32 KB chunks, advisory destructive-scan banner on multi-line paste); no `pty:eval`, no
`pty:spawn` with arbitrary `file` (profile id only); cols/rows clamped (20–500 × 5–200).

---

## 11. Acceptance checklists

### T0/T1 (must all pass)

- [ ] `npm test` + `test:renderer` green, including new origin-isolation tests.
- [ ] User Cancel kills ONLY user-terminal runs (live test: start agent check + user sleep-command, cancel
      user → agent check completes).
- [ ] ANSI colors, unicode (box-drawing, emoji widths), 100 KB output, exit≠0, timeout, truncation all render
      correctly dark + light.
- [ ] No `'npm run build'` prefill; placeholder + persisted recent commands.
- [ ] CWD + shell + duration + exit chip on every run; stderr honesty (no fake red).
- [ ] Font size 11–16 applies live; `screenReaderMode` on; keyboard-only operable.
- [ ] 900/1440 px + 150% scaling; reduced-motion respected.

### T2 (must all pass — maps to the 20 features in §5)

- [ ] PowerShell + CMD profiles spawn to a prompt in < 2 s; `cd` persists; env persists; `exit` closes
      cleanly with banner.
- [ ] Tabs: open/rename/close/restart; per-tab cwd badge + last-exit; close-confirm with live children.
- [ ] True streaming (`ping -t` / `npm run dev` tail in real time); stderr visibly distinct.
- [ ] Ctrl+C interrupts foreground (not the tab); long REPL session (`node`, `python`) fully interactive.
- [ ] Resize reflows + resizes pty (no wrapping corruption); panel resize covered.
- [ ] History persists per profile; Up/Down + in-shell search work (PSReadLine default on).
- [ ] Unicode + Nerd-Font-free ligatures; links clickable; selection/copy/paste incl. multiline.
- [ ] Agent approval flow untouched: agent checks still run via `runCommand`, still observed-run verified,
      still approval-gated; `pty:*` rejects agent-origin payloads (negative test).
- [ ] Packaged build (`pack` win) launches, opens terminal, round-trips `echo $PSVersionTable` / `ver`;
      uninstall leaves no orphaned shells (spot-check Task Manager).
- [ ] Kill criteria honored: pty-spawn failure degrades to T1 with banner (simulate by renaming the .node
      binary in a test install).

---

## 12. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|------|---------------------|------------|
| 1 | `node-pty` vs Electron 45 build friction | Med / Med | T1-first (value without pty); rebuild via builder; CI matrix; version pin + compat check at kickoff |
| 2 | AV/signature friction for shell-spawning app | Low / High | Signed builds, standard paths, no packer tricks, user-initiated spawns only |
| 3 | Output-flood perf (renderer IPC saturation) | Med / Med | Batching + drop-counters + scrollback caps; `SerializeAddon` transcripts to disk, not memory |
| 4 | ConPTY quirks (resize artifacts, legacy Win10) | Med / Low | Min supported Windows declared (10 1809+); fallback renderer; resize debounce |
| 5 | Cancel-scope regression (killing agent/git) | Low-after-fix / High | Origin tagging + isolation tests + live two-tenant test in T0 gate |
| 6 | Fake-interactivity temptation in T1 | Process risk | §5 honesty rule + review checklist: “does any pixel imply a live shell?” |
| 7 | Scope creep (splits, quake mode, SSH manager) | High / Med | Explicitly deferred (§5 #13 optional); T2 v1 = tabs + profiles + core |
| 8 | No live verification in this audit | Certain / Low | Every `[VERIFY-LIVE]` item re-checked on implementer hardware before its phase ships |
