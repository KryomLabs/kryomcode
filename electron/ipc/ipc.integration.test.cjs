// Headless IPC integration (Level 2B.7): registers the REAL handler
// tree against a stubbed Electron module and stubbed windows, then
// invokes handlers with trusted and untrusted senders. Services run
// for real against temp dirs with controlled dependencies. No
// network, no real dialogs, no Meta API calls, no git writes unless
// the git binary is present (those tests skip otherwise).
const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const Module = require('node:module')

const handlers = new Map()
const openedExternal = []
const dialogCalls = []

// Per-test dialog scripts. Tests set these; unexpected dialogs fail
// loudly so a new dialog call cannot slip through silently.
const dialogPlan = {
  open: null,
  save: null,
}

let userDataDir = ''

const stubElectron = {
  ipcMain: {
    handle: (channel, listener) => {
      handlers.set(channel, listener)
    },
    removeHandler: (channel) => {
      handlers.delete(channel)
    },
  },
  dialog: {
    showOpenDialog: async (window, options) => {
      dialogCalls.push({ kind: 'open', window, options })
      assert.ok(
        typeof dialogPlan.open === 'function',
        'unexpected open dialog'
      )

      return dialogPlan.open()
    },
    showSaveDialog: async (window, options) => {
      dialogCalls.push({ kind: 'save', window, options })
      assert.ok(
        typeof dialogPlan.save === 'function',
        'unexpected save dialog'
      )

      return dialogPlan.save()
    },
  },
  app: {
    getVersion: () => '0.1.0-test',
    getPath: (name) => {
      assert.equal(name, 'userData')

      return userDataDir
    },
  },
  shell: {
    openExternal: async (url) => {
      openedExternal.push(url)
    },
  },
}

// Installed before any electron/*.cjs require so both top-level and
// lazy require('electron') calls resolve to the stub. This file runs
// in its own test process, so the patch cannot leak into other files.
const originalLoad = Module._load

Module._load = function patchedLoad(request, ...rest) {
  if (request === 'electron') {
    return stubElectron
  }

  return originalLoad.call(this, request, ...rest)
}

const registerHandlers = require('./register-handlers.cjs')
const {
  createTrustedSender,
} = require('../security/trusted-sender.cjs')
const {
  setWorkspaceRoot,
} = require('../services/workspace/workspace.service.cjs')
const {
  createSession,
} = require('../services/research/session-store.cjs')

const trustedContents = { id: 'trusted-contents' }
const mainWindow = {
  isDestroyed: () => false,
  webContents: trustedContents,
}

// Real trust guard over stub windows: known webContents plus a
// main-frame app URL, mirroring main.cjs wiring.
const isTrustedSender = createTrustedSender(() => [mainWindow], {
  isTrustedAppUrl: (url) =>
    typeof url === 'string' && url.startsWith('kryom://app/'),
})

const uiStateNotifications = []
const uiContextNotifications = []
let workspaceOpenedCount = 0

registerHandlers({
  getMainWindow: () => mainWindow,
  getWindows: () => [mainWindow],
  isTrustedSender,
  onUIStateChanged: (state) => {
    uiStateNotifications.push(state)
  },
  onUIContext: (ctx) => {
    uiContextNotifications.push(ctx)
  },
  onWorkspaceOpened: () => {
    workspaceOpenedCount += 1
  },
})

function trustedEvent() {
  return {
    sender: trustedContents,
    senderFrame: { url: 'kryom://app/index.html', parent: null },
  }
}

function invoke(channel, event, ...args) {
  const listener = handlers.get(channel)

  assert.ok(listener, `no handler registered for ${channel}`)

  return listener(event, ...args)
}

function call(channel, ...args) {
  return invoke(channel, trustedEvent(), ...args)
}

function hasGit() {
  try {
    return spawnSync('git', ['--version']).status === 0
  } catch {
    return false
  }
}

const GIT_AVAILABLE = hasGit()

let sharedRoot = ''

async function makeTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function ensureWorkspace() {
  return setWorkspaceRoot(sharedRoot)
}

function clearSecrets() {
  const saved = {
    MODEL_API_KEY: process.env.MODEL_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    META_MODEL: process.env.META_MODEL,
  }

  delete process.env.MODEL_API_KEY
  delete process.env.TAVILY_API_KEY
  delete process.env.META_MODEL

  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function waitFor(check, timeoutMs = 10000) {
  const start = Date.now()

  for (;;) {
    const value = await check()

    if (value) {
      return value
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition.')
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describe('ipc integration', () => {
  before(async () => {
    userDataDir = await makeTempDir('kryom-ipc-userdata-')
    // Canonical from birth: the raw temp path can carry symlinked
    // ancestors (/var on macOS) that never string-match the resolved
    // paths services return for this workspace.
    sharedRoot = await fs.realpath(await makeTempDir('kryom-ipc-workspace-'))
    await fs.writeFile(
      path.join(sharedRoot, 'hello.txt'),
      'hello ipc\n'
    )
  })

  it('registers the full handler tree', () => {
    const expected = [
      'workspace:open',
      'workspace:open-file',
      'workspace:open-path',
      'workspace:close',
      'workspace:refresh',
      'workspace:read-file',
      'workspace:save-file',
      'filesystem:read-meta',
      'filesystem:save-conditional',
      'filesystem:create',
      'filesystem:rename',
      'filesystem:delete',
      'filesystem:save-as',
      'search:files',
      'context:read-file',
      'terminal:run',
      'terminal:cancel',
      'terminal:status',
      'terminal:classify',
      'ai:chat',
      'ai:cancel',
      'chat:save',
      'chat:restore',
      'chat:sessions',
      'chat:create',
      'chat:switch',
      'chat:rename',
      'chat:delete',
      'chat:search',
      'git:status',
      'git:cancel',
      'git:diff',
      'git:changed-files',
      'git:stage',
      'git:unstage',
      'git:discard',
      'git:commit',
      'git:push',
      'git:pull',
      'git:remotes',
      'git:verify',
      'git:clone',
      'diagnostics:run',
      'diagnostics:cancel',
      'diagnostics:quality',
      'diagnostics:quality-get',
      'diagnostics:quality-list',
      'diagnostics:support-preview',
      'diagnostics:support-export',
      'intelligence:summary',
      'intelligence:context',
      'intelligence:index-status',
      'intelligence:index-refresh',
      'intelligence:index-freshness',
      'intelligence:symbols',
      'intelligence:symbol',
      'intelligence:references',
      'intelligence:search',
      'intelligence:impact',
      'intelligence:architecture',
      'agent:plan',
      'agent:context',
      'agent:chat-excerpt',
      'agent:apply',
      'agent:change-set',
      'agent:checkpoints',
      'agent:undo',
      'agent:cancel',
      'agent:cancel-verification',
      'agent:track-plan',
      'agent:plans',
      'agent:plan-get',
      'agent:plan-step',
      'agent:plan-evidence',
      'agent:plan-verify',
      'agent:plan-cancel',
      'agent:plan-resume',
      'agent:plan-complete',
      'agent:repair-start',
      'agent:repair-propose',
      'agent:repair-apply',
      'agent:repair-record',
      'agent:repair-cancel',
      'agent:repair-get',
      'agent:impl-plan',
      'agent:impl-plan-revise',
      'agent:impl-plan-cancel',
      'agent:specialist-run',
      'agent:specialist-get',
      'agent:specialist-cancel',
      'agent:specialist-list',
      'agent:orch-start',
      'agent:orch-advance',
      'agent:orch-approve',
      'agent:orch-retry',
      'agent:orch-cancel',
      'agent:orch-get',
      'agent:orch-list',
      'agent:run-start',
      'agent:run-get',
      'agent:run-list',
      'agent:run-proposal',
      'agent:run-cancel',
      'agent:run-pause',
      'agent:run-resume',
      'agent:run-approve',
      'agent:run-reject',
      'settings:get',
      'settings:update',
      'research:start',
      'research:status',
      'research:active',
      'research:list',
      'research:get',
      'research:brief',
      'research:cancel',
      'research:resume',
      'research:select',
      'research:rename',
      'research:delete',
      'research:search',
      'research:export',
      'research:handoff',
      'app:get-version',
      'app:get-ai-status',
      'app:open-external',
      'dialog:pick-context-files',
      'ui:get',
      'ui:set',
      'ui:context',
      'documents:export-brief',
      'documents:export-text',
      'documents:import',
      'memory:list',
      'memory:get',
      'memory:create',
      'memory:update',
      'memory:delete',
      'memory:delete-all',
      'memory:export',
      'provider:list',
      'provider:get',
      'provider:selection',
      'provider:configure',
      'provider:models',
      'provider:model',
      'provider:test',
      'provider:set-key',
      'provider:remove-key',
      'provider:key-status',
      'permission:list',
      'permission:grants',
      'permission:check',
      'permission:grant',
      'permission:revoke',
      'audit:list',
      'extension:list',
      'extension:get',
      'extension:pick-directory',
      'extension:install',
      'extension:enable',
      'extension:disable',
      'extension:activate',
      'extension:deactivate',
      'extension:uninstall',
      'extension:command',
      'skill:list',
      'skill:get',
      'skill:save',
      'skill:delete',
      'skill:set-enabled',
      'skill:run',
      'workflow:list',
      'workflow:get',
      'workflow:save',
      'workflow:delete',
      'workflow:start',
      'workflow:advance',
      'workflow:approve',
      'workflow:resume',
      'workflow:cancel',
      'workflow:get-run',
      'workflow:runs',
      'integration:list',
      'integration:status',
      'integration:connect',
      'integration:disconnect',
      'integration:repositories',
      'integration:history',
      'template:list',
      'template:get',
      'template:pick-destination',
      'template:preview',
      'template:generate',
      'update:status',
      'update:check',
      'update:download',
      'update:cancel',
      'update:clear',
    ]

    for (const channel of expected) {
      assert.ok(handlers.has(channel), `missing ${channel}`)
    }

    assert.equal(handlers.size, expected.length)
  })

  it('rejects untrusted senders on every channel', async () => {
    for (const channel of handlers.keys()) {
      await assert.rejects(
        () => invoke(channel, { sender: {} }),
        /Unauthorized/,
        channel
      )
      await assert.rejects(
        () => invoke(channel, {}),
        /Unauthorized/,
        channel
      )
    }
  })

  it('validates the sender frame, not just the contents', async () => {
    const status = await call('terminal:status')

    assert.ok(Array.isArray(status.running))

    await assert.rejects(
      () =>
        invoke('terminal:status', {
          sender: trustedContents,
          senderFrame: { url: 'https://evil.example/', parent: null },
        }),
      /Unauthorized/
    )
    await assert.rejects(
      () =>
        invoke('terminal:status', {
          sender: trustedContents,
          senderFrame: { url: 'kryom://app/index.html', parent: {} },
        }),
      /Unauthorized/
    )
    await assert.rejects(
      () => invoke('terminal:status', { sender: trustedContents }),
      /Unauthorized/
    )
  })

  it('runs deep project intelligence channels end to end', async () => {
    await ensureWorkspace()
    await fs.writeFile(
      path.join(sharedRoot, 'widget.ts'),
      'export class Widget {\n  render() { return true }\n}\n'
    )

    const status = await call('intelligence:index-status')

    assert.equal(typeof status.indexed, 'boolean')

    const refreshed = await call('intelligence:index-refresh', {})

    assert.ok(refreshed.total >= 1)
    assert.ok(Array.isArray(refreshed.added))

    const architecture = await call('intelligence:architecture')

    assert.equal(typeof architecture.primaryLanguage, 'string')
    assert.ok(Array.isArray(architecture.modules))

    const symbols = await call('intelligence:symbols', { paths: ['widget.ts'] })

    assert.ok(symbols.symbols.some((entry) => entry.name === 'Widget'))

    const found = await call('intelligence:symbol', { name: 'Widget' })

    assert.equal(found.definitions.length, 1)

    const refs = await call('intelligence:references', { name: 'Widget' })

    assert.ok(refs.references.length >= 1)

    const search = await call('intelligence:search', { query: 'widget render' })

    assert.ok(search.results.some((entry) => entry.file === 'widget.ts'))

    const impact = await call('intelligence:impact', { paths: ['widget.ts'] })

    assert.deepEqual(impact.targets, ['widget.ts'])
    assert.ok(Array.isArray(impact.risks))

    const freshness = await call('intelligence:index-freshness', {
      paths: ['widget.ts'],
    })

    assert.equal(freshness.entries[0].status, 'current')

    await assert.rejects(
      () => call('intelligence:search', { query: '   ' }),
      /query/
    )
    await assert.rejects(
      () => call('intelligence:impact', { paths: [] }),
      /Invalid paths|at least one/
    )
  })

  it('gates intelligent planning on auth and validates input', async () => {
    await ensureWorkspace()

    const restore = clearSecrets()

    try {
      await assert.rejects(
        () => call('agent:impl-plan', { requirement: 'Add login' }),
        /API key is not configured/
      )
      await assert.rejects(
        () => call('agent:impl-plan', {}),
        /Invalid requirement/
      )
      await assert.rejects(
        () => call('agent:impl-plan-revise', { planId: 'pl-x' }),
        /Invalid change/
      )

      const idle = await call('agent:impl-plan-cancel')

      assert.equal(idle.cancelled, false)
    } finally {
      restore()
    }
  })

  it('gates specialist runs on auth and validates input', async () => {
    await ensureWorkspace()

    const restore = clearSecrets()

    try {
      await assert.rejects(
        () => call('agent:specialist-run', { specialist: 'research', task: 'x' }),
        /API key is not configured/
      )
      await assert.rejects(
        () => call('agent:specialist-run', { specialist: 'nope', task: 'x' }),
        /Invalid specialist/
      )
      await assert.rejects(
        () => call('agent:specialist-get', { runId: 'sp-bad' }),
        /Invalid specialist run id/
      )

      const listed = await call('agent:specialist-list')

      assert.ok(Array.isArray(listed.runs))

      const idle = await call('agent:specialist-cancel', {
        runId: 'sp-00000000-000000',
      })

      assert.equal(idle.cancelled, false)
    } finally {
      restore()
    }
  })

  it('builds quality reports through IPC without model calls', async () => {
    await ensureWorkspace()
    await fs.writeFile(
      path.join(sharedRoot, 'risky-sample.js'),
      'const token = "abc-123"\nmodule.exports = {}\n'
    )

    await call('intelligence:index-refresh', {})

    const report = await call('diagnostics:quality', { paths: ['risky-sample.js'] })

    assert.ok(report.id.startsWith('qr-'))
    assert.ok(report.security.findings.some((entry) => entry.file === 'risky-sample.js'))
    assert.ok(['clean', 'review', 'attention'].includes(report.verdict.verdict))

    const stored = await call('diagnostics:quality-get', { reportId: report.id })

    assert.equal(stored.id, report.id)

    const listed = await call('diagnostics:quality-list')

    assert.ok(listed.total >= 1)

    await assert.rejects(
      () => call('diagnostics:quality-get', { reportId: 'qr-00000000-000000' }),
      /not found/
    )
  })

  it('validates orchestration input and gates runs on approval', async () => {
    await ensureWorkspace()

    await assert.rejects(
      () => call('agent:orch-start', { planId: 'pl-nope', tasks: [] }),
      /not found|Invalid/i
    )
    await assert.rejects(
      () => call('agent:orch-start', { planId: 'pl-nope', tasks: 'nope' }),
      /Invalid tasks/
    )
    await assert.rejects(
      () => call('agent:orch-get', { runId: 'or-00000000-000000' }),
      /not found/
    )

    const listed = await call('agent:orch-list')

    assert.ok(Array.isArray(listed.runs))
  })

  it('gates agent runs on auth and validates run input', async () => {
    await ensureWorkspace()

    const restore = clearSecrets()

    try {
      await assert.rejects(
        () => call('agent:run-start', { task: 'Fix the build' }),
        /API key is not configured/
      )
      await assert.rejects(
        () => call('agent:run-start', {}),
        /Invalid task/
      )
      await assert.rejects(
        () => call('agent:run-start', { task: 'x', researchMode: 'sometimes' }),
        /research mode/
      )
      await assert.rejects(
        () => call('agent:run-start', { task: 'x', includeChat: 'yes' }),
        /includeChat/
      )
      await assert.rejects(
        () => call('agent:run-get', { runId: 'ar-00000000-000000' }),
        /not found/
      )
      await assert.rejects(
        () =>
          call('agent:run-proposal', {
            runId: 'ar-00000000-000000',
            subtask: 0,
          }),
        /not found/
      )
      await assert.rejects(
        () =>
          call('agent:run-proposal', {
            runId: 'ar-00000000-000000',
            subtask: 99,
          }),
        /Invalid subtask index/
      )
      await assert.rejects(
        () => call('agent:run-cancel', { runId: 'nope' }),
        /Invalid agent run id/
      )
      await assert.rejects(
        () => call('agent:run-pause', { runId: 'ar-00000000-000000' }),
        /not found/
      )
      await assert.rejects(
        () => call('agent:run-resume', { runId: 'ar-00000000-000000' }),
        /not found/
      )
      await assert.rejects(
        () =>
          call('agent:run-approve', {
            runId: 'ar-00000000-000000',
            approvalId: 'ap-00000000-000000',
          }),
        /not found/
      )
      await assert.rejects(
        () =>
          call('agent:run-reject', {
            runId: 'ar-00000000-000000',
            approvalId: 'bad',
          }),
        /not found/
      )

      const listed = await call('agent:run-list')

      assert.ok(Array.isArray(listed.runs))
      assert.ok(Array.isArray(listed.corrupt))
    } finally {
      restore()
    }
  })

  it('opens, refreshes, and closes a workspace through IPC', async () => {
    const opened = await call('workspace:open-path', sharedRoot)

    assert.ok(opened.root)
    assert.ok(Array.isArray(opened.tree))
    assert.ok(opened.tree.some((entry) => entry.name === 'hello.txt'))
    assert.ok(workspaceOpenedCount >= 1)

    const refreshed = await call('workspace:refresh')

    assert.equal(refreshed.root, opened.root)

    await assert.rejects(
      () => call('workspace:open-path', ''),
      /Invalid path/
    )
    await assert.rejects(
      () =>
        call(
          'workspace:open-path',
          path.join(sharedRoot, 'no-such-folder')
        ),
      /no longer exists/
    )
    await assert.rejects(
      () => call('workspace:open-path', path.join(sharedRoot, 'hello.txt')),
      /not a folder/
    )

    await call('workspace:close')
    await assert.rejects(() => call('workspace:refresh'), /Open a project/)
    await ensureWorkspace()
  })

  it('opens a project through the dialog stub', async () => {
    const target = await makeTempDir('kryom-ipc-dialog-')
    await fs.writeFile(path.join(target, 'note.txt'), 'dialog\n')

    dialogPlan.open = async () => ({ canceled: false, filePaths: [target] })

    try {
      const opened = await call('workspace:open')

      assert.ok(opened.root)
      assert.ok(opened.tree.some((entry) => entry.name === 'note.txt'))
      assert.equal(dialogCalls.at(-1).window, mainWindow)
    } finally {
      dialogPlan.open = null
      await ensureWorkspace()
    }

    dialogPlan.open = async () => ({ canceled: true, filePaths: [] })

    try {
      assert.equal(await call('workspace:open'), null)
    } finally {
      dialogPlan.open = null
    }
  })

  it('creates, reads, renames, and deletes files through IPC', async () => {
    await ensureWorkspace()

    const created = await call('filesystem:create', {
      path: 'ipc-note.txt',
      type: 'file',
      content: 'v1',
    })

    assert.ok(created.path)

    const read = await call('workspace:read-file', created.path)

    assert.equal(read, 'v1')

    const meta = await call('filesystem:read-meta', created.path)

    assert.equal(meta.content, 'v1')

    const saved = await call('workspace:save-file', created.path, 'v2')
    const reread = await call('workspace:read-file', created.path)

    assert.equal(saved.success, true)
    assert.equal(reread, 'v2')

    const renamed = await call('filesystem:rename', {
      oldPath: created.path,
      newPath: path.join(sharedRoot, 'ipc-renamed.txt'),
    })

    assert.ok(renamed.path)

    const deleted = await call('filesystem:delete', renamed.path)

    assert.equal(deleted.success, true)
    await assert.rejects(
      () => call('workspace:read-file', renamed.path),
      /not exist|ENOENT|outside/i
    )
  })

  it('rejects traversal and malformed filesystem input', async () => {
    await ensureWorkspace()

    await assert.rejects(
      () => call('workspace:read-file', '../../outside.txt'),
      /outside|traversal|Invalid/i
    )
    await assert.rejects(
      () => call('filesystem:create', { path: 'x.txt', type: 'link' }),
      /Invalid type/
    )
    await assert.rejects(
      () => call('search:files', { query: 'hello', mode: 'fuzzy' }),
      /Invalid mode/
    )

    const hits = await call('search:files', { query: 'hello', mode: 'name' })
    const names = hits.matches.map((match) => match.relativePath)

    assert.ok(names.some((name) => name.endsWith('hello.txt')))
  })

  it('classifies, runs, and cancels terminal commands through IPC', async () => {
    await ensureWorkspace()

    const clean = await call('terminal:classify', { command: 'echo hi' })

    assert.deepEqual(clean.warnings, [])

    const flagged = await call('terminal:classify', {
      command: 'rm -rf /tmp/x',
    })

    assert.ok(flagged.warnings.length > 0)

    await assert.rejects(
      () => call('terminal:classify', {}),
      /Invalid command/
    )
    await assert.rejects(
      () => call('terminal:run', ''),
      /valid command/
    )

    const ran = await call('terminal:run', 'echo kryom-ok')

    assert.equal(ran.exitCode, 0)
    assert.match(ran.output, /kryom-ok/)
    assert.equal(ran.cancelled, false)

    const pending = call(
      'terminal:run',
      'node -e "setTimeout(() => {}, 30000)"'
    )

    await waitFor(async () => {
      const status = await call('terminal:status')

      return status.running.length >= 1
    })

    const cancelled = await call('terminal:cancel')

    assert.ok(cancelled.killed >= 1)

    const settled = await pending

    assert.equal(settled.cancelled, true)
  })

  it('cancels diagnostics and terminal scopes independently', async () => {
    await ensureWorkspace()

    const diagnosticsPending = call('diagnostics:run', {
      command: 'node -e "setTimeout(() => {}, 30000)"',
    })
    const terminalPending = call(
      'terminal:run',
      'node -e "setTimeout(() => {}, 30000)"'
    )

    await waitFor(async () => {
      const status = await call('terminal:status')

      return (
        status.running.some((entry) => entry.origin === 'diagnostics') &&
        status.running.some((entry) => entry.origin === 'user-terminal')
      )
    })

    const diagnosticsCancelled = await call('diagnostics:cancel')

    assert.equal(diagnosticsCancelled.killed, 1)

    const diagnosticsResult = await diagnosticsPending

    assert.equal(diagnosticsResult.cancelled, true)

    const status = await call('terminal:status')

    assert.ok(
      status.running.some((entry) => entry.origin === 'user-terminal')
    )

    // No agent runs are in flight: the agent channel reports zero and
    // touches nothing.
    const agentCancelled = await call('agent:cancel-verification')

    assert.deepEqual(agentCancelled, { killed: 0 })

    await call('terminal:cancel')

    const terminalResult = await terminalPending

    assert.equal(terminalResult.cancelled, true)
  })

  it('runs diagnostics and intelligence summaries through IPC', async () => {
    await ensureWorkspace()

    const diagnostics = await call('diagnostics:run', {
      command: 'echo all-clean',
    })

    assert.equal(diagnostics.success, true)
    assert.deepEqual(diagnostics.diagnostics, [])

    await assert.rejects(
      () => call('diagnostics:run', {}),
      /Invalid command/
    )

    const summary = await call('intelligence:summary')

    assert.ok(summary)
    assert.equal(typeof summary, 'object')

    const context = await call('intelligence:context', { maxChars: 2000 })

    assert.ok(context)
  })

  it('reports service errors without an open workspace', async () => {
    await call('workspace:close')

    try {
      await assert.rejects(
        () => call('intelligence:summary'),
        /Open a project/
      )
      await assert.rejects(() => call('terminal:run', 'echo hi'), /Open a project/)
    } finally {
      await ensureWorkspace()
    }
  })

  it('saves and restores chat history through IPC', async () => {
    await ensureWorkspace()

    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi back' },
    ]

    const saved = await call('chat:save', { messages })

    assert.equal(saved.saved, true)

    const restored = await call('chat:restore')

    assert.equal(restored.restored, true)
    assert.deepEqual(restored.messages, messages)

    await assert.rejects(
      () => call('chat:save', { messages: 'nope' }),
      /Invalid chat history/
    )
  })

  it('manages chat sessions and context excerpts through IPC', async () => {
    await ensureWorkspace()

    const created = await call('chat:create', { title: 'IPC chat' })

    assert.ok(created.id.startsWith('ch-'))
    assert.equal(created.title, 'IPC chat')

    await call('chat:save', { messages: [{ role: 'user', content: 'session two' }] })

    const listed = await call('chat:sessions')

    assert.equal(listed.activeId, created.id)
    assert.ok(listed.sessions.some((entry) => entry.id === 'general'))
    assert.ok(listed.sessions.some((entry) => entry.id === created.id))

    const renamed = await call('chat:rename', { id: created.id, title: 'Renamed' })

    assert.equal(renamed.title, 'Renamed')

    const found = await call('chat:search', { query: 'session two' })

    assert.equal(found.query, 'session two')
    assert.equal(found.matches.length, 1)
    assert.equal(found.matches[0].id, created.id)
    assert.ok(found.matches[0].snippet.includes('session two'))

    const empty = await call('chat:search', { query: '   ' })

    assert.deepEqual(empty.matches, [])

    const back = await call('chat:switch', { id: 'general' })

    assert.equal(back.id, 'general')

    const removed = await call('chat:delete', { id: created.id })

    assert.equal(removed.deleted, true)

    await assert.rejects(() => call('chat:switch', { id: 'Bad id!' }), /Invalid/)

    const excerpt = await call('context:read-file', {
      path: path.join(sharedRoot, 'hello.txt'),
    })

    assert.equal(excerpt.name, 'hello.txt')
    assert.equal(excerpt.truncated, false)
    assert.match(excerpt.excerpt, /hello ipc/)

    await assert.rejects(
      () => call('context:read-file', { path: path.join(sharedRoot, 'nope.txt') }),
      /not found/
    )

    dialogPlan.open = async () => ({
      canceled: false,
      filePaths: [path.join(sharedRoot, 'hello.txt')],
    })

    try {
      const picked = await call('dialog:pick-context-files')

      assert.equal(picked.canceled, false)
      assert.deepEqual(picked.paths, [path.join(sharedRoot, 'hello.txt')])
    } finally {
      dialogPlan.open = null
    }
  })

  it('validates AI chat requests before any provider use', async () => {
    const restoreEnv = clearSecrets()

    try {
      await assert.rejects(
        () => call('ai:chat', { prompt: '   ' }),
        /Enter a prompt/
      )
      await assert.rejects(
        () => call('ai:chat', { prompt: 'hello' }),
        /not configured/
      )

      const cancelled = await call('ai:cancel')

      assert.deepEqual(cancelled, { cancelled: false })
    } finally {
      restoreEnv()
    }
  })

  it('gathers agent context without transmitting anything', async () => {
    await ensureWorkspace()

    const gathered = await call('agent:context', {
      paths: [path.join(sharedRoot, 'hello.txt')],
    })

    assert.equal(gathered.files.length, 1)
    assert.equal(gathered.files[0].relativePath, 'hello.txt')
    assert.ok(!('content' in gathered.files[0]))

    await assert.rejects(
      () => call('agent:context', { paths: 'hello.txt' }),
      /Invalid context paths/
    )
  })

  it('applies, checkpoints, and undoes agent edits through IPC', async () => {
    await ensureWorkspace()

    const applied = await call('agent:apply', {
      task: 'ipc integration checkpoint',
      edits: [
        {
          action: 'create',
          path: path.join(sharedRoot, 'ipc-applied.txt'),
          content: 'applied\n',
        },
      ],
    })

    assert.equal(applied.completed, true)
    assert.equal(applied.cancelled, false)
    assert.equal(
      await fs.readFile(path.join(sharedRoot, 'ipc-applied.txt'), 'utf8'),
      'applied\n'
    )

    const { checkpoints } = await call('agent:checkpoints')

    assert.ok(checkpoints.length >= 1)
    assert.ok(checkpoints[0].id)

    const undone = await call('agent:undo', {})

    assert.equal(undone.restored.length, 1)

    await assert.rejects(
      () => fs.stat(path.join(sharedRoot, 'ipc-applied.txt')),
      /ENOENT/
    )

    await assert.rejects(
      () => call('agent:apply', { edits: 'nope' }),
      /No approved edits were provided/
    )

    const cancelled = await call('agent:cancel')

    assert.deepEqual(cancelled, { cancelled: false })
  })

  it('returns structured stale findings through agent:apply', async () => {
    await ensureWorkspace()

    const target = path.join(sharedRoot, 'ipc-stale.txt')

    await fs.writeFile(target, 'planned\n')

    const digest = crypto
      .createHash('sha256')
      .update('planned\n', 'utf8')
      .digest('hex')

    // The file moves after planning and before apply.
    await fs.writeFile(target, 'user rewrite\n')

    const blocked = await call('agent:apply', {
      edits: [
        {
          action: 'modify',
          path: target,
          content: 'planned v2\n',
          originalDigest: digest,
          originalLength: 8,
        },
      ],
    })

    assert.equal(blocked.completed, false)
    assert.equal(blocked.stale.length, 1)
    assert.equal(blocked.stale[0].path, 'ipc-stale.txt')
    assert.equal(blocked.stale[0].status, 'stale')
    assert.equal(await fs.readFile(target, 'utf8'), 'user rewrite\n')
  })

  it('rejects conflicting batches through agent:apply', async () => {
    await ensureWorkspace()

    const target = path.join(sharedRoot, 'ipc-dupe.txt')

    await fs.writeFile(target, 'planned\n')

    const digest = crypto
      .createHash('sha256')
      .update('planned\n', 'utf8')
      .digest('hex')
    const edit = (content) => ({
      action: 'modify',
      path: target,
      content,
      originalDigest: digest,
      originalLength: 8,
    })

    const blocked = await call('agent:apply', {
      edits: [edit('a\n'), edit('b\n')],
    })

    assert.equal(blocked.completed, false)
    assert.deepEqual(blocked.conflicts, [{ path: 'ipc-dupe.txt', indexes: [0, 1] }])
    assert.equal(await fs.readFile(target, 'utf8'), 'planned\n')
  })

  it('builds change-set manifests through agent:change-set', async () => {
    await ensureWorkspace()

    const base = path.join(sharedRoot, 'ipc-cs-base.ts')
    const top = path.join(sharedRoot, 'ipc-cs-top.ts')

    await fs.writeFile(base, 'export const b = 1\n')
    await fs.writeFile(top, "import './ipc-cs-base'\n")

    const digestOf = (buffer) =>
      crypto.createHash('sha256').update(buffer).digest('hex')
    const baseBytes = await fs.readFile(base)
    const topBytes = await fs.readFile(top)

    const manifest = await call('agent:change-set', {
      edits: [
        {
          index: 0,
          action: 'modify',
          path: top,
          content: "import './ipc-cs-base'\nexport const t = 1\n",
          originalDigest: digestOf(topBytes),
          originalLength: topBytes.length,
        },
        {
          index: 1,
          action: 'modify',
          path: base,
          content: 'export const b = 2\n',
          originalDigest: digestOf(baseBytes),
          originalLength: baseBytes.length,
        },
      ],
    })

    assert.equal(manifest.validation.ok, true)
    assert.deepEqual(manifest.order, [1, 0])

    // Conflicting edits block through the boundary too.
    const conflicted = await call('agent:change-set', {
      edits: [
        {
          index: 0,
          action: 'modify',
          path: base,
          content: 'x\n',
          originalDigest: digestOf(baseBytes),
          originalLength: baseBytes.length,
        },
        {
          index: 1,
          action: 'modify',
          path: base,
          content: 'y\n',
          originalDigest: digestOf(baseBytes),
          originalLength: baseBytes.length,
        },
      ],
    })

    assert.equal(conflicted.validation.ok, false)

    await assert.rejects(
      () => call('agent:change-set', { edits: 'nope' }),
      /an array is required/
    )

    const { senderFrame: _dropped, ...untrusted } = trustedEvent()

    await assert.rejects(
      () => invoke('agent:change-set', untrusted, { edits: [] }),
      /Unauthorized agent request/
    )
  })

  it('validates agent plans without reaching the provider', async () => {
    const restoreEnv = clearSecrets()

    try {
      await assert.rejects(
        () => call('agent:plan', { task: '' }),
        /Invalid task/
      )
      await assert.rejects(
        () =>
          call('agent:plan', {
            task: 'do things',
            researchSessionId: '   ',
          }),
        /Invalid research session id/
      )
      await assert.rejects(
        () => call('agent:plan', { task: 'do things' }),
        /not configured/
      )
    } finally {
      restoreEnv()
    }
  })

  it('drives research sessions through IPC without network runs', async () => {
    await ensureWorkspace()

    const session = await createSession('ipc integration objective')

    const status = await call('research:status', { id: session.id })

    assert.equal(status.id, session.id)

    const fetched = await call('research:get', { id: session.id })

    assert.equal(fetched.objective, 'ipc integration objective')

    const listed = await call('research:list')

    assert.ok(listed.some((entry) => entry.id === session.id))

    const selected = await call('research:select', { id: session.id })

    assert.equal(selected.id, session.id)

    const active = await call('research:active')

    assert.equal(active.id, session.id)

    // Idle session: cancel records intent but keeps a truthful status
    // and never starts the background network run.
    const cancelled = await call('research:cancel', { id: session.id })

    assert.equal(cancelled.id, session.id)
    assert.notEqual(cancelled.status, 'running')

    await assert.rejects(() => call('research:get', {}), /Invalid id/)
    await assert.rejects(
      () => call('research:get', { id: 'no-such-session' }),
      /not found|ENOENT|no such/i
    )
  })

  it('renames, searches, exports, hands off, and deletes research through IPC', async () => {
    await ensureWorkspace()

    const session = await createSession('ipc deep-research lifecycle')
    const { writeSession } = require('../services/research/session-store.cjs')

    session.sources = [
      {
        id: 'src-ipc1',
        provider: 'openalex',
        title: 'IPC Paper',
        url: 'https://example.com/ipc',
        authors: ['IPC Author'],
        publishedAt: '2024-01-01',
        abstract: 'Evidence about IPC lifecycle handling.',
        venue: 'Test Venue',
        doi: null,
        sourceType: 'paper-open',
        accessStatus: 'open',
        excerpt: '',
      },
    ]
    session.findings = [
      { claim: 'IPC lifecycle works end to end.', sourceIndexes: [1], confidence: 'medium', note: 'test' },
    ]
    session.brief = { version: 1, markdown: '# Brief\n\nClaim [1].\n', generatedAt: new Date().toISOString(), via: 'test' }
    session.status = 'completed'
    await writeSession(session)

    const renamed = await call('research:rename', { id: session.id, name: 'IPC Renamed' })

    assert.equal(renamed.name, 'IPC Renamed')

    const found = await call('research:search', { query: 'ipc deep-research' })

    assert.ok(found.some((entry) => entry.id === session.id))

    const exported = await call('research:export', { id: session.id, format: 'html' })

    assert.equal(exported.id, session.id)
    assert.match(exported.content, /IPC Paper/)
    assert.match(exported.content, /example\.com\/ipc/)

    const markdown = await call('research:export', { id: session.id, format: 'markdown' })

    assert.match(markdown.content, /Claim \[1\]/)

    const handoff = await call('research:handoff', { id: session.id, target: 'agent-brief' })

    assert.match(handoff.text, /UNTRUSTED/)
    assert.match(handoff.text, /IPC lifecycle works/)

    await assert.rejects(
      () => call('research:rename', { id: session.id, name: '  ' }),
      /Invalid name/
    )
    await assert.rejects(
      () => call('research:export', { id: session.id, format: 'pdf' }),
      /Invalid format/
    )
    await assert.rejects(
      () => call('research:handoff', { id: session.id, findingIndexes: ['x'] }),
      /Invalid findingIndexes/
    )

    const deleted = await call('research:delete', { id: session.id })

    assert.deepEqual(deleted, { id: session.id, deleted: true })
    await assert.rejects(
      () => call('research:get', { id: session.id }),
      /not found/i
    )
  })

  it('reads and updates settings through IPC', async () => {
    const initial = await call('settings:get')

    assert.equal(initial.confirmAllCommands, false)

    const updated = await call('settings:update', {
      confirmAllCommands: true,
    })

    assert.equal(updated.confirmAllCommands, true)
    assert.equal((await call('settings:get')).confirmAllCommands, true)

    await call('settings:update', { confirmAllCommands: false })

    await assert.rejects(
      () => call('settings:update', []),
      /Invalid settings patch/
    )
    await assert.rejects(
      () => call('settings:update', { confirmAllCommands: 'yes' }),
      /confirmAllCommands/
    )
  })

  it('serves app info, guarded external links, and UI state', async () => {
    const restoreEnv = clearSecrets()

    try {
      const version = await call('app:get-version')

      assert.equal(version.version, '0.1.0-test')
      assert.equal(version.platform, process.platform)

      const aiStatus = await call('app:get-ai-status')

      assert.deepEqual(aiStatus, {
        modelKeyConfigured: false,
        researchKeyConfigured: false,
        modelKeySource: 'missing',
        researchKeySource: 'missing',
        vaultAvailable: false,
      })
    } finally {
      restoreEnv()
    }

    const before = openedExternal.length
    const opened = await call('app:open-external', 'https://example.com/x')

    assert.deepEqual(opened, { success: true })
    assert.equal(openedExternal.length, before + 1)
    assert.equal(openedExternal.at(-1), 'https://example.com/x')

    await assert.rejects(
      () => call('app:open-external', 'file:///etc/passwd'),
      /only http/
    )
    assert.equal(openedExternal.length, before + 1)

    const seen = uiStateNotifications.length
    const state = await call('ui:set', { autoSave: false })

    assert.equal(state.autoSave, false)
    assert.equal(uiStateNotifications.length, seen + 1)

    const fetched = await call('ui:get')

    assert.equal(fetched.autoSave, false)

    await call('ui:set', { autoSave: true })

    const ctxSeen = uiContextNotifications.length
    const ctx = await call('ui:context', {
      hasWorkspace: true,
      dirtyCount: -5,
      title: 42,
    })

    assert.deepEqual(ctx, { success: true })
    assert.equal(uiContextNotifications.length, ctxSeen + 1)
    assert.equal(uiContextNotifications.at(-1).dirtyCount, 0)
    assert.equal(uiContextNotifications.at(-1).title, '')
  })

  it('exports and imports documents through dialog stubs', async () => {
    await ensureWorkspace()

    const destination = path.join(sharedRoot, 'ipc-export.docx')

    dialogPlan.save = async () => ({ canceled: false, filePath: destination })

    try {
      const exported = await call('documents:export-text', {
        title: 'IPC brief',
        markdown: '# Hello\n\nBody text.\n',
        template: 'report',
      })

      assert.equal(exported.path, destination)
      assert.ok(exported.bytes > 0)
    } finally {
      dialogPlan.save = null
    }

    dialogPlan.save = async () => ({ canceled: true })

    try {
      assert.equal(
        await call('documents:export-text', {
          title: 'Cancelled',
          markdown: 'x',
          template: 'report',
        }),
        null
      )
    } finally {
      dialogPlan.save = null
    }

    await assert.rejects(
      () =>
        call('documents:export-text', { title: 'Bad', markdown: 42 }),
      /Invalid markdown/
    )

    dialogPlan.open = async () => ({
      canceled: false,
      filePaths: [destination],
    })

    try {
      const imported = await call('documents:import')

      assert.match(imported.text, /Hello/)
    } finally {
      dialogPlan.open = null
    }
  })

  it('manages project memories through IPC', async () => {
    await ensureWorkspace()
    await fs.writeFile(path.join(sharedRoot, 'memory-src.txt'), 'source\n')

    const created = await call('memory:create', {
      type: 'convention',
      title: 'IPC memory',
      content: 'Test through the bridge.',
      sources: [{ kind: 'file', path: 'memory-src.txt' }],
    })

    assert.equal(created.type, 'convention')
    assert.equal(created.sources[0].path, 'memory-src.txt')
    assert.equal(created.stale, false)

    const fetched = await call('memory:get', { id: created.id })

    assert.equal(fetched.content, 'Test through the bridge.')

    const listed = await call('memory:list')

    assert.ok(listed.records.some((record) => record.id === created.id))
    assert.deepEqual(listed.corrupt, [])

    const updated = await call('memory:update', {
      id: created.id,
      content: 'Updated through the bridge.',
    })

    assert.equal(updated.content, 'Updated through the bridge.')

    await assert.rejects(
      () => call('memory:create', { type: 'rumor', content: 'x' }),
      /Invalid type/
    )
    await assert.rejects(
      () => call('memory:get', { id: 'mem-missing' }),
      /Memory not found/
    )

    const deleted = await call('memory:delete', { id: created.id })

    assert.deepEqual(deleted, { deleted: true, id: created.id })
  })

  it('exports memories and deletes them all through IPC', async () => {
    await ensureWorkspace()

    const created = await call('memory:create', {
      type: 'fact',
      content: 'Back me up.',
    })

    const destination = path.join(sharedRoot, 'ipc-memories.json')

    dialogPlan.save = async () => ({ canceled: false, filePath: destination })

    try {
      const exported = await call('memory:export')

      assert.equal(exported.cancelled, false)
      assert.equal(exported.path, destination)
      assert.ok(exported.exported >= 1)

      const parsed = JSON.parse(await fs.readFile(destination, 'utf8'))

      assert.equal(parsed.kind, 'kryom-memory-export')
      assert.ok(parsed.records.some((record) => record.id === created.id))
    } finally {
      dialogPlan.save = null
    }

    await fs.unlink(destination)

    dialogPlan.save = async () => ({ canceled: false, filePath: path.join(sharedRoot, 'x.txt') })

    try {
      await assert.rejects(() => call('memory:export'), /must be a \.json file/)
    } finally {
      dialogPlan.save = null
    }

    dialogPlan.save = async () => ({ canceled: true })

    try {
      assert.deepEqual(await call('memory:export'), { cancelled: true })
    } finally {
      dialogPlan.save = null
    }

    const cleared = await call('memory:delete-all')

    assert.ok(cleared.deleted.includes(created.id))
    assert.deepEqual(cleared.failed, [])
    assert.deepEqual((await call('memory:list')).records, [])
  })

  it('tracks plan progress and verification through IPC', async () => {
    await ensureWorkspace()

    const tracked = await call('agent:track-plan', {
      proposal: {
        model: 'muse-spark-1.3',
        task: 'IPC tracked work.',
        edits: [],
        commands: ['npm test'],
        notes: '',
        expectedOutcome: 'Green suite.',
        risks: [
          {
            severity: 'low',
            explanation: 'Slow suite.',
            mitigation: 'Run once.',
          },
        ],
        suggestedSteps: ['Do the work'],
      },
    })

    assert.equal(tracked.objective, 'IPC tracked work.')
    assert.equal(tracked.expectedOutcome, 'Green suite.')
    assert.equal(tracked.risks.length, 1)
    assert.deepEqual(
      tracked.steps.map((step) => step.id),
      ['review', 'task-1', 'apply', 'verify']
    )

    const listed = await call('agent:plans')

    assert.ok(listed.plans.some((plan) => plan.id === tracked.id))

    await call('agent:plan-step', {
      id: tracked.id,
      stepId: 'review',
      state: 'in_progress',
    })
    await call('agent:plan-step', {
      id: tracked.id,
      stepId: 'review',
      state: 'completed',
    })

    // Skipping straight to verified is rejected at the IPC boundary.
    await assert.rejects(
      () =>
        call('agent:plan-step', {
          id: tracked.id,
          stepId: 'verify',
          state: 'verified',
        }),
      /cannot move from pending to verified/
    )

    await call('agent:plan-step', {
      id: tracked.id,
      stepId: 'verify',
      state: 'in_progress',
    })

    const passing = await call('diagnostics:run', {
      command: 'node --version',
    })

    const recorded = await call('agent:plan-verify', {
      planId: tracked.id,
      stepId: 'verify',
      check: 'npm test',
      result: 'pass',
      executionRunId: passing.diagnosis.runId,
      markStep: 'verified',
    })

    assert.equal(recorded.report.liveProvider, false)
    assert.equal(
      recorded.plan.steps.find((step) => step.id === 'verify').state,
      'verified'
    )
    assert.equal(recorded.plan.verification, 'verified')

    await assert.rejects(
      () => call('agent:track-plan', { proposal: { task: '' } }),
      /Invalid plan objective/
    )
    await assert.rejects(
      () => call('agent:plan-step', { id: tracked.id, stepId: 'review', state: 'bogus' }),
      /Invalid state/
    )
  })

  it('carries a diagnosis from diagnostics:run to a stored report', async () => {
    await ensureWorkspace()

    const failed = await call('diagnostics:run', {
      command: 'node -e "console.log(\'not ok 1 - adds\'); process.exit(1)"',
    })

    assert.equal(failed.success, false)
    assert.equal(failed.diagnosis.provenance, 'executed')
    assert.equal(failed.diagnosis.findings[0].category, 'assertion_failure')

    const tracked = await call('agent:track-plan', {
      proposal: {
        model: 'muse-spark-1.3',
        task: 'IPC diagnosis linkage.',
        edits: [],
        commands: ['npm test'],
        notes: '',
      },
    })

    await call('agent:plan-step', {
      id: tracked.id,
      stepId: 'verify',
      state: 'in_progress',
    })

    const recorded = await call('agent:plan-verify', {
      planId: tracked.id,
      stepId: 'verify',
      check: 'npm test',
      result: 'fail',
      executionRunId: failed.diagnosis.runId,
      diagnosis: failed.diagnosis,
      markStep: 'failed',
    })

    assert.equal(recorded.report.result, 'fail')
    assert.equal(recorded.report.conclusion, 'failed')
    assert.equal(recorded.report.execution.runId, failed.diagnosis.runId)
    assert.equal(
      recorded.report.diagnosis.runId,
      failed.diagnosis.runId
    )
    assert.equal(
      recorded.report.diagnosis.findings[0].category,
      'assertion_failure'
    )

    const fetched = await call('agent:plan-get', { id: tracked.id })
    const stored = fetched.reports.find(
      (entry) => entry.id === recorded.report.id
    )

    assert.equal(stored.diagnosis.runId, failed.diagnosis.runId)

    // A corrupt diagnosis is rejected at the boundary, not stored.
    await assert.rejects(
      () =>
        call('agent:plan-verify', {
          planId: tracked.id,
          stepId: 'verify',
          check: 'npm test',
          result: 'fail',
          executionRunId: failed.diagnosis.runId,
          diagnosis: { ...failed.diagnosis, status: 'gremlins' },
        }),
      /Invalid verification diagnosis/
    )

    // A forged run id is rejected: facts must come from an observed
    // execution in this session.
    await assert.rejects(
      () =>
        call('agent:plan-verify', {
          planId: tracked.id,
          stepId: 'verify',
          check: 'npm test',
          result: 'pass',
          executionRunId: 'dg-forged-00000000',
        }),
      /not observed in this session/
    )

    // A success claim on a failing run is rejected, not recorded.
    await assert.rejects(
      () =>
        call('agent:plan-verify', {
          planId: tracked.id,
          stepId: 'verify',
          check: 'npm test',
          result: 'pass',
          executionRunId: failed.diagnosis.runId,
        }),
      /does not match the observed execution/
    )

    // Skipped checks record distinctly without an execution.
    const skipped = await call('agent:plan-verify', {
      planId: tracked.id,
      stepId: 'verify',
      check: 'slow e2e',
      result: 'skip',
      output: 'Skipped by the user in the smoke run.',
    })

    assert.equal(skipped.report.conclusion, 'skipped')
    assert.equal(skipped.report.execution, null)

    // Untrusted senders cannot store diagnoses.
    const { senderFrame: _dropped, ...untrusted } = trustedEvent()

    await assert.rejects(
      () =>
        invoke('agent:plan-verify', untrusted, {
          planId: tracked.id,
          stepId: 'verify',
          check: 'npm test',
          result: 'fail',
          executionRunId: failed.diagnosis.runId,
          diagnosis: failed.diagnosis,
        }),
      /Unauthorized/
    )
  })

  it('drives a repair cycle through IPC with seeded states', async () => {
    await ensureWorkspace()

    const failed = await call('diagnostics:run', {
      command: 'node -e "console.log(\'not ok 1 - adds\'); process.exit(1)"',
    })

    const tracked = await call('agent:track-plan', {
      proposal: {
        model: 'muse-spark-1.3',
        task: 'IPC repair cycle.',
        edits: [],
        commands: ['npm test'],
        notes: '',
      },
    })

    const { cycle: started } = await call('agent:repair-start', {
      planId: tracked.id,
      check: 'npm test',
      diagnosis: failed.diagnosis,
    })

    assert.equal(started.state, 'awaiting-proposal')
    assert.equal(started.planId, tracked.id)

    const fetched = await call('agent:repair-get', { cycleId: started.id })

    assert.equal(fetched.cycle.id, started.id)

    // Propose validates without reaching the provider: malformed
    // and unknown ids reject before any model call.
    await assert.rejects(() => call('agent:repair-propose', {}), /cycle id/)
    await assert.rejects(
      () => call('agent:repair-propose', { cycleId: 'rc-missing-000000' }),
      /was not found/
    )
    await assert.rejects(
      () => call('agent:repair-start', { planId: tracked.id, check: '' }),
      /check/
    )

    // Seed the approval state directly: proposal generation needs a
    // provider, which IPC tests never touch.
    const cycleFile = path.join(
      sharedRoot,
      '.kryom',
      'repairs',
      started.id,
      'cycle.json'
    )
    const seedAttempt = {
      n: 1,
      attemptId: `${started.id}-a1`,
      proposal: { edits: [] },
      checkpointId: null,
      appliedFiles: [],
      reportId: null,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
    }
    const stored = JSON.parse(await fs.readFile(cycleFile, 'utf8'))

    await fs.writeFile(
      cycleFile,
      JSON.stringify({
        ...stored,
        state: 'awaiting-approval',
        attempts: [seedAttempt],
      })
    )

    await assert.rejects(
      () =>
        call('agent:repair-apply', {
          cycleId: started.id,
          attemptId: `${started.id}-a9`,
          edits: [],
        }),
      /does not match/
    )
    await assert.rejects(
      () =>
        call('agent:repair-apply', {
          cycleId: started.id,
          attemptId: seedAttempt.attemptId,
          edits: 'nope',
        }),
      /an array is required/
    )

    const target = path.join(sharedRoot, 'ipc-repair.txt')
    const { cycle: applied, apply } = await call('agent:repair-apply', {
      cycleId: started.id,
      attemptId: seedAttempt.attemptId,
      edits: [{ path: target, action: 'create', content: 'repaired\n' }],
    })

    assert.equal(apply.completed, true)
    assert.equal(applied.state, 'awaiting-verification')
    assert.ok(applied.attempts[0].checkpointId)
    assert.equal(await fs.readFile(target, 'utf8'), 'repaired\n')

    await assert.rejects(
      () =>
        call('agent:repair-record', {
          cycleId: started.id,
          attemptId: `${started.id}-a9`,
          executionRunId: failed.diagnosis.runId,
        }),
      /does not match/
    )

    await assert.rejects(
      () =>
        call('agent:repair-record', {
          cycleId: started.id,
          attemptId: seedAttempt.attemptId,
          executionRunId: 'dg-forged-00000000',
        }),
      /not observed in this session/
    )

    const { cycle: recorded, report } = await call('agent:repair-record', {
      cycleId: started.id,
      attemptId: seedAttempt.attemptId,
      executionRunId: failed.diagnosis.runId,
    })

    assert.equal(report.result, 'fail')
    assert.equal(report.conclusion, 'failed')
    assert.equal(report.execution.runId, failed.diagnosis.runId)
    assert.equal(report.repair.cycleId, started.id)
    assert.equal(report.repair.attempt, 1)
    assert.equal(recorded.state, 'awaiting-proposal')
    assert.equal(recorded.remainingAttempts, 1)

    const { cycle: cancelled } = await call('agent:repair-cancel', {
      cycleId: started.id,
    })

    assert.equal(cancelled.state, 'cancelled')

    await assert.rejects(
      () => call('agent:repair-get', { cycleId: 'nope' }),
      /Invalid repair cycle id/
    )
  })

  it('previews chat excerpts and validates chat opt-in through IPC', async () => {
    const { setWorkspaceRoot } = require('../services/workspace/workspace.service.cjs')
    const fresh = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-ipc-ctx-'))

    await setWorkspaceRoot(fresh)

    try {
      await assert.rejects(() => call('agent:chat-excerpt'), /No chat history/)

      await call('chat:save', {
        messages: [{ role: 'user', content: 'ipc excerpt check' }],
      })

      const excerpt = await call('agent:chat-excerpt')

      assert.equal(excerpt.messageCount, 1)
      assert.ok(excerpt.excerpt.includes('ipc excerpt check'))

      // Chat history is per-project: nothing leaks across workspaces.
      const other = await fs.mkdtemp(path.join(os.tmpdir(), 'kryom-ipc-ctx-'))

      await setWorkspaceRoot(other)
      await assert.rejects(() => call('agent:chat-excerpt'), /No chat history/)
    } finally {
      await ensureWorkspace()
    }

    await assert.rejects(
      () => call('agent:plan', { task: 'x', includeChat: 'yes' }),
      /Invalid includeChat flag/
    )
  })

  it('cancels tracked plans through IPC', async () => {
    await ensureWorkspace()

    const tracked = await call('agent:track-plan', {
      proposal: { task: 'Cancel me.', edits: [] },
    })

    const cancelled = await call('agent:plan-cancel', { id: tracked.id })

    assert.equal(cancelled.status, 'cancelled')
    assert.ok(
      cancelled.steps.every((step) =>
        ['completed', 'verified', 'cancelled'].includes(step.state)
      )
    )
  })

  it('reports git state honestly through IPC', { skip: !GIT_AVAILABLE }, async () => {
    const root = await ensureWorkspace()
    // Deterministic regardless of stray parent repos (a home-dir repo
    // would otherwise make this temp dir "inside a work tree").
    const savedEnv = {
      GIT_DIR: process.env.GIT_DIR,
      GIT_WORK_TREE: process.env.GIT_WORK_TREE,
      GIT_CEILING_DIRECTORIES: process.env.GIT_CEILING_DIRECTORIES,
    }

    delete process.env.GIT_DIR
    delete process.env.GIT_WORK_TREE
    process.env.GIT_CEILING_DIRECTORIES = path
      .dirname(root)
      .replace(/\\/g, '/')

    try {
      await assert.rejects(() => call('git:status'), /not a Git repository/)

      const cancelled = await call('git:cancel')

      assert.deepEqual(cancelled, { killed: 0 })

      await assert.rejects(
        () => call('git:commit', { message: '' }),
        /Invalid commit message/
      )
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it('selects and configures providers without leaking secrets', async () => {
    await ensureWorkspace()

    const listed = await call('provider:list')
    const ids = listed.providers.map((entry) => entry.id)

    assert.ok(ids.includes('meta'))
    assert.ok(listed.providers.length >= 1)

    const meta = await call('provider:get', { providerId: 'meta' })

    assert.equal(meta.displayName, 'Meta AI')
    assert.ok(meta.models.some((entry) => entry.id === 'muse-spark-1.3'))

    await assert.rejects(() => call('provider:get', { providerId: 'nope' }), /Unknown provider/)

    const selection = await call('provider:selection')

    assert.equal(selection.config.selectedProvider, 'meta')
    assert.equal(selection.route.providerId, 'meta')
    assert.equal(selection.route.modelId, 'muse-spark-1.3')

    const configured = await call('provider:configure', { selectedModel: 'muse-wonder-1.0' })

    assert.equal(configured.selectedModel, 'muse-wonder-1.0')
    assert.equal((await call('provider:selection')).route.modelId, 'muse-wonder-1.0')

    await call('provider:configure', { selectedModel: 'muse-spark-1.3' })

    await assert.rejects(
      () => call('provider:configure', { selectedProvider: '' }),
      /Invalid selectedProvider/
    )

    const models = await call('provider:models', { providerId: 'meta' })

    assert.ok(models.models.some((entry) => entry.modelId === 'muse-spark-1.3'))
    assert.ok(models.models.every((entry) => entry.providerId === 'meta'))

    const single = await call('provider:model', { providerId: 'meta', modelId: 'muse-spark-1.3' })

    assert.equal(single.displayName, 'Muse Spark 1.3')

    await assert.rejects(
      () => call('provider:model', { providerId: 'meta', modelId: 'nope' }),
      /Unknown model/
    )

    const tested = await call('provider:test', { providerId: 'meta' })

    assert.equal(typeof tested.ok, 'boolean')
    assert.ok(tested.checks.some((entry) => entry.name === 'registered' && entry.ok === true))
  })

  it('manages provider keys over IPC without ever returning secrets', async () => {
    await ensureWorkspace()

    const restoreEnv = clearSecrets()

    try {
      // The stubbed Electron module has no safeStorage, so the vault
      // reports unavailable and refuses writes: exactly the safe
      // behavior production shows on systems without OS encryption.
      const status = await call('provider:key-status', { providerId: 'meta' })

      assert.deepEqual(status, {
        providerId: 'meta',
        available: false,
        configured: false,
        source: 'missing',
      })

      await assert.rejects(
        () => call('provider:set-key', { providerId: 'meta', apiKey: 'ipc-probe-key' }),
        /unavailable/
      )

      // Removal needs no encryption: with no vault file and no env
      // secret it honestly reports nothing removed.
      const removed = await call('provider:remove-key', { providerId: 'meta' })

      assert.deepEqual(removed, {
        removed: false,
        name: 'MODEL_API_KEY',
        configured: false,
        source: 'missing',
      })

      await assert.rejects(
        () => call('provider:set-key', { providerId: 'nope', apiKey: 'x' }),
        /Unknown provider/
      )
      await assert.rejects(
        () => call('provider:set-key', { providerId: 'meta', apiKey: 42 }),
        /string is required/
      )
      await assert.rejects(
        () => call('provider:key-status', { providerId: 'nope' }),
        /Unknown provider/
      )
    } finally {
      restoreEnv()
    }
  })

  it('grants, checks, and revokes permissions with an audit trail', async () => {
    await ensureWorkspace()

    const catalog = await call('permission:list')

    assert.equal(catalog.permissions.length, 12)
    assert.ok(catalog.permissions.some((entry) => entry.id === 'workspace.read'))

    const subject = 'skill:user:ipc-perm-probe'

    assert.equal(
      (await call('permission:check', { subject, permission: 'workspace.read' })).granted,
      false
    )

    const granted = await call('permission:grant', { subject, permission: 'workspace.read' })

    assert.equal(granted.granted, true)
    assert.equal(
      (await call('permission:check', { subject, permission: 'workspace.read' })).granted,
      true
    )

    const scoped = await call('permission:grants', { subject })
    const entry = scoped.grants.find((item) => item.subject === subject)

    assert.ok(entry.permissions.some((item) => item.permission === 'workspace.read'))

    const revoked = await call('permission:revoke', { subject, permission: 'workspace.read' })

    assert.deepEqual(revoked.revoked, ['workspace.read'])
    assert.equal(
      (await call('permission:check', { subject, permission: 'workspace.read' })).granted,
      false
    )

    await assert.rejects(
      () => call('permission:grant', { subject, permission: 'nope.nope' }),
      /Unknown permission/
    )

    const trail = await call('audit:list', {})

    assert.ok(trail.events.some((event) => event.type === 'permission.granted' && event.subject === subject))
    assert.ok(trail.events.some((event) => event.type === 'permission.revoked' && event.subject === subject))
    assert.ok(trail.total >= 2)
  })

  it('runs the extension lifecycle through IPC', async () => {
    await ensureWorkspace()

    const source = path.join(sharedRoot, 'ipc-ext-src')

    await fs.mkdir(source, { recursive: true })
    await fs.writeFile(
      path.join(source, 'kryom-extension.json'),
      JSON.stringify({
        manifestVersion: 1,
        id: 'ipc.pingdemo',
        name: 'Ping demo',
        description: 'IPC lifecycle probe.',
        version: '1.0.0',
        publisher: 'ipc',
        main: 'main.js',
        apiVersion: 1,
        permissions: [],
        contributes: { commands: [{ id: 'ipc.pingdemo.run', title: 'Run' }] },
      })
    )
    await fs.writeFile(
      path.join(source, 'main.js'),
      'module.exports.activate = (kryom) => {\n' +
        "  kryom.commands.registerCommand('ipc.pingdemo.run', () => 'ran')\n" +
        '}\n'
    )

    dialogPlan.open = async () => ({ canceled: false, filePaths: [source] })

    try {
      assert.deepEqual(await call('extension:pick-directory'), { path: source })
    } finally {
      dialogPlan.open = null
    }

    dialogPlan.open = async () => ({ canceled: true, filePaths: [] })

    try {
      assert.equal(await call('extension:pick-directory'), null)
    } finally {
      dialogPlan.open = null
    }

    const installed = await call('extension:install', { path: source })

    assert.equal(installed.id, 'ipc.pingdemo')
    assert.equal(installed.enabled, false)

    await assert.rejects(
      () => call('extension:install', { path: source }),
      /already installed/
    )
    await assert.rejects(
      () => call('extension:activate', { id: 'ipc.pingdemo' }),
      /disabled/
    )

    await call('extension:enable', { id: 'ipc.pingdemo' })

    const activated = await call('extension:activate', { id: 'ipc.pingdemo' })

    assert.equal(activated.active, true)
    assert.deepEqual(activated.commands, [{ id: 'ipc.pingdemo.run', title: 'Run' }])
    assert.equal(
      await call('extension:command', { id: 'ipc.pingdemo', commandId: 'ipc.pingdemo.run' }),
      'ran'
    )

    await assert.rejects(
      () => call('extension:command', { id: 'ipc.pingdemo', commandId: 'ipc.pingdemo.nope' }),
      /Unknown command/
    )

    const listed = await call('extension:list')

    assert.ok(listed.extensions.some((entry) => entry.id === 'ipc.pingdemo' && entry.active === true))

    const fetched = await call('extension:get', { id: 'ipc.pingdemo' })

    assert.equal(fetched.active, true)
    assert.equal(fetched.commands.length, 1)

    await call('extension:deactivate', { id: 'ipc.pingdemo' })
    await call('extension:disable', { id: 'ipc.pingdemo' })
    await call('extension:uninstall', { id: 'ipc.pingdemo' })

    assert.ok(
      !(await call('extension:list')).extensions.some((entry) => entry.id === 'ipc.pingdemo')
    )
  })

  it('saves, gates, runs, and deletes skills through IPC', async () => {
    await ensureWorkspace()

    await assert.rejects(
      () => call('skill:save', {
        skill: {
          skillVersion: 1,
          id: 'ipc-probe',
          version: '1.0.0',
          instructions: 'Probe.',
          tools: ['nope.tool'],
          entryTool: 'nope.tool',
        },
      }),
      /unknown tool/
    )

    const saved = await call('skill:save', {
      skill: {
        skillVersion: 1,
        id: 'ipc-probe',
        name: 'IPC probe',
        version: '1.0.0',
        instructions: 'Describe the project layout.',
        tools: ['intelligence.architecture'],
        entryTool: 'intelligence.architecture',
        permissions: ['workspace.metadata'],
      },
    })

    assert.equal(saved.id, 'ipc-probe')

    const fetched = await call('skill:get', { id: 'ipc-probe' })

    assert.equal(fetched.scope, 'user')

    const listed = await call('skill:list')

    assert.ok(listed.skills.length >= 4)
    assert.ok(listed.skills.some((entry) => entry.id === 'ipc-probe'))

    await assert.rejects(
      () => call('skill:run', { skillId: 'ipc-probe', task: 'Summarize the layout.' }),
      /Permission denied/
    )

    await call('permission:grant', {
      subject: 'skill:user:ipc-probe',
      permission: 'workspace.metadata',
    })

    const ran = await call('skill:run', { skillId: 'ipc-probe', task: 'Summarize the layout.' })

    assert.equal(ran.kind, 'result')
    assert.equal(ran.tool, 'intelligence.architecture')
    assert.equal(typeof ran.result, 'object')

    await call('skill:set-enabled', { id: 'ipc-probe', enabled: false })

    assert.equal(
      (await call('skill:list')).skills.find((entry) => entry.id === 'ipc-probe').enabled,
      false
    )

    await call('permission:revoke', { subject: 'skill:user:ipc-probe' })

    const deleted = await call('skill:delete', { id: 'ipc-probe' })

    assert.deepEqual(deleted, { id: 'ipc-probe', deleted: true })

    await assert.rejects(() => call('skill:get', { id: 'ipc-probe' }), /not found/)
  })

  it('advances, approves, and cancels workflows through IPC', async () => {
    await ensureWorkspace()

    await assert.rejects(
      () => call('workflow:save', {
        workflow: {
          workflowVersion: 1,
          id: 'ipc-gate',
          version: '1.0.0',
          steps: [{ id: 'bad', kind: 'nope.kind' }],
        },
      }),
      /unknown kind/
    )

    await call('workflow:save', {
      workflow: {
        workflowVersion: 1,
        id: 'ipc-gate',
        name: 'IPC gate',
        version: '1.0.0',
        steps: [{ id: 'gate', kind: 'approval.checkpoint', message: 'Proceed?' }],
      },
    })

    assert.equal((await call('workflow:get', { id: 'ipc-gate' })).steps.length, 1)
    assert.ok((await call('workflow:list')).workflows.some((entry) => entry.id === 'ipc-gate'))

    const started = await call('workflow:start', {
      workflowId: 'ipc-gate',
      task: 'ipc approval probe',
    })

    assert.equal(started.state, 'active')

    const waiting = await call('workflow:advance', { runId: started.id })

    assert.equal(waiting.state, 'awaiting-approval')
    assert.equal(waiting.pendingStep, 'gate')

    await assert.rejects(
      () => call('workflow:advance', { runId: started.id }),
      /awaiting approval/
    )
    assert.equal((await call('workflow:get-run', { runId: started.id })).state, 'awaiting-approval')

    const denied = await call('workflow:approve', {
      runId: started.id,
      decision: 'deny',
      note: 'not now',
    })

    assert.equal(denied.state, 'cancelled')

    const second = await call('workflow:start', { workflowId: 'ipc-gate' })
    const cancelled = await call('workflow:cancel', { runId: second.id })

    assert.equal(cancelled.state, 'cancelled')

    const runs = await call('workflow:runs')

    assert.ok(runs.runs.some((entry) => entry.id === started.id))
    assert.ok(runs.runs.some((entry) => entry.id === second.id))

    await call('workflow:delete', { id: 'ipc-gate' })

    await assert.rejects(() => call('workflow:get', { id: 'ipc-gate' }), /not found/)
  })

  it('reports integration state through the shared contract', async () => {
    await ensureWorkspace()

    // Deterministic regardless of stray parent repos or GIT_* env vars
    // (same hardening as git.service.test.cjs): stop git's parent
    // traversal at the temp dir so a fresh folder reads as repo-less.
    const savedEnv = {
      GIT_DIR: process.env.GIT_DIR,
      GIT_WORK_TREE: process.env.GIT_WORK_TREE,
      GIT_CEILING_DIRECTORIES: process.env.GIT_CEILING_DIRECTORIES,
    }
    delete process.env.GIT_DIR
    delete process.env.GIT_WORK_TREE
    process.env.GIT_CEILING_DIRECTORIES = path
      .dirname(sharedRoot)
      .replace(/\\/g, '/')

    try {
      const listed = await call('integration:list')

      assert.ok(listed.integrations.some((entry) => entry.id === 'github'))

      const status = await call('integration:status', { id: 'github' })

      assert.equal(status.connected, false)
      assert.equal(status.state, 'disconnected')

      const repositories = await call('integration:repositories', { id: 'github' })

      assert.deepEqual(repositories.repositories, [])

      await assert.rejects(() => call('integration:connect', { id: 'github' }), /Cannot connect/)
      await assert.rejects(() => call('integration:history', { id: 'github', limit: 5 }))

      const cleared = await call('integration:disconnect', { id: 'github' })

      assert.equal(typeof cleared, 'object')

      await assert.rejects(
        () => call('integration:status', { id: 'nope' }),
        /Unknown integration/
      )
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })

  it('previews and generates projects from templates through IPC', async () => {
    await ensureWorkspace()

    const listed = await call('template:list')

    assert.ok(listed.templates.some((entry) => entry.id === 'basic-web'))

    const template = await call('template:get', { id: 'basic-web' })

    assert.equal(template.id, 'basic-web')
    assert.ok(!('dir' in template))

    const variables = { project_name: 'ipc-site' }
    const destination = path.join(sharedRoot, 'ipc-generated-app')
    const preview = await call('template:preview', {
      templateId: 'basic-web',
      destination,
      variables,
    })

    assert.ok(preview.files.length > 0)
    assert.deepEqual(preview.collisions, [])

    const generated = await call('template:generate', {
      templateId: 'basic-web',
      destination,
      variables,
    })

    assert.equal(generated.destination, destination)

    for (const file of generated.files.slice(0, 2)) {
      assert.ok((await fs.stat(path.join(destination, file.path))).isFile())
    }

    const second = await call('template:preview', {
      templateId: 'basic-web',
      destination,
      variables,
    })

    assert.ok(second.collisions.length > 0)

    await assert.rejects(
      () => call('template:generate', { templateId: 'basic-web', destination, variables }),
      /Confirm to overwrite/
    )

    const overwritten = await call('template:generate', {
      templateId: 'basic-web',
      destination,
      variables,
      confirmed: true,
    })

    assert.ok(overwritten.overwritten.length > 0)

    dialogPlan.open = async () => ({ canceled: false, filePaths: [sharedRoot] })

    try {
      assert.deepEqual(await call('template:pick-destination'), { path: sharedRoot })
    } finally {
      dialogPlan.open = null
    }

    await assert.rejects(() => call('template:get', { id: 'nope-nope' }), /not found/)
  })

  it('previews and exports a redacted support bundle through IPC', async () => {
    await ensureWorkspace()

    const preview = await call('diagnostics:support-preview')

    assert.equal(preview.kind, 'kryom-support-bundle')
    assert.equal(typeof preview.app.version, 'string')
    assert.equal(typeof preview.runtime.platform, 'string')
    assert.equal(typeof preview.providers.metaConfigured, 'boolean')
    assert.equal(preview.features.workspaceOpen, true)
    assert.ok(Array.isArray(preview.recentErrors))

    const serialized = JSON.stringify(preview)

    assert.ok(!serialized.includes('MODEL_API_KEY'))
    assert.ok(!serialized.includes('hunter2'))

    const destination = path.join(sharedRoot, 'support-bundle.json')

    dialogPlan.save = async () => ({ canceled: false, filePath: destination })

    try {
      const exported = await call('diagnostics:support-export')

      assert.equal(exported.cancelled, false)
      assert.equal(exported.path, destination)
      assert.ok(exported.bytes > 100)

      const parsed = JSON.parse(await fs.readFile(destination, 'utf8'))

      assert.equal(parsed.kind, 'kryom-support-bundle')
    } finally {
      dialogPlan.save = null
    }

    await fs.unlink(destination)

    dialogPlan.save = async () => ({ canceled: true })

    try {
      assert.deepEqual(await call('diagnostics:support-export'), { cancelled: true })
    } finally {
      dialogPlan.save = null
    }
  })

  it('reports update status honestly with no feed configured', async () => {
    await ensureWorkspace()

    delete process.env.KRYOM_UPDATE_FEED

    const status = await call('update:status')

    assert.equal(typeof status.version, 'string')
    assert.equal(status.feedConfigured, false)
    assert.equal(status.staged, null)

    const checked = await call('update:check')

    assert.equal(checked.available, false)
    assert.match(checked.reason, /No update feed/)

    await assert.rejects(() => call('update:download', {}), /No update to download/)
    assert.deepEqual(await call('update:cancel'), { cancelled: false })
    assert.deepEqual(await call('update:clear'), { cleared: true })
  })
})
