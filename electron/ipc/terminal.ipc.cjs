const { ipcMain } = require('electron')

const {
  runCommand,
  listRunningProcesses,
  cancelRunningProcesses,
} = require('../services/terminal/terminal.service.cjs')
const {
  classifyCommand,
} = require('../services/terminal/command-validator.cjs')
const {
  assertNonEmptyString,
} = require('../security/validate-input.cjs')
const {
  confirmDestructiveCommand,
} = require('./approval.cjs')

module.exports = function registerTerminalIPC({
  isTrustedSender,

}) {
  ipcMain.handle('terminal:run', async (event, command) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized terminal request.')
    }

    const text = assertNonEmptyString(command, 'command', 2000)

    // Main-process enforcement (renderer confirmations are UX only
    // and cannot be trusted here): destructive commands face a native
    // dialog that a compromised renderer cannot skip.
    await confirmDestructiveCommand(text, {
      parent: null, // resolved inside the gate (focused, else first window)
      source: 'terminal',
    })

    return runCommand(text, { origin: 'user-terminal' })
  })

  ipcMain.handle('terminal:cancel', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized terminal request.')
    }

    // Scoped: user-terminal runs only. Diagnostics and agent runs
    // have their own cancel channels and are never touched here.
    return cancelRunningProcesses('user-terminal')
  })

  ipcMain.handle('terminal:status', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized terminal request.')
    }

    return { running: listRunningProcesses() }
  })

  // Pre-execution warning scan (Level 2B.5): the renderer classifies
  // a command and confirms with the user before running it. Pure and
  // side-effect free; execution still goes through terminal:run.
  ipcMain.handle('terminal:classify', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized terminal request.')
    }

    const options = payload && typeof payload === 'object' ? payload : {}

    return {
      warnings: classifyCommand(
        assertNonEmptyString(options.command, 'command', 2000)
      ),
    }
  })
}
