// Native menu regression gate (Phase D1): the eight-menu shape is
// stable, no two items claim the same accelerator, and the Problems
// panel owns Ctrl+Shift+J.
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildMenuTemplate } = require('./menu.cjs')

function build() {
  return buildMenuTemplate({
    recent: [],
    autoSave: false,
    ctx: { hasWorkspace: true, hasEditor: true, terminalRunning: true },
    actions: {},
  })
}

function walk(items, visit) {
  for (const item of items) {
    visit(item)

    if (Array.isArray(item.submenu)) {
      walk(item.submenu, visit)
    }
  }
}

describe('native menu', () => {
  it('keeps the eight top-level menus', () => {
    const labels = build().map((entry) => entry.label)

    assert.deepEqual(labels, [
      'File',
      'Edit',
      'Selection',
      'View',
      'Go',
      'Run',
      'Terminal',
      'Help',
    ])
  })

  it('registers no conflicting accelerators', () => {
    const seen = new Map()
    const conflicts = []

    walk(build(), (item) => {
      if (typeof item.accelerator !== 'string' || !item.accelerator) {
        return
      }

      // CmdOrCtrl is one binding rendered per platform — normalize
      // before comparing so darwin/Windows forms cannot double-book.
      const key = item.accelerator.toLowerCase().replace(/cmdorctrl/g, 'ctrl')

      if (seen.has(key)) {
        conflicts.push(
          `${item.accelerator} claimed by "${seen.get(key)}" and "${item.label}"`
        )
      } else {
        seen.set(key, item.label)
      }
    })

    assert.deepEqual(conflicts, [])
  })

  it('binds the Problems panel to Ctrl+Shift+J', () => {
    const found = new Map()

    walk(build(), (item) => {
      if (typeof item.click !== 'function') {
        return
      }

      // commandItem closures send their id over kryom:command; invoke
      // the click with a capturing window to read it back.
      let sent = null

      try {
        item.click(item, {
          isDestroyed: () => false,
          webContents: { send: (_channel, payload) => { sent = payload } },
        })
      } catch {
        return
      }

      if (sent && typeof sent.id === 'string') {
        found.set(sent.id, item.accelerator ?? null)
      }
    })

    assert.equal(found.get('view.problems'), 'CmdOrCtrl+Shift+J')
    assert.ok(found.has('view.debugConsole'))
    assert.ok(found.has('view.terminal'))
    assert.ok(found.has('view.output'))
    assert.ok(found.has('terminal.focus'))
  })
})
