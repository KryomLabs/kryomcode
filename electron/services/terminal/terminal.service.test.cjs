const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  runCommand,
  buildChildEnv,
  listRunningProcesses,
  cancelRunningProcesses,
} = require('./terminal.service.cjs')
const {
  setWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  killProcessTree,
} = require('./process-manager.cjs')

describe('terminal.service', () => {
  it('never exposes MODEL_API_KEY to child processes', () => {
    process.env.MODEL_API_KEY = 'test-secret-must-not-leak'
    process.env.KRYOM_SAFE_MARKER = 'keep-me'

    try {
      const env = buildChildEnv()

      assert.equal('MODEL_API_KEY' in env, false)
      assert.equal(env.KRYOM_SAFE_MARKER, 'keep-me')
    } finally {
      delete process.env.MODEL_API_KEY
      delete process.env.KRYOM_SAFE_MARKER
    }
  })

  // Runs before any workspace is opened in this file, so it exercises
  // the no-workspace gate. Keep it above the tests that open one.
  it('requires an open workspace', async () => {
    await assert.rejects(
      () => runCommand('echo hi'),
      /Open a project folder first/
    )
  })

  it('rejects empty and oversized commands', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-term-'))
    await setWorkspaceRoot(dir)

    await assert.rejects(() => runCommand(''), /valid command/)
    await assert.rejects(
      () => runCommand('x'.repeat(2001)),
      /valid command/
    )
  })

  it('runs a command inside the workspace and captures output', async () => {
    const result = await runCommand('echo kryom-ok')

    assert.equal(result.exitCode, 0)
    assert.match(result.output, /kryom-ok/)
    assert.equal(result.timedOut, false)
  })

  it('kills whole process trees without throwing', () => {
    assert.equal(killProcessTree(null), false)
    assert.equal(killProcessTree(undefined), false)

    let killed = false
    const plain = { kill: () => { killed = true; return true } }

    assert.equal(killProcessTree(plain, { platform: 'linux' }), true)
    assert.equal(killed, true)

    const calls = []
    const windowsChild = {
      pid: 4242,
      kill: () => { throw new Error('should not be called') },
    }

    assert.equal(
      killProcessTree(windowsChild, {
        platform: 'win32',
        spawnSync: (cmd, args) => {
          calls.push([cmd, args])
          return { status: 0 }
        },
      }),
      true
    )
    assert.deepEqual(calls, [
      ['taskkill', ['/pid', '4242', '/T', '/F']],
    ])

    // A failed taskkill falls back to plain kill instead of throwing.
    let fallback = false

    assert.equal(
      killProcessTree(
        { pid: 1, kill: () => { fallback = true; return true } },
        {
          platform: 'win32',
          spawnSync: () => { throw new Error('taskkill missing') },
        }
      ),
      true
    )
    assert.equal(fallback, true)
  })

  it('attaches advisory warnings without blocking commands', async () => {
    const ok = await runCommand('echo hello')

    assert.deepEqual(ok.warnings, [])

    const flagged = await runCommand('echo rm -rf /tmp/x')

    assert.ok(flagged.warnings.length > 0)
    assert.equal(flagged.exitCode, 0)
  })

  it('lists and cancels running processes', async () => {
    const pending = runCommand('node -e "setTimeout(() => {}, 30000)"')

    assert.ok(listRunningProcesses().length >= 1)

    const cancelled = cancelRunningProcesses()

    assert.ok(cancelled.killed >= 1)

    const result = await pending

    assert.equal(result.exitCode, 1)
    assert.equal(listRunningProcesses().length, 0)
  })

  it('marks signal-cancelled runs instead of reporting failure', async () => {
    const controller = new AbortController()
    const pending = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      signal: controller.signal,
    })

    await new Promise((resolve) => setTimeout(resolve, 100))
    controller.abort()

    const result = await pending

    assert.equal(result.cancelled, true)
    assert.equal(result.timedOut, false)
    assert.match(result.output, /Cancelled by user/)
    assert.equal(listRunningProcesses().length, 0)

    // The registry is clean: a follow-up command runs normally.
    const next = await runCommand('node -e "console.log(1 + 1)"')

    assert.equal(next.cancelled, false)
    assert.equal(next.exitCode, 0)
    assert.match(next.output, /2/)
  })

  it('marks pre-aborted runs as cancelled', async () => {
    const controller = new AbortController()

    controller.abort()

    const result = await runCommand('node -e "setTimeout(() => {}, 30000)"', {
      signal: controller.signal,
    })

    assert.equal(result.cancelled, true)
    assert.equal(result.timedOut, false)
    assert.equal(listRunningProcesses().length, 0)
  })

  it('keeps timeouts distinct from cancellations', async () => {
    const result = await runCommand('node -e "setTimeout(() => {}, 30000)"', {
      timeoutMs: 100,
    })

    assert.equal(result.timedOut, true)
    assert.equal(result.cancelled, false)
    assert.match(result.output, /timed out/)
    assert.equal(listRunningProcesses().length, 0)
  })

describe('terminal origin-scoped cancellation', () => {
  async function waitForRegistry(count, origins) {
    const deadline = Date.now() + 10000

    while (Date.now() < deadline) {
      const listed = listRunningProcesses()

      if (
        listed.length >= count &&
        (origins === undefined ||
          origins.every((origin) => listed.some((entry) => entry.origin === origin)))
      ) {
        return listed
      }

      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    throw new Error('Timed out waiting for the process registry.')
  }

  it('cancels one origin while another origin keeps running', async () => {
    const terminalRun = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'user-terminal',
    })
    const agentRun = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'agent',
    })

    await waitForRegistry(2, ['user-terminal', 'agent'])

    const cancelled = cancelRunningProcesses('user-terminal')

    assert.equal(cancelled.killed, 1)

    const terminalResult = await terminalRun

    assert.equal(terminalResult.cancelled, true)
    assert.match(terminalResult.output, /Cancelled by user/)

    // The agent run survived the terminal cancel: still registered,
    // then cancelled through its own scope.
    assert.ok(
      listRunningProcesses().some((entry) => entry.origin === 'agent')
    )

    const agentCancelled = cancelRunningProcesses('agent')

    assert.equal(agentCancelled.killed, 1)

    const agentResult = await agentRun

    assert.equal(agentResult.cancelled, true)
    assert.equal(listRunningProcesses().length, 0)
  })

  it('lets an unaffected origin complete normally', async () => {
    const slow = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'diagnostics',
    })

    await waitForRegistry(1, ['diagnostics'])

    // A terminal command starting and finishing while the diagnostics
    // run is in flight is completely unaffected by it.
    const quick = await runCommand('node -e "console.log(40 + 2)"', {
      origin: 'user-terminal',
    })

    assert.equal(quick.exitCode, 0)
    assert.equal(quick.cancelled, false)
    assert.match(quick.output, /42/)
    assert.ok(
      listRunningProcesses().some((entry) => entry.origin === 'diagnostics')
    )

    cancelRunningProcesses('diagnostics')

    const slowResult = await slow

    assert.equal(slowResult.cancelled, true)
    assert.equal(listRunningProcesses().length, 0)
  })

  it('isolates diagnostics cancellation from agent runs', async () => {
    const diagnosticsRun = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'diagnostics',
    })
    const agentRun = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'agent',
    })

    await waitForRegistry(2, ['diagnostics', 'agent'])

    assert.equal(cancelRunningProcesses('diagnostics').killed, 1)

    const diagnosticsResult = await diagnosticsRun

    assert.equal(diagnosticsResult.cancelled, true)
    assert.ok(listRunningProcesses().some((entry) => entry.origin === 'agent'))

    assert.equal(cancelRunningProcesses('agent').killed, 1)

    const agentResult = await agentRun

    assert.equal(agentResult.cancelled, true)
    assert.equal(listRunningProcesses().length, 0)
  })

  it('normalizes unknown origins instead of throwing', async () => {
    const pending = runCommand('node -e "setTimeout(() => {}, 30000)"', {
      origin: 'bogus-origin',
    })

    const listed = await waitForRegistry(1)

    assert.ok(listed.some((entry) => entry.origin === 'user-terminal'))

    cancelRunningProcesses('user-terminal')

    const result = await pending

    assert.equal(result.cancelled, true)
    assert.equal(listRunningProcesses().length, 0)
  })

  it('reports zero kills when cancelling an empty scope', async () => {
    assert.deepEqual(cancelRunningProcesses('agent'), { killed: 0 })
    assert.deepEqual(cancelRunningProcesses('diagnostics'), { killed: 0 })
  })

  it('cleans the registry after failed commands', async () => {
    const result = await runCommand('node -e "process.exit(3)"', {
      origin: 'agent',
    })

    assert.equal(result.exitCode, 3)
    assert.equal(result.cancelled, false)
    assert.equal(listRunningProcesses().length, 0)
  })
})

  // Empty-registry repeat cancel closes out the terminal.service suite.
  it('tolerates repeated cancellation with an empty registry', async () => {
    assert.deepEqual(cancelRunningProcesses(), { killed: 0 })

    const pending = runCommand('node -e "setTimeout(() => {}, 30000)"')

    await new Promise((resolve) => setTimeout(resolve, 100))

    const first = cancelRunningProcesses()
    const second = cancelRunningProcesses()

    assert.ok(first.killed >= 1)
    assert.deepEqual(second, { killed: 0 })

    const result = await pending

    assert.equal(result.cancelled, true)
    assert.equal(listRunningProcesses().length, 0)
  })
})
