const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const { buildRunSummary, summaryToMarkdown } = require('./run-summary.cjs')

function record(overrides = {}) {
  return {
    id: 'ar-test',
    task: 'Fix billing totals.',
    objective: 'Billing totals are correct.',
    state: 'completed',
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: '2026-10-31T00:01:00.000Z',
    subtasks: [],
    appliedFiles: [],
    checks: [],
    events: [],
    ...overrides,
  }
}

describe('run-summary', () => {
  it('reports verified only when every runnable check passed', () => {
    const summary = buildRunSummary(
      record({
        appliedFiles: [{ path: 'src/billing.js', action: 'modify', subtask: 0 }],
        subtasks: [{ index: 0, title: 'Fix totals' }],
        checks: [
          { subtask: 0, check: 'npm test', conclusion: 'passed', exitCode: 0 },
        ],
      })
    )

    assert.equal(summary.verification, 'verified')
    assert.equal(summary.workComplete, true)
    assert.equal(summary.filesAffected, 1)
    assert.deepEqual(summary.checkCounts, {
      passed: 1,
      failed: 0,
      skipped: 0,
      notExecuted: 0,
      manualPending: 0,
    })
    assert.deepEqual(summary.remainingIssues, [])
    assert.match(summary.suggestedNext, /All checks passed/)
  })

  it('never claims completion while verification is pending', () => {
    const summary = buildRunSummary(
      record({
        appliedFiles: [{ path: 'src/billing.js', action: 'modify', subtask: 0 }],
        subtasks: [{ index: 0, title: 'Fix totals' }],
        checks: [
          {
            subtask: 0,
            check: 'npm test',
            conclusion: 'not_executed',
            reason: 'Command denied by policy.',
          },
        ],
      })
    )

    assert.equal(summary.verification, 'unverified')
    assert.equal(summary.checkCounts.notExecuted, 1)
    assert.equal(summary.remainingIssues.length, 1)
    assert.match(summary.remainingIssues[0], /not executed/i)
    assert.match(summary.suggestedNext, /verification is incomplete/)
  })

  it('marks subtasks without checks as manual-pending', () => {
    const summary = buildRunSummary(
      record({
        subtasks: [
          { index: 0, title: 'Docs tweak', verificationNote: 'Docs only; eyeball it.' },
        ],
      })
    )

    assert.equal(summary.verification, 'partially-verified')
    assert.equal(summary.checkCounts.manualPending, 1)
    assert.match(summary.remainingIssues[0], /Manual verification pending/)
    assert.match(summary.suggestedNext, /manual verification/i)
  })

  it('buckets failures, skips, and timeouts distinctly', () => {
    const summary = buildRunSummary(
      record({
        state: 'failed',
        subtasks: [{ index: 0 }, { index: 1 }, { index: 2 }],
        checks: [
          { subtask: 0, check: 'npm test', conclusion: 'failed', exitCode: 1 },
          { subtask: 1, check: 'lint', conclusion: 'skipped' },
          { subtask: 2, check: 'e2e', conclusion: 'timed_out', timedOut: true },
        ],
      })
    )

    assert.deepEqual(summary.checkCounts, {
      passed: 0,
      failed: 2,
      skipped: 1,
      notExecuted: 0,
      manualPending: 0,
    })
    assert.equal(summary.verification, 'unverified')
    assert.match(summary.suggestedNext, /bounded repair/)
  })

  it('counts repairs and approvals from events', () => {
    const summary = buildRunSummary(
      record({
        events: [
          { kind: 'repair' },
          { kind: 'repair' },
          { kind: 'approval-resolved' },
          { kind: 'phase' },
        ],
      })
    )

    assert.equal(summary.repairs, 2)
    assert.equal(summary.approvals, 1)
  })

  it('renders markdown without inventing facts', () => {
    const summary = buildRunSummary(record())
    const markdown = summaryToMarkdown(summary)

    assert.match(markdown, /Agent run completed/)
    assert.match(markdown, /Fix billing totals/)
    assert.match(markdown, /Verification: unverified/)
    assert.match(markdown, /0 passed, 0 failed, 0 skipped, 0 not executed/)
  })

  it('advises honestly for cancelled and failed runs', () => {
    assert.match(
      buildRunSummary(record({ state: 'cancelled' })).suggestedNext,
      /cancelled/
    )
    assert.match(
      buildRunSummary(record({ state: 'failed' })).suggestedNext,
      /before verification/
    )
  })
})
