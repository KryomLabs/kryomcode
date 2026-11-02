# KryomCode Testing

## Running the suite

```powershell
npm test                    # full backend suite (Node test runner)
npm run check:syntax        # static gate: node --check over electron/**/*.cjs
npm run check:test-manifest # every *.test.cjs listed in the test script
npm run check:workbench     # pure renderer-state gate (unified tabs, Meta AI sessions, activity registry, timeline, intent, history relevance)
npm run build               # tsc -b + Vite build (also type-checks the renderer)
npm run test:renderer     # renderer DOM suite (vitest + Testing Library; run npm install first)
```

`npm test` lists its files explicitly in `package.json`. When adding a
colocated test, append the new path to that script; `npm run
check:test-manifest` (a CI gate) fails when a test file is missing.

## Current-tree verification (2026-11-02, owner Windows machine)

Recorded in the Phase 2A/2B/2C/3 reports (this section summarizes; those
files hold the per-gate evidence):

- `npm test`: 83 files, 782 tests — 777 pass, 0 fail, 5 pre-existing
  environment skips (Phase 2A; backend sources unchanged since).
- `npm run test:renderer`: 32 files, 238 tests, all pass, including two
  regression tests added for fixed flaky files (Phase 2B/3).
- `npx tsc -b`, `npm run build`: green on the current tree (Phase 3).
- `check:syntax`, `check:test-manifest`, `check:workbench`, `pack`,
  `check:release` (4234 asar entries), `dist`, dependency audit: green
  (Phase 2A; only renderer sources and docs changed since).
- GUI: packaged launch + clean quit pixel-verified; click-through smoke
  pending a human pass (Phase 2C).
- Meta live L1/L2 passed on this tree (Phase 2C); L3-L5 not run.

## Last verified

2026-10-30, owner Windows machine (Node v24.14.1; CI pins
Node 22 to match the Electron 45 runtime):

- `npm test` (69 files): green, owner-confirmed. Four
  pre-existing environment skips (symlink creation needs
  elevated privilege: 2 in `security.test.cjs`, 1 in
  `freshness.test.cjs`, 1 in `chat-store.test.cjs`).
- `npm run check:syntax`: 170 files, 170 ok, 0 failed.
- `npm run check:test-manifest`: green (69/69).
- `npx tsc -b`: clean (silent).
- `npm run build`: green (1332 modules, via `pack`).
- `npm run pack` + `npm run check:release`: green (3973
  asar entries, unpacked extension worker present).
- `npm run dist`: installer build succeeded.
- Focused suites from pasted output: `runtime` 8/8,
  `github.adapter` 4/4, `provider-config` 5/5, `router` 7/7,
  `ipc.integration` 44/44.

Manual GUI smoke (SMOKE 1–43) and the first 3-OS CI matrix
run are still pending; see [SMOKE_TEST.md](SMOKE_TEST.md)
and [ROADMAP.md](ROADMAP.md) gate records.

## Level 3C verification (2026-10-30, same machine, Node v24.14.1)

- `npm test` (70 files, 628 tests): 615 pass, 5 skipped
  (pre-existing symlink-privilege skips), 8 fail. The 8 failures are
  pre-existing and unrelated to 3C (verified: deterministic in
  isolation, dependency cones exclude every 3C-touched file):
  `impact-analysis` ×3, `semantic-search` ×1, `symbol-index` ×1,
  (an earlier edit transposed the last two counts; Phase 8, the release
  brief, and the final audit independently agree on ×1 / ×2),
  `workflow-store` ×2, plus file-level marks. Post-audit re-run (2026-10-30, 640 tests incl. 10 new Phase 2 tests, all passing): 625 pass with the same 7 pre-existing test failures.
  `api-contract` e2e bug (wrong example command id `sayHello` vs
  `say-hello`, which also leaked its worker and stalled the whole
  suite forever) was fixed in the test only (ids + guaranteed
  `shutdownAll`), no backend behavior changed.
- `npm run check:workbench`: green (unified tabs, Meta AI sessions,
  activity registry, timeline, intent, history relevance) -- re-verified
  green 2026-10-30 after the audit fixes.
- `npx tsc --noEmit`: clean.
- `npm run check:syntax`: 172 files, 172 ok, 0 failed.
- `npm run check:test-manifest`: green (70/70).
- `npm run build`: green. `npm run pack` + `npm run check:release`:
  green (3980 asar entries; branded icons, vault, and workspace code
  verified inside the bundle).
- Manual GUI smoke (SMOKE 1–49, incl. new 3C steps 44–49) is still
  pending: the build sandbox redirects GUI binaries, so the desktop
  app cannot be launched and inspected there.

## Final milestone fixes (2026-10-30, executed and green)

Root causes were found and fixed for all 7 pre-existing failures
(see [FINAL_COMPREHENSIVE_AUDIT.md](FINAL_COMPREHENSIVE_AUDIT.md)
F1–F5): masked-source import extraction (symbol-index ×1,
impact-analysis ×3), intent stem matching (semantic-search ×1),
project-scope delete object-to-path bug (workflow-store ×1,
skill-store latent), and validation-fixture step ids
(workflow-store ×1, test-only). Executed 2026-10-30 after an
escalated shell became available: `npm test` → 637 tests, 632 pass,
0 fail, 5 env-skipped; `npm run test:renderer` → 8/8; `npx tsc -b`,
`check:syntax` (173/173), `check:test-manifest` (70/70),
`check:workbench`, `build`, `pack`, `check:release` (3981 asar
entries), `dist`, and `npm audit --omit=dev` all green. Only the
running-app GUI walkthrough (SMOKE_TEST.md) still needs a display
session: GUI processes cannot survive under this shell.

## Test inventory

All tests use the built-in `node:test` runner with
`node:assert/strict`. No test framework dependency is required.

| Test file | What it covers |
|---|---|
| `electron/services/terminal/terminal.service.test.cjs` | Command validation, secret scrubbing from child env, timeout/output caps |
| `electron/services/workspace/workspace.service.test.cjs` | Root state, containment, bounded tree |
| `electron/services/ai/ai.service.test.cjs` | Prompt/history/context limits, key requirement, mock delegation |
| `electron/services/ai/ai-config.service.test.cjs` | Model allowlist, `META_MODEL` handling, missing-key error |
| `electron/services/ai/providers/meta-muse.provider.test.cjs` | Auth/rate-limit mapping, timeouts, cancellation, malformed replies (mocked fetch) |
| `electron/services/ai/chat-store.test.cjs` | Per-project chat round-trip, restore shape, message sanitization |
| `electron/services/filesystem/directory.service.test.cjs` | Create/rename/delete, conditional writes, conflict detection |
| `electron/services/filesystem/file-search.service.test.cjs` | Name/content search bounds and truncation |
| `electron/services/git/git.service.test.cjs` | Status parsing, stage/commit/push validation, ref safety |
| `electron/services/diagnostics/diagnostics.service.test.cjs` | Exit-code success rule, parser integration, executed diagnoses (provenance, duration, TAP/type/cancel runs), observed-run registry, shared-registry cancel of in-flight runs; optional validated `timeoutMs` (default unchanged) |
| `electron/services/diagnostics/diagnosis.test.cjs` | Nine-category classification (TAP/spec/pytest/jest/tsc/runtime/startup/unknown), runner detection, confidence, location honesty, bounds, redaction, sanitize round-trip/corruption |
| `electron/services/project-intelligence/project-analyzer.service.test.cjs` | Index bounds, `.env` exclusion, context caps |
| `electron/services/project-intelligence/code-index.service.test.cjs` | Persistent fingerprints, incremental refresh deltas, stale/missing/unindexed detection, budgeted ranked context, dedup |
| `electron/services/project-intelligence/symbol-index.service.test.cjs` | JS/TS symbol/import extraction, comment/string masking, definitions + cross-file references, stale refusal |
| `electron/services/project-intelligence/architecture.service.test.cjs` | Language/framework/entry-point/config detection, modules/services/boundaries/conventions with evidence |
| `electron/services/project-intelligence/semantic-search.service.test.cjs` | Query parsing (hints/phrases/stop words), intent ranking with explained scores, stale exclusion |
| `electron/services/project-intelligence/impact-analysis.service.test.cjs` | Direct/indirect dependents with quoted evidence, related tests, unresolved-import honesty, stale refusal |
| `electron/services/planning/plan-builder.test.cjs` | Evidence-grounded decomposition, topo ordering, parallel waves, shared-file sequencing, cycle rejection, revision preserving completed work, cancellation (mock provider) |
| `electron/services/specialists/specialist.service.test.cjs` | Six specialists (structured I/O, coding propose-only with digests, no disk writes), malformed-output failure, cancel/timeout honesty, listing (mock provider) |
| `electron/services/orchestration/orchestrator.service.test.cjs` | Approval gate, scope-conflict rejection, parallel proposals with ordered guarded merges, overreach rejection, dependency hold, concurrency cap, cancel preserving partial work, retry budget, stale merge refusal (scripted provider) |
| `electron/services/quality/quality.service.test.cjs` | Quoted security findings with verdict, uncovered-symbol test suggestions, plan history linkage, stale exclusion, observed-only performance, persistence round-trip |
| `electron/services/ai/providers/provider-registry.test.cjs` | Registration, duplicate rejection, lookup, lifecycle, determinism (scripted descriptors) |
| `electron/services/ai/providers/model-catalog.test.cjs` | Model discovery, capability lookup, unknown-stays-unknown honesty, default selection |
| `electron/services/ai/provider-config.test.cjs` | Selection round-trip, patch validation, enabled map, explicit fallback, connection checks with credential redaction |
| `electron/services/ai/router.test.cjs` | Selection routing, capability validation, explicit fallback with `usedFallback`, failure reporting, no silent switching, cancellation |
| `electron/services/permissions/permission.service.test.cjs` | Grant/check/revoke, unknown-permission rejection, trust levels, execution-boundary `requirePermission` |
| `electron/services/audit/audit.service.test.cjs` | Event append/list, type validation, retention caps, secret redaction |
| `electron/services/extensions/manifest.test.cjs` | Schema validation, bad ids/versions/permissions/commands, API-version rejection |
| `electron/services/extensions/registry.test.cjs` | Install records, duplicate-id rejection, enable/disable, safe uninstall |
| `electron/services/extensions/runtime.test.cjs` | Sandbox isolation (no Node globals), command registration caps, timeouts, crash containment, JSON membrane |
| `electron/services/extensions/lifecycle.test.cjs` | Full install→uninstall flow, disabled-by-default, activation errors, startup recovery, corrupt detection |
| `electron/services/skills/skill-store.test.cjs` | Definition validation, tool-catalog binding, permission mapping, builtin/user/project scopes, enable/disable, project delete + missing re-delete |
| `electron/services/skills/skill-runner.test.cjs` | Grant enforcement, approval gates for apply/diagnostics, input validation, failure reporting |
| `electron/services/workflows/workflow-store.test.cjs` | Definition validation, step kinds, versioning, scope storage |
| `electron/services/workflows/workflow-engine.test.cjs` | Explicit advance/approve/resume/cancel, retry bounds, approval propagation, persisted history, failure stage reporting |
| `electron/services/integrations/registry.test.cjs` | Adapter registration, duplicate rejection, lifecycle, error normalization |
| `electron/services/integrations/github.adapter.test.cjs` | Local-git repos/branches/remotes/history, non-repo honesty, PR/issue refusal, no-token design |
| `electron/services/templates/template-engine.test.cjs` | Manifest validation, variable substitution, traversal rejection, existing-dir protection, preview/generate round-trip, recovery |
| `electron/services/platform/api-contract.test.cjs` | API versioning, compatibility checks, invalid-message rejection, contract stability |
| `electron/services/release/environment.test.cjs` | Dev/preview/production separation, packaged-only channel, baked channel, env override |
| `electron/utils/logger.test.cjs` | Level filtering, env level, errors-always-emit, redaction at every level |
| `electron/services/extensions/worker/extension-host.test.cjs` | Real fork activate/invoke/shutdown, crash survival, timeout kill, memory-cap kill, protocol violations, exit recovery |
| `electron/services/diagnostics/support-bundle.test.cjs` | Non-secret collection, home redaction, error-ring bounds, atomic writes, impostor refusal |
| `electron/utils/platform.test.cjs` | OS detection, POSIX-only detach, shell-free executable resolution, spawn defaults |
| `electron/services/terminal/process-manager.test.cjs` | POSIX group signals for marked children only, unmarked safety, taskkill branch |
| `electron/services/update/update.service.test.cjs` | Strict manifest validation, channel/version/platform gates, checksum verify, staged download with progress/cancel, rollback-by-default |
| `electron/services/agent/agent.service.test.cjs` | Plan validation, apply allowlist, rollback, planner risks/outcomes/steps, chat opt-in, snapshot provenance, pre-apply gate (zero-write block, mixed batches, mid-apply rollback), same-file conflict gate |
| `electron/services/agent/freshness.test.cjs` | Freshness states (current/stale/missing/inaccessible/unverified), digest-vs-size detection, symlinks/non-files, traversal/isolation, malformed-input fail-closed |
| `electron/services/agent/plan-store.test.cjs` | Schema v2 + v1 migration, transitions, verified-needs-evidence, truthful verification reports (observed conclusions, contradicting-claim/missing-execution/exit-mismatch rejection, cancelled + real-timeout runs, skipped/blocked/not-executed, secret redaction, legacy loading, tampered/truncated recovery, duplicate/stale run ids, checkpoint/file linkage, conclusion-based plan state), cancel/complete, restart recovery, isolation, retention, context persistence + freshness |
| `electron/services/agent/context-snapshot.test.cjs` | Chat excerpts (bounds/redaction), file fingerprints, research snapshots, freshness current/stale/missing |
| `electron/services/agent/repair.service.test.cjs` | Repair cycles: cap/budget enforcement, cancel at every stage, stale/checkpoint stops, change-set integration (conflict block, dependency order), verdict-less record rejection, interruption recovery, report linkage (cycle/attempt + checkpoint id + changed files), retention, secret redaction, concurrent-duplicate and cancel-race protection (mock provider) |
| `electron/services/agent/checkpoint-store.test.cjs` | Checkpoint records, cross-session undo, skip/tamper honesty, retention |
| `electron/services/agent/context.service.test.cjs` | Source-context gathering, file/byte caps, exclusion reasons |
| `electron/services/agent/change-set.test.cjs` | Import-graph detection (direct/transitive, all statement forms, comments/strings ignored), cycles, unsupported/unresolved/unknown/external honesty, missing/stale targets, conflicts, baseline stale-dep warnings, delete importers, sparse-index ordering, malformed-input fail-closed, traversal/outside isolation, excluded dirs, depth/fan-out/size bounds, ordered-apply + checkpoint undo, blocker kinds |
| `electron/services/research/search-providers.test.cjs` | Source normalization/dedup, provider parsing over stubbed fetch |
| `electron/services/research/url-fetch.service.test.cjs` | SSRF tables, DNS validation/pinning, redirect bounds, markup stripping |
| `electron/services/research/research.service.test.cjs` | Session store, brief validation, extractive brief |
| `electron/services/research/research-handoff.test.cjs` | Research-brief handoff into chat and agent planning |
| `electron/services/settings/settings.service.test.cjs` | Defaults, patch validation, sanitization |
| `electron/services/settings/credential-vault.test.cjs` | OS-vault key round-trip, env precedence, persistence, validation, corrupt-file safety, no-plaintext-on-disk |
| `electron/services/ui/ui-state.test.cjs` | UI-state defaults, sanitization, recents, auto-save |
| `electron/services/documents/document.service.test.cjs` | `.docx` brief/text export, `.docx` import, templates |
| `electron/security/security.test.cjs` | Sender, path, and input guards |
| `electron/utils/utils.test.cjs` | Error shapes, secret redaction |
| `electron/utils/text-utils.test.cjs` | String truncation, whitespace normalization, blank detection |
| `electron/services/crash/crash-recovery.test.cjs` | Crash summaries, reload/relaunch policy, redacted failure detail |
| `electron/wiring.test.cjs` | Every module loads with its exports; every IPC module exports a register function; main/preload relative requires resolve |
| `electron/ipc/ipc.integration.test.cjs` | Real IPC handlers against stubbed Electron: trust guards, sender frames, dialogs, service errors, cancellation, git/docs/memory/plan/context flows, conflicting-apply rejection, intelligence/planning/specialist/orchestration/quality channel flows, provider/permission/audit/extension/skill/workflow/integration/template/update/diagnostics-support channel flows |
| `electron/services/memory/memory.store.test.cjs` | Record validation, CRUD, per-source staleness, project isolation, traversal/malformed storage, deletion, interrupted-write leftovers, export format/atomic write, bulk delete + partial failure, `.kryom` preservation |
| `electron/security/git-privacy.test.cjs` | No tracked `.kryom/` files; `.gitignore` rule present and effective |
| `src/components/dialogs.test.tsx` (vitest) | Dialog FIFO queue, confirm/prompt/conflict resolution, Escape dismissal, danger autofocus |
| `src/components/ErrorBoundary.test.tsx` (vitest) | Full-screen recovery UI, compact regional mode |

Notes:

- AI and agent tests inject `MockProvider` or stub `fetch`; the suite
  makes no network calls.
- Renderer DOM tests live in `src/**/*.test.{ts,tsx}` and run with
  `npm run test:renderer` (vitest + Testing Library + jsdom, config in
  `vitest.config.ts`). Run `npm install` once to fetch the new devDeps
  (and commit the lockfile) before the first run. Renderer correctness
  is otherwise covered
  by `tsc -b`, the Vite build, and manual checks.
- `file.service.cjs` and `git-diff.service.cjs` have no dedicated test
  files; their exports are pinned by the wiring test.

## Conventions for new tests

- Colocate as `<module>.test.cjs` next to the module under test.
- Use `node:test` (`describe`/`it`) and `node:assert/strict`.
- Never use real keys, real network, or the real user-data folder:
  stub `fetch`, inject the mock provider, pass explicit base dirs, and
  restore `process.env` in `afterEach`.
- Prefer small fixture directories under the OS temp dir over touching
  the repository.
- Detached background runs (specialists, orchestration) start
  synchronously and finish in the background: poll the stored
  record with a bounded `waitFor` helper, never `sleep` once and
  hope.
- Multi-answer model doubles: use a small scripted provider (queued
  answers in call order) instead of one `MockProvider` per branch.
- Negative git tests (asserting "not a repository" /
  disconnected in a fresh temp dir) must pin
  `GIT_CEILING_DIRECTORIES` to the temp dir's parent and
  clear `GIT_DIR`/`GIT_WORK_TREE`, restoring all three in a
  `finally` — git's parent traversal otherwise finds stray
  repos above `%TEMP%` (see `git.service.test.cjs`).

## Manual checks

Automated tests cannot cover these; run them before claiming a release
works. The step-by-step release gate (including the offline-editor
check) is [SMOKE_TEST.md](SMOKE_TEST.md); the list below is the
shorter per-feature reminder:

1. `npm run dev` launches and each panel (Explorer, Search, Editor,
   AI Chat, Agent, Terminal, Problems, Git, Settings) responds.
2. One real-key AI chat request per model returns a non-empty answer.
3. One real-key agent plan produces a valid, previewable plan.
4. A save conflict (edit the file externally, then save) offers
   reload/overwrite and both paths work.
5. `npm run pack` output launches, loads `dist/`, stores settings, and
   picks up `MODEL_API_KEY` from the user environment.
6. The `npm run dist` installer installs and starts on a clean machine.
7. Close the window with dirty tabs: Save persists all and closes,
   Discard closes without saving, Cancel leaves the window open; a
   clean window closes without a prompt.
8. Run diagnostics: markers appear in the editor gutter, F8 cycles
   them, and rerunning or switching projects clears stale markers.
9. A research source Open button launches the system browser; chat
   code blocks render with working Copy buttons.
10. Chat Stop aborts a slow request with a "cancelled" status (no
    error box); planning Stop does the same for the agent.
11. Chat history survives a restart per project; switching projects
    shows each project's own conversation.
12. Cancelling or timing out a long terminal command leaves no
    orphan processes (check the task manager for grandchildren).
    Stopping an agent verification check records a cancelled
    report instead of a failure.
13. A tracked plan's verification reports show Status, Executed
    facts, Observed evidence, and any Model explanation labelled
    AI-generated (never as proof); skipped checks show their
    stated reason, legacy reports show the unverified-claim note,
    and repair reports show the checkpoint id and changed files.
14. A multi-file agent plan shows its change-set manifest at
    review (order, review groups, warnings); approving two edits
    to the same file disables Apply with a conflict blocker, and
    applying a clean set records the order as apply-step note
    evidence.

Record completed manual checks in
[backend-limitations.md](backend-limitations.md) with the date.
