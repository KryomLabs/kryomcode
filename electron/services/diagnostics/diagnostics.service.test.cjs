const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  setWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const { parseOutput } = require('./problem-parser.cjs')
const {
  MAX_OBSERVED_RUNS,
  runDiagnostics,
  cancelDiagnostics,
  getObservedRun,
} = require('./diagnostics.service.cjs')

describe('problem-parser', () => {
  it('parses TypeScript errors', () => {
    const { diagnostics } = parseOutput(
      'src/app.ts(12,4): error TS2322: Type mismatch.\nsrc/x.ts(1,1): warning TS1234: Hint.'
    )

    assert.equal(diagnostics.length, 2)
    assert.equal(diagnostics[0].file, 'src/app.ts')
    assert.equal(diagnostics[0].line, 12)
    assert.equal(diagnostics[0].column, 4)
    assert.equal(diagnostics[0].severity, 'error')
    assert.equal(diagnostics[0].code, 'TS2322')
    assert.equal(diagnostics[1].severity, 'warning')
  })

  it('parses generic file:line:col diagnostics', () => {
    const { diagnostics } = parseOutput('src/app.js:3:15: error: Unexpected token')

    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].line, 3)
    assert.equal(diagnostics[0].column, 15)
  })

  it('parses node stack frames and skips internals', () => {
    const { diagnostics } = parseOutput(
      'Error: boom\n    at run (C:\\proj\\app.js:10:5)\n    at node:internal/main:1:1'
    )

    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].file, 'C:\\proj\\app.js')
    assert.equal(diagnostics[0].code, 'STACK')
  })

  it('returns empty for clean output', () => {
    const { diagnostics, truncated } = parseOutput('All good.\nDone in 1s.')

    assert.deepEqual(diagnostics, [])
    assert.equal(truncated, false)
  })
})

describe('diagnostics.service', () => {
  it('reports success only on exit code zero', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    const ok = await runDiagnostics('node --version')

    assert.equal(ok.success, true)
    assert.equal(ok.exitCode, 0)

    const bad = await runDiagnostics('node -e "process.exit(3)"')

    assert.equal(bad.success, false)
    assert.equal(bad.exitCode, 3)
  })

  it('reports cancellation distinctly from failure', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    const controller = new AbortController()
    const pending = runDiagnostics('node -e "setTimeout(() => {}, 30000)"', {
      signal: controller.signal,
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    controller.abort()

    const result = await pending

    assert.equal(result.cancelled, true)
    assert.equal(result.success, false)
    assert.equal(result.timedOut, false)
  })

  it('captures diagnostics from failing output', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    const result = await runDiagnostics(
      'node -e "console.error(\'src/a.ts(2,3): error TS9999: Fake.\'); process.exit(2)"'
    )

    assert.equal(result.success, false)
    assert.equal(result.diagnostics.length, 1)
    assert.equal(result.diagnostics[0].code, 'TS9999')
  })

  it('attaches an executed diagnosis with duration to every run', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    const ok = await runDiagnostics('node --version')

    assert.equal(typeof ok.durationMs, 'number')
    assert.ok(ok.durationMs >= 0)
    assert.equal(ok.diagnosis.provenance, 'executed')
    assert.equal(ok.diagnosis.status, 'passed')
    assert.deepEqual(ok.diagnosis.findings, [])
    assert.equal(ok.diagnosis.exitCode, 0)
    assert.match(ok.diagnosis.runId, /^dg-/)

    const bad = await runDiagnostics('node -e "process.exit(3)"')

    assert.equal(bad.diagnosis.provenance, 'executed')
    assert.equal(bad.diagnosis.status, 'failed')
    assert.equal(bad.diagnosis.exitCode, 3)
    assert.equal(bad.diagnosis.findings[0].category, 'unknown')
    assert.notEqual(bad.diagnosis.runId, ok.diagnosis.runId)
  })

  it('diagnoses TAP failure output from a real process', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    // A real `node --test` child cannot run inside the suite: the
    // runner refuses recursive runs. The child here is still a real
    // spawned process (provenance 'executed'); only its program is
    // synthetic TAP.
    const result = await runDiagnostics(
      'node -e "console.log(\'not ok 1 - adds\'); process.exit(1)"'
    )

    assert.equal(result.success, false)
    assert.equal(result.diagnosis.provenance, 'executed')
    assert.equal(result.diagnosis.runner, 'node-test')
    assert.equal(result.diagnosis.findings[0].category, 'assertion_failure')
    assert.equal(result.diagnosis.findings[0].confidence, 'high')
    assert.equal(result.diagnosis.findings[0].test, 'adds')
  })

  it('diagnoses type errors from a real tsc-shaped failure', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    const result = await runDiagnostics(
      'node -e "console.error(\'src/a.ts(2,3): error TS2322: Fake.\'); process.exit(2)"'
    )

    assert.equal(result.diagnosis.findings[0].category, 'type_error')
    assert.equal(result.diagnosis.findings[0].confidence, 'high')
    assert.equal(result.diagnosis.findings[0].file, 'src/a.ts')
    assert.equal(result.diagnosis.findings[0].line, 2)
  })

  it('retains observed runs for verification reports', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    assert.equal(MAX_OBSERVED_RUNS, 50)

    const run = await runDiagnostics('node --version')
    const observed = getObservedRun(run.diagnosis.runId)

    assert.ok(observed)
    assert.equal(observed.command, 'node --version')
    assert.equal(observed.exitCode, 0)
    assert.ok(observed.startedAt)
    assert.ok(observed.completedAt)
    assert.equal(observed.diagnosis.runId, run.diagnosis.runId)
    assert.equal(getObservedRun('dg-forged-00000000'), null)
  })

  it('diagnoses cancellation from a real run', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    // Timeout shares the same flag-to-diagnosis wiring and is
    // covered at the classifier level; the 120s terminal default
    // makes a live timeout run impractical here.
    const controller = new AbortController()
    const pending = runDiagnostics('node -e "setTimeout(() => {}, 30000)"', {
      signal: controller.signal,
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    controller.abort()

    const result = await pending

    assert.equal(result.diagnosis.status, 'cancelled')
    assert.equal(result.diagnosis.findings[0].category, 'cancelled')
    assert.equal(result.diagnosis.findings[0].confidence, 'high')
  })

  it('cancels an in-flight run through its own origin scope', async () => {
    const {
      cancelRunningProcesses,
      runCommand,
      listRunningProcesses,
    } = require('../terminal/terminal.service.cjs')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-diag-'))
    await setWorkspaceRoot(dir)

    // Stop buttons are origin-scoped: Problems uses diagnostics:cancel
    // and agent verification uses agent:cancel-verification, so a
    // diagnostics run must resolve cancelled through its own channel
    // while a concurrent terminal run survives.
    const pending = runDiagnostics('node -e "setTimeout(() => {}, 30000)"')
    const terminalPending = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'user-terminal',
    })
    const deadline = Date.now() + 10000

    while (Date.now() < deadline) {
      const origins = listRunningProcesses().map((entry) => entry.origin)

      if (origins.includes('diagnostics') && origins.includes('user-terminal')) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    assert.ok(
      listRunningProcesses().some((entry) => entry.origin === 'diagnostics')
    )
    // Scoped cancel: the diagnostics run dies here, while the
    // concurrent terminal run is untouched until its own scope below.
    const cancelled = cancelDiagnostics()

    assert.equal(cancelled.killed, 1)
    assert.ok(
      listRunningProcesses().some((entry) => entry.origin === 'user-terminal')
    )

    cancelRunningProcesses('user-terminal')

    const terminalResult = await terminalPending

    assert.equal(terminalResult.cancelled, true)

    const result = await pending

    assert.equal(result.cancelled, true)
    assert.equal(result.success, false)
    assert.equal(result.diagnosis.status, 'cancelled')
  })
})
