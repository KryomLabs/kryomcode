// Terminal boundary regression gate (Phase D2): the T1 renderer
// stays a renderer — no node-pty dependency, no pty:* IPC channels,
// no PTY access from agent/diagnostics/git paths, and git keeps its
// private process registry. node_modules is never scanned (xterm's
// own devDependencies legitimately mention node-pty).
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..', '..')
const CODE_DIRS = ['electron', 'src'].map((entry) => path.join(ROOT, entry))
const CODE_EXTENSIONS = new Set(['.cjs', '.ts', '.tsx'])

// Files that assert the boundary necessarily name it; they are
// exempt from the forbidden-string scan (never from the positive
// assertions below).
function isBoundaryTest(relative) {
  return (
    relative === 'electron/security/terminal-boundary.test.cjs' ||
    relative === 'electron/menu.test.cjs'
  )
}

function collectCodeFiles() {
  const out = []

  for (const dir of CODE_DIRS) {
    const stack = [dir]

    while (stack.length > 0) {
      const current = stack.pop()

      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)

        if (entry.isDirectory()) {
          stack.push(full)
        } else if (
          entry.isFile() &&
          CODE_EXTENSIONS.has(path.extname(entry.name))
        ) {
          out.push(full)
        }
      }
    }
  }

  return out.sort()
}

describe('terminal boundary (no interactive PTY in Phase D)', () => {
  it('ships xterm renderer deps and no node-pty dependency', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    )
    const all = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    }

    assert.ok(all.xterm, 'xterm renderer dependency is installed')
    assert.ok(
      all['@xterm/addon-fit'],
      '@xterm/addon-fit is installed'
    )
    assert.ok(
      all['@xterm/addon-web-links'],
      '@xterm/addon-web-links is installed'
    )
    assert.equal(all['node-pty'], undefined)
  })

  it('exposes no pty:* IPC channels anywhere in code', () => {
    const hits = []

    for (const full of collectCodeFiles()) {
      const relative = path.relative(ROOT, full).split(path.sep).join('/')

      if (isBoundaryTest(relative)) {
        continue
      }

      const text = fs.readFileSync(full, 'utf8')

      for (const pattern of ['node-pty', 'pty.service', 'PtyTerminal']) {
        if (text.includes(pattern)) {
          hits.push(`${relative}: ${pattern}`)
        }
      }

      // Word-boundaried: innocent "Empty:"-style identifiers never
      // match, while 'pty:*' channel strings do.
      if (/\bpty:/.test(text)) {
        hits.push(`${relative}: pty:`)
      }
    }

    assert.deepEqual(hits, [])
  })

  it('keeps agent, diagnostics, and git origins off any PTY path', () => {
    const scoped = [
      'electron/services/agent',
      'electron/services/diagnostics',
      'electron/services/git',
      'electron/services/terminal',
      'electron/ipc/agent.ipc.cjs',
      'electron/ipc/diagnostics.ipc.cjs',
      'electron/ipc/git.ipc.cjs',
      'electron/ipc/terminal.ipc.cjs',
      'electron/preload.cjs',
    ]
    const hits = []

    for (const full of collectCodeFiles()) {
      const relative = path.relative(ROOT, full).split(path.sep).join('/')

      if (!scoped.some((scope) => relative.startsWith(scope))) {
        continue
      }

      const text = fs.readFileSync(full, 'utf8')

      // Word-boundaried: innocent substrings such as "empty" never
      // match, while pty identifiers and channels do.
      if (/\bpty\b/i.test(text)) {
        hits.push(relative)
      }
    }

    assert.deepEqual(hits, [])
  })

  it('exposes exactly the four buffered terminal IPC channels', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'electron/ipc/terminal.ipc.cjs'),
      'utf8'
    )
    const channels = [...text.matchAll(/ipcMain\.handle\('([^']+)'/g)].map(
      (match) => match[1]
    )

    assert.deepEqual(channels.sort(), [
      'terminal:cancel',
      'terminal:classify',
      'terminal:run',
      'terminal:status',
    ])
  })

  it('keeps git on its private process registry', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'electron/services/git/git.service.cjs'),
      'utf8'
    )

    // Structural isolation: git tracks its own children and can only
    // cancel those — the shared registry's kill entry points are not
    // even imported.
    assert.ok(text.includes('activeChildren'))
    assert.ok(!text.includes('killProcessesByOrigin'))
    assert.ok(!text.includes('killAllProcesses'))
    assert.ok(!text.includes('registerProcess'))
  })
})
