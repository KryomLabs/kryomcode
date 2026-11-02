const {
  runCommand,
} = require('../terminal/terminal.service.cjs')
const {
  killProcessesByOrigin,
} = require('../terminal/process-manager.cjs')
const { parseOutput } = require('./problem-parser.cjs')
const { diagnoseRun } = require('./diagnosis.cjs')
const { createLogger, redactText } = require('../../utils/logger.cjs')

const log = createLogger('diagnostics')

const MAX_OBSERVED_RUNS = 50
const MAX_OBSERVED_OUTPUT_CHARS = 4000

// Observed-run registry (Level 3B.5): every diagnostics execution
// this process performed is retained here, keyed by the diagnosis
// run id. Verification reports cite a run id instead of carrying
// renderer-supplied execution facts, so the store resolves facts
// from runs it actually observed and rejects ids it never saw
// (forged, stale/evicted, or from another session). Deliberately
// process-local: after a restart there are no observed runs, and a
// report claiming one is honestly rejected. Bounded: the oldest
// entry is evicted past the cap.
const observedRuns = new Map()

function observeRun(record) {
  observedRuns.set(record.runId, record)

  if (observedRuns.size > MAX_OBSERVED_RUNS) {
    const oldest = observedRuns.keys().next().value

    observedRuns.delete(oldest)
  }
}

function getObservedRun(runId) {
  return observedRuns.get(runId) ?? null
}

// Runs one approved build/test command through the standard terminal
// service (workspace containment, timeouts, secret scrubbing) and parses
// the output into structured diagnostics. success is true only when the
// command exited 0 without timing out: failures are never reported green.

async function runDiagnostics(command, { signal, timeoutMs, origin } = {}) {
  if (
    timeoutMs !== undefined &&
    (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new Error('Invalid diagnostics timeout.')
  }

  const startedAt = new Date().toISOString()
  const started = Date.now()
  const result = await runCommand(
    command,
    timeoutMs === undefined
      ? { signal, origin: origin ?? 'diagnostics' }
      : { signal, timeoutMs, origin: origin ?? 'diagnostics' }
  )
  const completedAt = new Date().toISOString()
  const durationMs = Date.now() - started
  const { diagnostics, truncated } = parseOutput(result.output)
  const success =
    result.exitCode === 0 && !result.timedOut && !result.cancelled

  // The diagnosis is classified from this real execution, so its
  // provenance is always 'executed': fixture-built diagnoses never
  // pass through here.
  const diagnosis = diagnoseRun({
    command,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    output: result.output,
    diagnostics,
    durationMs,
    provenance: 'executed',
    planId: null,
    stepId: null,
  })

  observeRun({
    runId: diagnosis.runId,
    command,
    startedAt,
    completedAt,
    durationMs,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    outputExcerpt: redactText(result.output).slice(0, MAX_OBSERVED_OUTPUT_CHARS),
    diagnosis,
  })

  log.info(
    `Diagnostics ran with exit code ${result.exitCode}; ` +
      `${diagnostics.length} problem(s) found.`
  )

  return {
    success,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    outputLimited: result.outputLimited,
    warnings: result.warnings || [],
    output: result.output,
    diagnostics,
    diagnosticsTruncated: truncated,
    durationMs,
    diagnosis,
  }
}

// Origin-scoped cancellation for user-driven diagnostics runs
// (Problems panel Stop). Agent verification runs carry their own
// 'agent' origin and are never touched by this channel.
function cancelDiagnostics() {
  const { killed } = killProcessesByOrigin('diagnostics')

  return { killed }
}

module.exports = {
  MAX_OBSERVED_RUNS,
  runDiagnostics,
  cancelDiagnostics,
  getObservedRun,
}
