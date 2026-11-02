// Process tree termination: Windows taskkill, POSIX process-group
// signals for detached children only, plain-kill fallbacks. Group
// signals never touch unmarked children (that could hit the app's
// own process group).
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  killAllProcesses,
  killProcessTree,
  listProcesses,
  markDetachedProcess,
  killProcessesByOrigin,
  normalizeOrigin,
  PROCESS_ORIGINS,
  registerProcess,
  unregisterProcess,
} = require('./process-manager.cjs')
const {
  cancelGitProcesses,
} = require('../git/git.service.cjs')

describe('process-origin-isolation', () => {
  it('tags entries with a normalized origin', () => {
    const ids = [
      registerProcess({ kill: () => true }, { command: 'a', origin: 'diagnostics' }),
      registerProcess({ kill: () => true }, { command: 'b' }),
      registerProcess({ kill: () => true }, { command: 'c', origin: 'bogus-scope' }),
    ]

    try {
      const byId = new Map(listProcesses().map((entry) => [entry.id, entry]))

      assert.equal(byId.get(ids[0]).origin, 'diagnostics')
      assert.equal(byId.get(ids[1]).origin, 'user-terminal')
      assert.equal(byId.get(ids[2]).origin, 'user-terminal')
      assert.deepEqual(PROCESS_ORIGINS, ['user-terminal', 'diagnostics', 'agent'])
      assert.equal(normalizeOrigin('agent'), 'agent')
      assert.equal(normalizeOrigin(undefined), 'user-terminal')
      assert.equal(normalizeOrigin(null), 'user-terminal')
    } finally {
      for (const id of ids) {
        unregisterProcess(id)
      }
    }
  })

  it('filters listings by origin', () => {
    const terminal = registerProcess({ kill: () => true }, { command: 't', origin: 'user-terminal' })
    const agent = registerProcess({ kill: () => true }, { command: 'g', origin: 'agent' })

    try {
      const onlyAgent = listProcesses({ origin: 'agent' })

      assert.ok(onlyAgent.some((entry) => entry.id === agent))
      assert.ok(!onlyAgent.some((entry) => entry.id === terminal))
      assert.ok(onlyAgent.every((entry) => entry.origin === 'agent'))
    } finally {
      unregisterProcess(terminal)
      unregisterProcess(agent)
    }
  })

  it('kills only the requested origin', () => {
    let terminalKilled = false
    let agentKilled = false
    const terminal = registerProcess(
      { kill: () => { terminalKilled = true; return true } },
      { command: 'term-run', origin: 'user-terminal' }
    )
    const agent = registerProcess(
      { kill: () => { agentKilled = true; return true } },
      { command: 'agent-check', origin: 'agent' }
    )

    try {
      const result = killProcessesByOrigin('user-terminal')

      assert.deepEqual(result, { killed: 1, origin: 'user-terminal' })
      assert.equal(terminalKilled, true)
      assert.equal(agentKilled, false)
      assert.ok(!listProcesses().some((entry) => entry.id === terminal))
      assert.ok(listProcesses().some((entry) => entry.id === agent))
    } finally {
      unregisterProcess(terminal)
      unregisterProcess(agent)
    }
  })

  it('reports zero kills for empty or unknown scopes without throwing', () => {
    assert.deepEqual(killProcessesByOrigin('agent'), { killed: 0, origin: 'agent' })
    assert.deepEqual(killProcessesByOrigin('no-such-origin'), { killed: 0, origin: 'user-terminal' })

    const id = registerProcess({ kill: () => true }, { command: 'x', origin: 'diagnostics' })

    try {
      assert.deepEqual(killProcessesByOrigin('diagnostics'), { killed: 1, origin: 'diagnostics' })
      assert.deepEqual(killProcessesByOrigin('diagnostics'), { killed: 0, origin: 'diagnostics' })
    } finally {
      unregisterProcess(id)
    }
  })

  it('retains failed scoped kills for a later retry', () => {
    const stubborn = { kill: () => false }
    const id = registerProcess(stubborn, { command: 'stubborn', origin: 'agent' })

    try {
      assert.deepEqual(killProcessesByOrigin('agent'), { killed: 0, origin: 'agent' })
      assert.ok(listProcesses().some((entry) => entry.id === id))
      assert.deepEqual(killProcessesByOrigin('user-terminal'), { killed: 0, origin: 'user-terminal' })
      assert.ok(listProcesses().some((entry) => entry.id === id))
    } finally {
      unregisterProcess(id)
    }
  })

  it('ignores already-unregistered processes when cancelling a scope', () => {
    const id = registerProcess({ kill: () => true }, { command: 'gone', origin: 'diagnostics' })

    unregisterProcess(id)

    assert.deepEqual(killProcessesByOrigin('diagnostics'), { killed: 0, origin: 'diagnostics' })
  })

  it('keeps the git registry independent from the shared registry', () => {
    let sharedKilled = false
    const id = registerProcess(
      { kill: () => { sharedKilled = true; return true } },
      { command: 'shared-run', origin: 'user-terminal' }
    )

    try {
      // Git owns a private child set: cancelling git processes must
      // never reach entries tracked here, whatever their origin.
      const result = cancelGitProcesses()

      assert.deepEqual(result, { killed: 0 })
      assert.equal(sharedKilled, false)
      assert.ok(listProcesses().some((entry) => entry.id === id))
    } finally {
      unregisterProcess(id)
    }
  })
})

describe('process-manager-tree-kill', () => {
  it('returns false for missing children', () => {
    assert.equal(killProcessTree(null), false)
    assert.equal(killProcessTree(undefined), false)
  })

  it('retains failed kills in the registry for a later retry', () => {
    const stubborn = { pid: 424242, kill: () => false }
    const id = registerProcess(stubborn, { command: 'stubborn' })

    try {
      const first = killAllProcesses()

      assert.equal(first.killed, 0)
      assert.ok(listProcesses().some((entry) => entry.id === id))

      // Still tracked, so a later cancel retries instead of losing it.
      const second = killAllProcesses()

      assert.equal(second.killed, 0)
      assert.ok(listProcesses().some((entry) => entry.id === id))
    } finally {
      unregisterProcess(id)
    }

    assert.ok(!listProcesses().some((entry) => entry.id === id))
  })

  it('signals the process group of marked POSIX children', () => {
    const signals = []
    const child = { pid: 4242, kill: () => { throw new Error('must not plain-kill') } }

    markDetachedProcess(child)

    const killed = killProcessTree(child, {
      platform: 'linux',
      killSignal: (pgid, signal) => {
        signals.push([pgid, signal])
      },
    })

    assert.equal(killed, true)
    assert.deepEqual(signals, [[-4242, 'SIGTERM']])
  })

  it('never group-signals unmarked children', () => {
    let plainKilled = false
    const child = {
      pid: 4243,
      kill: () => {
        plainKilled = true

        return true
      },
    }

    const killed = killProcessTree(child, {
      platform: 'linux',
      killSignal: () => {
        throw new Error('must not group-signal unmarked child')
      },
    })

    assert.equal(killed, true)
    assert.equal(plainKilled, true)
  })

  it('falls back to plain kill when the group signal fails', () => {
    let plainKilled = false
    const child = {
      pid: 4244,
      kill: () => {
        plainKilled = true

        return true
      },
    }

    markDetachedProcess(child)

    const killed = killProcessTree(child, {
      platform: 'darwin',
      killSignal: () => {
        throw new Error('ESRCH')
      },
    })

    assert.equal(killed, true)
    assert.equal(plainKilled, true)
  })

  it('keeps the Windows taskkill branch intact', () => {
    const calls = []
    const child = { pid: 4245, kill: () => { throw new Error('must not plain-kill') } }

    const killed = killProcessTree(child, {
      platform: 'win32',
      spawnSync: (cmd, args) => {
        calls.push([cmd, args])

        return { status: 0 }
      },
    })

    assert.equal(killed, true)
    assert.deepEqual(calls, [[
      'taskkill',
      ['/pid', '4245', '/T', '/F'],
    ]])
  })
})
