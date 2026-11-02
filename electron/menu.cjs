// Native desktop menu for KryomCode: File | Edit | Selection | View |
// Go | Run | Terminal | Help. The template is a pure function of its
// inputs so the enabled states, recent list, and auto-save checkbox
// always reflect the latest known UI state. Renderer-bound items send a
// `kryom:command` message to the focused window; the renderer owns the
// confirmations (unsaved changes, destructive actions) before acting.

function sendTo(window, channel, payload) {
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload)
  }
}

function commandItem(id, options, payload) {
  return {
    ...options,
    click: (_menuItem, focusedWindow) =>
      sendTo(focusedWindow, 'kryom:command', { id, payload }),
  }
}

function buildRecentSubmenu(recent, onClear) {
  if (!recent || recent.length === 0) {
    return [{ label: 'No recent projects', enabled: false }]
  }

  const items = recent.map((root) =>
    commandItem(
      'file.openPath',
      { label: root },
      { path: root }
    )
  )

  items.push(
    { type: 'separator' },
    {
      label: 'Clear Recent',
      click: () => onClear(),
    }
  )

  return items
}

// Deps:
// - recent: string[] recent workspace roots (most recent first)
// - autoSave: boolean for the File checkbox
// - ctx: { hasWorkspace, hasEditor, terminalRunning } pushed by the
//   renderer; unknown states leave guarded items disabled.
// - actions: { newWindow, openAbout, openDocs } main-process callbacks.
function buildMenuTemplate(deps) {
  const recent = Array.isArray(deps.recent) ? deps.recent : []
  const autoSave = deps.autoSave === true
  const ctx = deps.ctx || {}
  const hasWorkspace = ctx.hasWorkspace === true
  const hasEditor = ctx.hasEditor === true
  const terminalRunning = ctx.terminalRunning === true
  const actions = deps.actions || {}
  const noop = () => undefined

  const template = [
    {
      label: 'File',
      submenu: [
        commandItem('file.newFile', {
          label: 'New Text File',
          accelerator: 'CmdOrCtrl+N',
          enabled: hasWorkspace,
        }),
        {
          // Disabled: the backend workspace root is a process-wide
          // singleton, so a second window would silently re-root the
          // first. Re-enable once roots are scoped per window.
          label: 'New Window (unavailable in single-window mode)',
          enabled: false,
        },
        { type: 'separator' },
        commandItem('file.openFile', {
          label: 'Open File…',
          accelerator: 'CmdOrCtrl+O',
        }),
        commandItem('file.openFolder', {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
        }),
        {
          label: 'Open Recent',
          submenu: buildRecentSubmenu(recent, () =>
            (actions.clearRecent || noop)()
          ),
        },
        { type: 'separator' },
        commandItem('file.save', {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: hasEditor,
        }),
        commandItem('file.saveAs', {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: hasEditor,
        }),
        commandItem('file.toggleAutoSave', {
          label: 'Auto Save',
          type: 'checkbox',
          checked: autoSave,
        }),
        { type: 'separator' },
        commandItem('file.closeEditor', {
          label: 'Close Editor',
          accelerator: 'CmdOrCtrl+W',
          enabled: hasEditor,
        }),
        commandItem('file.closeFolder', {
          label: 'Close Folder',
          enabled: hasWorkspace,
        }),
        { type: 'separator' },
        commandItem('view.settings', {
          label: 'Preferences: Open Settings',
          accelerator: 'CmdOrCtrl+,',
        }),
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'delete', label: 'Delete' },
        { type: 'separator' },
        commandItem('edit.find', {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          enabled: hasEditor,
        }),
        commandItem('edit.replace', {
          label: 'Replace',
          accelerator: 'CmdOrCtrl+H',
          enabled: hasEditor,
        }),
      ],
    },
    {
      label: 'Selection',
      submenu: [
        { role: 'selectAll', label: 'Select All' },
        { type: 'separator' },
        commandItem('select.expand', {
          label: 'Expand Selection',
          accelerator: 'Shift+Alt+Right',
          enabled: hasEditor,
        }),
        commandItem('select.shrink', {
          label: 'Shrink Selection',
          accelerator: 'Shift+Alt+Left',
          enabled: hasEditor,
        }),
      ],
    },
    {
      label: 'View',
      submenu: [
        commandItem('view.explorer', {
          label: 'Explorer',
          accelerator: 'CmdOrCtrl+Shift+E',
        }),
        commandItem('view.search', {
          label: 'Search',
          accelerator: 'CmdOrCtrl+Shift+F',
        }),
        commandItem('view.git', {
          label: 'Source Control',
          accelerator: 'CmdOrCtrl+Shift+G',
        }),
        commandItem('view.run', {
          label: 'Run and Debug',
          accelerator: 'CmdOrCtrl+Shift+D',
        }),
        commandItem('view.extensions', {
          label: 'Extensions',
          accelerator: 'CmdOrCtrl+Shift+X',
        }),
        commandItem('view.aiWorkspace', {
          label: 'AI Workspace',
          accelerator: 'CmdOrCtrl+Shift+A',
        }),
        commandItem('view.knowledge', {
          label: 'Knowledge',
          accelerator: 'CmdOrCtrl+Shift+K',
        }),
        commandItem('view.history', {
          label: 'History',
          accelerator: 'CmdOrCtrl+Shift+H',
        }),
        commandItem('view.home', {
          label: 'Welcome',
        }),
        commandItem('view.palette', {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
        }),
        commandItem('view.metaAI', {
          label: 'New AI Thread',
          accelerator: 'CmdOrCtrl+Shift+M',
        }),
        commandItem('view.intel', {
          label: 'Intelligence',
        }),
        commandItem('view.platform', {
          label: 'Platform',
        }),
        commandItem('view.focusEditor', {
          label: 'Focus Editor',
          accelerator: 'CmdOrCtrl+1',
          enabled: hasEditor,
        }),
        commandItem('view.splitRight', {
          label: 'Split Editor Right',
          accelerator: 'CmdOrCtrl+\\',
          enabled: hasEditor,
        }),
        commandItem('view.terminal', {
          label: 'Terminal Panel',
          accelerator: 'CmdOrCtrl+`',
        }),
        commandItem('view.problems', {
          label: 'Problems Panel',
          accelerator: 'CmdOrCtrl+Shift+J',
        }),
        commandItem('view.output', { label: 'Output Panel' }),
        commandItem('view.debugConsole', { label: 'Debug Console Panel' }),
        { type: 'separator' },
        commandItem('view.toggleSidebar', {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
        }),
        commandItem('view.toggleRight', {
          label: 'Toggle Bottom Panel',
          accelerator: 'CmdOrCtrl+J',
        }),
        { type: 'separator' },
        commandItem('editor.fontLarger', {
          label: 'Increase Editor Font Size',
          accelerator: 'CmdOrCtrl+Alt+=',
        }),
        commandItem('editor.fontSmaller', {
          label: 'Decrease Editor Font Size',
          accelerator: 'CmdOrCtrl+Alt+-',
        }),
        { type: 'separator' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { role: 'resetZoom', label: 'Reset Zoom' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        commandItem('go.file', {
          label: 'Go to File…',
          accelerator: 'CmdOrCtrl+P',
          enabled: hasWorkspace,
        }),
        commandItem('go.line', {
          label: 'Go to Line…',
          accelerator: 'CmdOrCtrl+G',
          enabled: hasEditor,
        }),
        { type: 'separator' },
        commandItem('go.back', {
          label: 'Back',
          accelerator: 'Alt+Left',
        }),
        commandItem('go.forward', {
          label: 'Forward',
          accelerator: 'Alt+Right',
        }),
      ],
    },
    {
      label: 'Run',
      submenu: [
        commandItem('run.diagnostics', {
          label: 'Run Diagnostics…',
          accelerator: 'F5',
          enabled: hasWorkspace,
        }),
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        // Same command as View > Terminal Panel (which owns the
        // CmdOrCtrl+` accelerator); no duplicate registration here.
        commandItem('view.terminal', {
          label: 'Toggle Terminal Panel',
        }),
        commandItem('terminal.focus', {
          label: 'Show Terminal',
        }),
        commandItem('terminal.clear', {
          label: 'Clear Terminal',
        }),
        { type: 'separator' },
        commandItem('terminal.cancel', {
          label: 'Cancel Running Command',
          enabled: terminalRunning,
        }),
      ],
    },
    {
      label: 'Help',
      submenu: [
        commandItem('help.shortcuts', {
          label: 'Keyboard Shortcuts…',
        }),
        commandItem('help.diagnostics', {
          label: 'Export Diagnostics…',
        }),
        {
          label: 'Open Documentation Folder',
          click: () => (actions.openDocs || noop)(),
        },
        { type: 'separator' },
        {
          label: 'About KryomCode',
          click: (_menuItem, focusedWindow) =>
            (actions.openAbout || noop)(focusedWindow),
        },
      ],
    },
  ]

  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' })
  }

  return template
}

module.exports = {
  buildMenuTemplate,
}
