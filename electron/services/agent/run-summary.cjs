// Deterministic run summaries (Milestone 3). Builds the final agent
// report from the persisted run record only — observed events,
// applied edits, and recorded check conclusions. Pure: no model
// calls, no I/O, nothing inferred beyond the record.
//
// Honesty rules (enforced here, not in the UI):
// - `verification` is "verified" only when every subtask that named
//   a verification command has a passing observed conclusion.
//   Anything else is "partially-verified" or "unverified".
// - Checks land in exactly one bucket: passed, failed, skipped,
//   not-executed, or manual-pending. Subtasks without a runnable
//   command are manual-pending, never passed.
// - A run whose work finished but whose verification is incomplete
//   still reports its gaps in `remainingIssues` with a concrete
//   `suggestedNext`; completion of edits is never presented as
//   proof of correctness.
const CONCLUSION_BUCKET = {
  passed: 'passed',
  failed: 'failed',
  cancelled: 'not-executed',
  timed_out: 'failed',
  blocked: 'not-executed',
  skipped: 'skipped',
  not_executed: 'not-executed',
}

function bucketFor(check) {
  if (!check || typeof check !== 'object') {
    return 'not-executed'
  }

  return CONCLUSION_BUCKET[check.conclusion] || 'not-executed'
}

function actionLabel(action) {
  if (action === 'create') {
    return 'created'
  }

  if (action === 'delete') {
    return 'deleted'
  }

  return 'modified'
}

function buildRunSummary(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('A run record is required to summarize.')
  }

  const subtasks = Array.isArray(record.subtasks) ? record.subtasks : []
  const applied = Array.isArray(record.appliedFiles) ? record.appliedFiles : []
  const checks = Array.isArray(record.checks) ? record.checks : []
  const events = Array.isArray(record.events) ? record.events : []

  const buckets = {
    passed: [],
    failed: [],
    skipped: [],
    notExecuted: [],
    manualPending: [],
  }

  const checksBySubtask = new Map()

  for (const check of checks) {
    if (!check || typeof check !== 'object') {
      continue
    }

    const bucket = bucketFor(check)
    const entry = {
      check: typeof check.check === 'string' ? check.check : '(unnamed check)',
      conclusion: check.conclusion || 'not_executed',
      exitCode: typeof check.exitCode === 'number' ? check.exitCode : null,
      timedOut: check.timedOut === true,
      runId: typeof check.runId === 'string' ? check.runId : null,
      subtask: typeof check.subtask === 'number' ? check.subtask : null,
      reason: typeof check.reason === 'string' ? check.reason : '',
      // Summaries stay compact for memory notes; full output lives
      // on the run record's checks.
      output: null,
      outputLimited: false,
      problems: typeof check.problems === 'number' ? check.problems : 0,
      problemsTruncated: false,
    }

    if (entry.subtask !== null) {
      checksBySubtask.set(entry.subtask, entry)
    }

    if (bucket === 'passed') {
      buckets.passed.push(entry)
    } else if (bucket === 'failed') {
      buckets.failed.push(entry)
    } else if (bucket === 'skipped') {
      buckets.skipped.push(entry)
    } else {
      buckets.notExecuted.push(entry)
    }
  }

  for (const subtask of subtasks) {
    if (!subtask || typeof subtask !== 'object') {
      continue
    }

    const index = typeof subtask.index === 'number' ? subtask.index : null

    if (index === null || checksBySubtask.has(index)) {
      continue
    }

    buckets.manualPending.push({
      check: `Subtask ${index + 1}: ${subtask.title || 'untitled'}`,
      conclusion: 'manual-pending',
      exitCode: null,
      timedOut: false,
      runId: null,
      subtask: index,
      reason:
        typeof subtask.verificationNote === 'string' && subtask.verificationNote
          ? subtask.verificationNote
          : 'No verification command was proposed for this subtask.',
      output: null,
      outputLimited: false,
      problems: 0,
      problemsTruncated: false,
    })
  }

  const runnableTotal =
    buckets.passed.length + buckets.failed.length + buckets.notExecuted.length
  const verification =
    runnableTotal === 0 && buckets.manualPending.length === 0
      ? 'unverified'
      : buckets.failed.length === 0 &&
          buckets.notExecuted.length === 0 &&
          buckets.manualPending.length === 0
        ? 'verified'
        : buckets.passed.length > 0 &&
            buckets.failed.length === 0 &&
            buckets.notExecuted.length === 0
          ? 'partially-verified'
          : buckets.failed.length > 0 || buckets.notExecuted.length > 0
            ? 'unverified'
            : 'partially-verified'

  const remainingIssues = []

  for (const entry of buckets.failed) {
    remainingIssues.push(
      `Check failed: ${entry.check}` +
        (entry.exitCode !== null ? ` (exit ${entry.exitCode})` : '') +
        (entry.reason ? ` — ${entry.reason}` : '')
    )
  }

  for (const entry of buckets.notExecuted) {
    remainingIssues.push(
      `Check not executed: ${entry.check}` +
        (entry.reason ? ` — ${entry.reason}` : '')
    )
  }

  for (const entry of buckets.manualPending) {
    remainingIssues.push(`Manual verification pending: ${entry.check}. ${entry.reason}`)
  }

  const repairs = events.filter((event) => event && event.kind === 'repair').length
  const approvals = events.filter(
    (event) => event && event.kind === 'approval-resolved'
  ).length

  const state = record.state || 'unknown'
  const workComplete = state === 'completed'
  const suggestedNext = suggestNext(state, buckets, remainingIssues.length)

  return {
    version: 1,
    runId: record.id || null,
    task: typeof record.task === 'string' ? record.task : '',
    state,
    workComplete,
    verification,
    whatChanged: applied.map((entry) => ({
      path: entry.path,
      action: entry.action,
      label: `${entry.path} (${actionLabel(entry.action)})`,
      subtask: typeof entry.subtask === 'number' ? entry.subtask : null,
    })),
    whyChanged:
      typeof record.objective === 'string' && record.objective
        ? record.objective
        : typeof record.task === 'string'
          ? record.task
          : '',
    filesAffected: applied.length,
    checks: buckets,
    checkCounts: {
      passed: buckets.passed.length,
      failed: buckets.failed.length,
      skipped: buckets.skipped.length,
      notExecuted: buckets.notExecuted.length,
      manualPending: buckets.manualPending.length,
    },
    remainingIssues: remainingIssues.slice(0, 20),
    suggestedNext,
    repairs,
    approvals,
    startedAt: record.startedAt || null,
    finishedAt: record.finishedAt || null,
  }
}

function suggestNext(state, buckets, issueCount) {
  if (state === 'cancelled') {
    return 'The run was cancelled. Start a new run to continue; applied work and checkpoints were kept.'
  }

  if (state === 'failed') {
    if (buckets.failed.length > 0) {
      return 'Verification failed after bounded repair. Review the failing check output, adjust the task, and start a new run.'
    }

    return 'The run failed before verification. Review the error event, adjust the task, and start a new run.'
  }

  if (state !== 'completed') {
    return 'The run has not finished. Follow the timeline for the current gate.'
  }

  if (buckets.failed.length > 0 || buckets.notExecuted.length > 0) {
    return 'Work finished but verification is incomplete — see remaining issues before relying on these changes.'
  }

  if (buckets.manualPending.length > 0) {
    return 'All automated checks passed; complete the manual verification items before relying on these changes.'
  }

  if (issueCount > 0) {
    return 'Review the remaining issues before relying on these changes.'
  }

  return 'All checks passed. Review the diffs, then continue with your workflow.'
}

function summaryToMarkdown(summary) {
  const lines = [
    `# Agent run ${summary.workComplete ? 'completed' : summary.state}`,
    '',
    `Task: ${summary.task}`,
    `Verification: ${summary.verification}`,
    '',
    `Files affected: ${summary.filesAffected}`,
  ]

  for (const change of summary.whatChanged) {
    lines.push(`- ${change.label}`)
  }

  lines.push(
    '',
    `Checks: ${summary.checkCounts.passed} passed, ${summary.checkCounts.failed} failed, ` +
      `${summary.checkCounts.skipped} skipped, ${summary.checkCounts.notExecuted} not executed, ` +
      `${summary.checkCounts.manualPending} manual-pending.`
  )

  if (summary.remainingIssues.length > 0) {
    lines.push('', 'Remaining issues:')

    for (const issue of summary.remainingIssues) {
      lines.push(`- ${issue}`)
    }
  }

  lines.push('', `Suggested next step: ${summary.suggestedNext}`)

  return lines.join('\n')
}

module.exports = {
  buildRunSummary,
  summaryToMarkdown,
}
