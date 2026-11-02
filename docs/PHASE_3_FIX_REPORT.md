# KryomCode — Phase 3 Fix Report (AiChat Escape Flake)

Date: 2026-11-02 (UTC). Branch: `main`, HEAD `c0c5f4a`
(unchanged). No commits, pushes, tags, adds, resets, cleans, or
dependency changes; `.env` never opened. Backend/shared files
untouched, so backend gates were correctly skipped.

## 1. Confirmed root cause

Independently re-verified (not taken on trust from Phase 2C):

- The test (`src/components/AiChat.test.tsx:367-383`,
  byte-identical to HEAD) sends a message, awaits the loading
  text (`findByText(/Contacting Meta AI/)` — resolves at paint),
  dispatches `keydown` Escape on `document`, then asserts
  `bridge.cancelAI` synchronously.
- The window `keydown` listener was attached in a passive
  `useEffect(..., [loading])` (`AiChat.tsx:192-209`), which
  flushes asynchronously after the loading UI commits.
- When the dispatch lands before the flush, no listener exists:
  `stopRequest` (`:536-541`, synchronous `kryom().cancelAI()`)
  never runs → 0 calls → intermittent FAIL (~1 in 8 suite runs
  in Phase 2B; dormant in isolation). Same race class as the
  Phase 2B approval-note wipe, independent instance.

`useLayoutEffect` confirmed as the correct minimal fix: it attaches
synchronously after DOM mutation and before paint, so by the time
`findByText` can resolve, the listener is guaranteed present —
the race window is removed by construction for every caller, not
just the test. SSR check: no `renderToString`/`hydrate`/SSR usage
exists in `src`/`electron`/`scripts` (repo-wide search: 0
matches); this is an Electron-only renderer, so layout effects are
safe. No prior `useLayoutEffect` convention exists in `src/`; the
change introduces it in exactly one justified spot with an
explanatory comment. Alternatives rejected: render-time/ref
subscription (anti-pattern, larger), arming in `sendMessage`
(duplicates lifecycle), test-side flush (leaves the real,
if tiny, UX gap where an Escape between paint and passive-flush
is swallowed).

## 2. Exact implementation changes

One file: `src/components/AiChat.tsx` (already in the tracked
modified set). Net delta +6/−2 lines:

- Line 1: import `useLayoutEffect` alongside existing imports.
- Lines 192–196: the Escape subscription effect changed from
  `useEffect` to `useLayoutEffect`, plus a 4-line comment stating
  why (attach-before-paint; Electron-only, no SSR).
- Nothing else touched: handler body, `addEventListener` /
  `removeEventListener` pair, `[loading]` deps, and the
  exhaustive-deps comment are byte-identical. The composer
  Ctrl/Cmd+Enter shortcut is a React `onKeyDown` prop and is
  unaffected. No test file was modified: no weakened assertions,
  no delays, no suppression.

(Craft note: the file uses CRLF line endings, which the file-edit
tool could not match across lines; the effect hunk was applied by
a byte-exact single-match scripted replacement and verified in
`git diff`. Endings and surrounding bytes are unchanged.)

## 3. Listener lifecycle and cleanup behavior

- `loading === false`: effect early-returns; any previously
  attached listener was already removed by the dep-change cleanup.
- `loading` false→true: `onKey` attached synchronously pre-paint
  via `window.addEventListener('keydown', onKey)`.
- `loading` true→false or unmount: cleanup runs
  `removeEventListener` with the identical closure reference —
  exactly one listener per mounted loading session, no
  duplication, no leak. Verified by reading the final hunk; deps
  and cleanup are unchanged from the reviewed code.
- User-visible behavior preserved, strictly improved: Escape
  during a request still calls `stopRequest` (generation bump,
  `setLoading(false)`, status line, `cancelAI`); the only delta
  is that presses in the former paint-to-flush gap now register
  instead of being swallowed.

## 4. Focused repeated test results

- Pre-fix baseline (`AiChat.test.tsx`, 19 tests): 6/6 pass in
  isolation — consistent with Phase 2B (flake needs suite-level
  contention; the authentic failure was captured in 2B suite6:
  `cancelAI` 0 calls at `AiChat.test.tsx:381`).
- Post-fix: 20/20 pass, 19/19 each, logs retained (`p3a1–20`).
  Zero failures.

## 5. Full renderer, TypeScript and build results

| Gate | Result |
|---|---|
| `npm run test:renderer` ×6 post-fix | 6/6 green, 238/238 each, logs retained (`p3s1–6`), zero `FAIL` lines |
| `npx tsc -b` | Exit 0, silent |
| `npm run build` | Exit 0, `✓ built in 55.54s` |
| Backend gates (`npm test`, syntax/manifest/workbench) | Correctly skipped — no shared/backend file changed |
| `git diff --check` | Exit 0 (pre-existing LF→CRLF notices only) |

## 6. Screenshot 04/10 status and owner capture instructions

Status: both categories remain PENDING — nothing captured,
nothing fabricated, no mockups substituted. GUI interaction is
unavailable in this environment (Phase 2C §1 boundary), so per
instructions both stay marked pending.

Verified present and untouched: all 20 PNGs in `docs/images/`
(8 gallery + 9 supplementary under final names + the 3 removal
candidates under original names).

Existing recipes (from Phase 2C §5, restated as exact owner
steps):

- 04 Multi-file code changes: open the KryomCode repo (or any
  multi-file fixture) in the app → Meta AI Agent tab → request a
  plan with 2+ edits across at least two files → approve →
  open the run's Changes section → expand two file diffs so both
  `DiffView` blocks are visible → capture the window
  (`ChangesView`, `AgentWorkspace.tsx:714`).
- 10 Verification results: same run → Verification section →
  run one passing check (`node --version`) and one failing
  check (`node --no-such-flag-xyz`) → expand both result rows
  so verdict, exit code, duration, and `agent-run-output`
  excerpts show → capture (`ChecksView`, `:882`).
- Name captures `04-multi-file-code-changes.png` and
  `10-verification-results.png` into `docs/images/`, then extend
  the README gallery captions honestly (executed results only).

## 7. Final Git status and diff

- Branch `main`, HEAD `c0c5f4a`. Nothing staged, committed,
  tagged, pushed, reset, or cleaned.
- Tracked modified: 61 files — the same Phase 1 set (the one
  edited source file was already a member).
- Untracked: 83 files — the 81 from the Phase 2C inventory plus
  this report plus `docs/demo/kryomcode-hackathon-demo.mp4`
  (124,256,859 bytes, created 2026-11-02T12:04:49Z, i.e. after
  the Phase 2C inventory). That video was not produced by any
  command in this phase (this session ran only tests, typecheck,
  build, Git reads, and the two file writes below); it is
  owner-side work in progress and was preserved untouched, never
  opened. All Phase 1/2 screenshots, reports, and sources
  preserved; the 3 removal candidates untouched.
- Final diff (`AiChat.tsx` vs HEAD): the pre-existing Phase 1
  delta plus exactly this phase's +6/−2 hunk (§2). No other
  file differs from its Phase 2C state. No instrumentation or
  probe residue (none was created this phase).

## 8. Remaining P0/P1 issues

- No P0. The AiChat Escape flake (former P1) is fixed and
  verified above — 20/20 focused, 6/6 suite.
- P1 (carried, owner-gated): GUI smoke interaction steps and
  in-app live flows L3–L5 still need the human pass (Phase 2C
  §1/§9); screenshot categories 04/10 still missing (recipes in
  §6); demo video in progress owner-side (`docs/demo/*.mp4`
  appeared during this phase, untouched here); doc touch-ups;
  commit/tag/release all still unauthorized.
- No new issues were found in this phase.

## Verdict: PASS

The confirmed Escape-listener race is fixed by the smallest
correct change (one effect, pre-paint attach, identical
lifecycle/cleanup), with 20/20 focused and 6/6 full-suite green
runs plus clean typecheck, build, and diff gates behind it. No
unrelated file changed, screenshots are intact with 04/10
honestly pending, and no FAIL was observed anywhere.
