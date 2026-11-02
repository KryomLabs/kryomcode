const { ipcMain, app, dialog } = require('electron')

const {
  runDiagnostics,
  cancelDiagnostics,
} = require('../services/diagnostics/diagnostics.service.cjs')
const {
  assertPlainObject,
  assertNonEmptyString,
  assertOptionalString,
  assertStringArray,
} = require('../security/validate-input.cjs')
const {
  confirmDestructiveCommand,
} = require('./approval.cjs')

module.exports = function registerDiagnosticsIPC({
  isTrustedSender,
  getMainWindow,
}) {
  ipcMain.handle('diagnostics:run', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    assertPlainObject(payload, 'diagnostics payload')
    assertNonEmptyString(payload.command, 'command', 2000)

    const command = payload.command
    // Agent verification reuses the diagnostics executor but must stay
    // cancellable independently, so it tags its runs at creation. The
    // allowlist is exhaustive: anything else is rejected, never coerced.
    const source = payload.source === undefined ? 'diagnostics' : payload.source

    if (source !== 'diagnostics' && source !== 'agent') {
      throw new Error("Invalid diagnostics source: expected 'diagnostics' or 'agent'.")
    }

    // Main-process enforcement, shared with terminal:run: destructive
    // diagnostics commands face a native dialog here.
    await confirmDestructiveCommand(command, {
      parent: typeof getMainWindow === 'function' ? getMainWindow() : null,
      source: 'diagnostics',
    })

    return runDiagnostics(command, { origin: source })
  })

  // Operation-scoped cancellation for user-driven diagnostics runs
  // (Problems panel Stop). Never touches user-terminal or agent runs.
  ipcMain.handle('diagnostics:cancel', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    return cancelDiagnostics()
  })

  // Advanced quality intelligence (3C.5). Computed from project
  // evidence only: no model calls, no invented scores.
  ipcMain.handle('diagnostics:quality', async (event, payload = {}) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    const options = payload && typeof payload === 'object' ? payload : {}

    const {
      buildQualityReport,
    } = require('../services/quality/quality.service.cjs')

    return buildQualityReport({
      planId: assertOptionalString(options.planId, 'plan id', 80) ?? undefined,
      paths: options.paths === undefined || options.paths === null
        ? undefined
        : assertStringArray(options.paths, 'paths', { maxItems: 50, maxLength: 1000 }),
    })
  })

  ipcMain.handle('diagnostics:quality-get', async (event, payload) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    assertPlainObject(payload, 'quality status')

    const {
      getQualityReport,
    } = require('../services/quality/quality.service.cjs')

    return getQualityReport(assertNonEmptyString(payload.reportId, 'report id', 80))
  })

  ipcMain.handle('diagnostics:quality-list', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    const {
      listQualityReports,
    } = require('../services/quality/quality.service.cjs')

    return listQualityReports()
  })

  // Support bundle (4B.11). Explicit user action only: preview shows
  // the exact object first, export writes a user-chosen local file.
  // Nothing uploads anywhere.
  ipcMain.handle('diagnostics:support-preview', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    const {
      collectSupportBundle,
    } = require('../services/diagnostics/support-bundle.cjs')
    const {
      currentEnvironment,
    } = require('../services/release/environment.cjs')

    return collectSupportBundle({
      getVersion: () => app.getVersion(),
      environment: currentEnvironment({ app }),
      providerStatus: await describeProviderStatus(),
      featureStatus: await describeFeatureStatus(),
    })
  })

  ipcMain.handle('diagnostics:support-export', async (event) => {
    if (!isTrustedSender(event)) {
      throw new Error('Unauthorized diagnostics request.')
    }

    const {
      collectSupportBundle,
      writeSupportBundle,
    } = require('../services/diagnostics/support-bundle.cjs')
    const {
      currentEnvironment,
    } = require('../services/release/environment.cjs')

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export Diagnostics Bundle',
      defaultPath: `kryomcode-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) {
      return { cancelled: true }
    }

    if (!String(result.filePath).toLowerCase().endsWith('.json')) {
      throw new Error('Diagnostics export must be a .json file.')
    }

    const bundle = collectSupportBundle({
      getVersion: () => app.getVersion(),
      environment: currentEnvironment({ app }),
      providerStatus: await describeProviderStatus(),
      featureStatus: await describeFeatureStatus(),
    })

    const written = await writeSupportBundle(result.filePath, bundle)

    return { cancelled: false, ...written }
  })
}

// Best-effort status snapshots: every lookup is guarded so a broken
// subsystem degrades the bundle instead of failing the export.
async function describeProviderStatus() {
  try {
    const {
      readProviderConfig,
    } = require('../services/ai/provider-config.cjs')
    const {
      describeProvider,
      registerBuiltins,
    } = require('../services/ai/providers/provider-registry.cjs')

    registerBuiltins()

    const config = await readProviderConfig()
    const meta = describeProvider('meta')

    return {
      selectedProvider: config.selectedProvider,
      selectedModel: config.selectedModel,
      metaConfigured: meta.auth && meta.auth.configured === true,
      metaAvailable: meta.available === true,
    }
  } catch {
    return null
  }
}

async function describeFeatureStatus() {
  try {
    const {
      getWorkspaceRoot,
    } = require('../services/workspace/workspace.service.cjs')
    const {
      getIndexStatus,
    } = require('../services/project-intelligence/code-index.service.cjs')
    const { list } = require('../services/extensions/lifecycle.cjs')
    const { listSkills } = require('../services/skills/skill-store.cjs')
    const { listWorkflows } = require('../services/workflows/workflow-store.cjs')

    const root = getWorkspaceRoot()
    const [index, extensions, skills, workflows] = await Promise.all([
      getIndexStatus().catch(() => null),
      list({}).catch(() => ({ extensions: [] })),
      listSkills({}).catch(() => ({ skills: [] })),
      listWorkflows({}).catch(() => ({ workflows: [] })),
    ])

    return {
      workspaceOpen: Boolean(root),
      workspaceRoot: root,
      indexIndexed: Boolean(index && index.indexed),
      filesIndexed: index && Number.isInteger(index.total) ? index.total : 0,
      extensionsInstalled: extensions.extensions.length,
      extensionsActive: extensions.extensions.filter((entry) => entry.active).length,
      skillsTotal: skills.skills.length,
      workflowsTotal: workflows.workflows.length,
    }
  } catch {
    return null
  }
}
