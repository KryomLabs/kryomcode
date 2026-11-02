const { spawn } = require('node:child_process')

const {
  getWorkspaceRoot,
} = require('../workspace/workspace.service.cjs')
const {
  registerProcess,
  unregisterProcess,
  listProcesses,
  killAllProcesses,
  killProcessesByOrigin,
  normalizeOrigin,
  killProcessTree,
  markKilled,
  consumeKillMark,
  markDetachedProcess,
} = require('./process-manager.cjs')
const { classifyCommand } = require('./command-validator.cjs')
const { shouldDetach } = require('../../utils/platform.cjs')
const { isSecretKey } = require('../settings/secrets.service.cjs')

const MAX_COMMAND_LENGTH = 2000
const MAX_OUTPUT_LENGTH = 100_000
const TIMEOUT_MS = 120_000

// Provider secrets must never reach the shell. Terminal output can be
// copied or screenshared, so child processes get a scrubbed environment.
function buildChildEnv() {
  const env = { ...process.env }

  for (const key of Object.keys(env)) {
    if (isSecretKey(key)) {
      delete env[key]
    }
  }

  return env
}

function validateCommand(command) {
  if (
    typeof command !== 'string' ||
    !command.trim() ||
    command.length > MAX_COMMAND_LENGTH
  ) {
    throw new Error(
      'Enter a valid command (maximum 2000 characters).'
    )
  }
}

async function runCommand(command, options = {}) {
  const workspaceRoot = getWorkspaceRoot()

  if (!workspaceRoot) {
    throw new Error('Open a project folder first.')
  }

  validateCommand(command)

  const warnings = classifyCommand(command)
  const { signal, timeoutMs = TIMEOUT_MS, origin } = options ?? {}

  return new Promise((resolve) => {
    let output = ''
    let timedOut = false
    let outputLimited = false
    let settled = false

    // POSIX-only detach: the child leads its own process group so
    // cancel/timeout terminates grandchildren too. Windows behavior
    // is unchanged (taskkill still owns tree termination).
    const detached = shouldDetach()

    const child = spawn(command, {
      cwd: workspaceRoot,
      shell: true,
      windowsHide: true,
      ...(detached ? { detached: true } : {}),
      env: buildChildEnv(),
    })

    if (detached) {
      markDetachedProcess(child)
    }

    const processId = registerProcess(child, {
      command,
      origin: normalizeOrigin(origin),
    })

    const append = (chunk) => {
      const text = chunk.toString()
      const remaining = MAX_OUTPUT_LENGTH - output.length

      if (remaining <= 0) {
        outputLimited = true
        return
      }

      output += text.slice(0, remaining)

      if (text.length > remaining) {
        outputLimited = true
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      killProcessTree(child)
    }, timeoutMs)

    const onAbort = () => {
      markKilled(child)
      killProcessTree(child)
    }

    if (signal) {
      if (signal.aborted) {
        // Pre-aborted: the run never really started, but it ends by
        // cancellation, so it must report cancelled like onAbort.
        markKilled(child)
        killProcessTree(child)
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    const cleanup = () => {
      clearTimeout(timer)
      unregisterProcess(processId)

      if (signal) {
        signal.removeEventListener('abort', onAbort)
      }
    }

    child.stdout.on('data', append)
    child.stderr.on('data', append)

    child.on('error', (error) => {
      if (settled) return

      settled = true
      cleanup()

      const cancelled = consumeKillMark(child) && !timedOut

      resolve({
        exitCode: 1,
        output: `${output}\n${error.message}`,
        timedOut,
        cancelled,
        outputLimited,
        warnings,
      })
    })

    child.on('close', (code) => {
      if (settled) return

      settled = true
      cleanup()

      // A timeout that already fired wins over a later cancel mark:
      // the timer only fires before the close event.
      const cancelled = consumeKillMark(child) && !timedOut

      resolve({
        exitCode: code ?? 1,
        output:
          output +
          (timedOut
            ? `\nCommand timed out after ${Math.round(timeoutMs / 1000)} seconds.`
            : '') +
          (cancelled ? '\nCancelled by user.' : '') +
          (outputLimited ? '\nOutput truncated.' : ''),
        timedOut,
        cancelled,
        outputLimited,
        warnings,
      })
    })
  })
}

function listRunningProcesses(filter) {
  return listProcesses(filter ?? {})
}

// Operation-scoped cancellation (Phase 0): kills only the given
// origin (default 'user-terminal'). The { killed } shape is the
// stable contract shared by every cancel channel.
function cancelRunningProcesses(origin) {
  const { killed } = killProcessesByOrigin(origin)

  return { killed }
}

// Shutdown path only (main.cjs before-quit): reaps every registered
// child regardless of origin. Never use for UI-driven cancellation.
function killAllActiveProcesses() {
  killAllProcesses()
}

module.exports = {
  runCommand,
  buildChildEnv,
  listRunningProcesses,
  cancelRunningProcesses,
  killAllActiveProcesses,
}
