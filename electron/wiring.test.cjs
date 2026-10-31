const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Wiring regression net: every backend module must load in plain Node
// with its documented exports, every IPC module must export a register
// function, and every relative require inside main/preload must resolve.
// main.cjs and preload.cjs cannot execute outside Electron, so their
// bodies are covered by static require resolution instead.

const MODULES = [
  ['./services/workspace/workspace.service.cjs', ['getWorkspaceRoot', 'setWorkspaceRoot', 'closeWorkspace', 'isInsideWorkspace', 'isInsideScope', 'buildTree']],
  ['./services/filesystem/file.service.cjs', ['readFile', 'saveFile']],
  ['./services/filesystem/directory.service.cjs', ['createFile', 'createDirectory', 'renamePath', 'deletePath', 'readFileWithMeta', 'writeFileIfUnchanged']],
  ['./services/filesystem/file-search.service.cjs', ['searchFiles']],
  ['./services/terminal/terminal.service.cjs', ['runCommand', 'buildChildEnv', 'listRunningProcesses', 'cancelRunningProcesses', 'killAllActiveProcesses']],
  ['./services/terminal/process-manager.cjs', ['registerProcess', 'unregisterProcess', 'listProcesses', 'killAllProcesses', 'killProcessTree']],
  ['./services/terminal/command-validator.cjs', ['classifyCommand']],
  ['./services/ai/ai.service.cjs', ['chat', 'cancelChat']],
  ['./services/ai/chat-store.cjs', ['saveChat', 'restoreChat', 'sanitizeMessages', 'listChatSessions', 'createChatSession', 'switchChatSession', 'renameChatSession', 'deleteChatSession', 'searchChatSessions']],
  ['./services/context/context-files.service.cjs', ['readContextFile']],
  ['./services/ai/ai-config.service.cjs', ['getAIConfig', 'resolveModel', 'isSupportedModel']],
  ['./services/ai/providers/provider.interface.cjs', ['assertImplementsProvider']],
  ['./services/ai/providers/meta-muse.provider.cjs', ['MetaMuseProvider']],
  ['./services/ai/providers/mock.provider.cjs', ['MockProvider']],
  ['./services/ai/providers/provider-registry.cjs', ['registerProvider', 'unregisterProvider', 'getProvider', 'describeProvider', 'listProviders', 'isProviderAvailable', 'createInstance', 'registerBuiltins', 'ensureBuiltins']],
  ['./services/ai/providers/model-catalog.cjs', ['listModels', 'getModel', 'defaultModel', 'validateModelCapabilities']],
  ['./services/ai/provider-config.cjs', ['readProviderConfig', 'writeProviderConfig', 'updateProviderConfig', 'testConnection']],
  ['./services/ai/router.cjs', ['normalizeProviderError', 'resolveRoute', 'routeChat', 'defaultRoute']],
  ['./services/permissions/permission.service.cjs', ['checkPermission', 'requirePermission', 'grantPermission', 'revokePermission', 'listGrants', 'setTrustLevel', 'describePermissions']],
  ['./services/audit/audit.service.cjs', ['appendAudit', 'listAudit']],
  ['./services/extensions/manifest.cjs', ['validateManifest', 'compareVersions', 'checkHostCompatibility']],
  ['./services/extensions/registry.cjs', ['installExtension', 'removeExtension', 'getExtension', 'listExtensions', 'setExtensionEnabled', 'setExtensionError']],
  ['./services/extensions/runtime.cjs', ['activateExtension', 'deactivateExtension', 'executeCommand', 'isExtensionActive', 'listActiveCommands']],
  ['./services/extensions/lifecycle.cjs', ['install', 'enable', 'disable', 'activate', 'deactivate', 'uninstall', 'status', 'list', 'runCommand', 'shutdownAll', 'recoverAtStartup']],
  ['./services/extensions/worker/extension-host.cjs', ['ExtensionHost', 'spawnHost', 'selectLauncher']],
  ['./services/skills/skill-store.cjs', ['validateSkill', 'listSkills', 'getSkill', 'saveSkill', 'deleteSkill', 'setSkillEnabled']],
  ['./services/skills/skill-runner.cjs', ['runSkill']],
  ['./services/workflows/workflow-store.cjs', ['validateWorkflow', 'listWorkflows', 'getWorkflow', 'saveWorkflow', 'deleteWorkflow']],
  ['./services/workflows/workflow-engine.cjs', ['startRun', 'advanceRun', 'approveRun', 'resumeRun', 'cancelRun', 'getRun', 'listRuns']],
  ['./services/integrations/registry.cjs', ['registerAdapter', 'unregisterAdapter', 'getAdapter', 'describeAdapter', 'listAdapters', 'normalizeIntegrationError', 'recordConnection', 'clearConnection', 'connectionState', 'registerBuiltins', 'ensureBuiltins']],
  ['./services/integrations/github.adapter.cjs', ['githubAdapter', 'parseGitHubRepo']],
  ['./services/templates/template-engine.cjs', ['validateTemplateManifest', 'listTemplates', 'getTemplate', 'previewGeneration', 'generateTemplate']],
  ['./services/platform/api-contract.cjs', ['classifyMembraneError', 'checkApiCompatibility', 'membranePaths']],
  ['./services/update/update.service.cjs', ['resolveFeedUrl', 'validateManifest', 'checkForUpdates', 'verifyArtifact', 'downloadArtifact', 'stagedArtifact', 'clearStaged']],
  ['./utils/platform.cjs', ['currentPlatform', 'shouldDetach', 'spawnDefaults', 'resolveExecutable', 'describePlatform']],
  ['./services/terminal/process-manager.cjs', ['killProcessTree', 'markDetachedProcess']],
  ['./services/agent/agent.service.cjs', ['planTask', 'applyEdits', 'cancelPlan']],
  ['./services/agent/plan-store.cjs', ['createPlan', 'listPlans', 'getPlan', 'setStepState', 'attachEvidence', 'recordVerification', 'cancelPlan', 'resumePlan', 'completePlan']],
  ['./services/agent/context-snapshot.cjs', ['buildChatExcerpt', 'buildContextSnapshot', 'checkContextFreshness']],
  ['./services/agent/context.service.cjs', ['gatherSourceContext']],
  ['./services/agent/change-set.cjs', ['buildChangeSet']],
  ['./services/agent/tool-policy.cjs', ['reviewAgentCommand']],
  ['./services/agent/understanding.cjs', ['buildUnderstanding', 'checkBundleFreshness']],
  ['./services/agent/run-summary.cjs', ['buildRunSummary', 'summaryToMarkdown']],
  ['./services/agent/autonomous-run.cjs', ['startRun', 'getRun', 'listRuns', 'getRunProposal', 'cancelRun', 'pauseRun', 'resumeRun', 'approveRun', 'rejectRun', 'extractVerificationCommand', 'reviewAgentCommand']],
  ['./services/planning/plan-builder.cjs', ['buildImplementationPlan', 'reviseImplementationPlan', 'cancelPlanning']],
  ['./services/specialists/specialist.service.cjs', ['runSpecialist', 'getSpecialistRun', 'listSpecialistRuns', 'cancelSpecialistRun']],
  ['./services/orchestration/orchestrator.service.cjs', ['startRun', 'advanceRun', 'approveTask', 'retryTask', 'cancelRun', 'getRun', 'listRuns']],
  ['./services/quality/quality.service.cjs', ['buildQualityReport', 'getQualityReport', 'listQualityReports']],
  ['./services/git/git.service.cjs', ['runGit', 'ensureRepository', 'getStatus', 'getRemotes', 'verifyRemote', 'cloneRepository', 'stageFiles', 'unstageFiles', 'discardChanges', 'commitChanges', 'pushChanges', 'pullChanges', 'killAllActiveProcesses']],
  ['./services/git/git-diff.service.cjs', ['getDiff', 'getChangedFiles']],
  ['./services/diagnostics/diagnostics.service.cjs', ['runDiagnostics']],
  ['./services/diagnostics/support-bundle.cjs', ['recordSupportError', 'collectSupportBundle', 'writeSupportBundle']],
  ['./services/release/environment.cjs', ['detectEnvironment', 'describeEnvironment', 'currentEnvironment']],
  ['./services/diagnostics/problem-parser.cjs', ['parseOutput']],
  ['./services/project-intelligence/project-analyzer.service.cjs', ['getWorkspaceSummary', 'buildWorkspaceContext']],
  ['./services/project-intelligence/dependency-analyzer.service.cjs', ['analyzeDependencies']],
  ['./services/project-intelligence/code-index.service.cjs', ['refreshIndex', 'getIndexStatus', 'checkIndexFreshness', 'selectContext']],
  ['./services/project-intelligence/symbol-index.service.cjs', ['indexSymbols', 'findSymbol', 'findReferences']],
  ['./services/project-intelligence/architecture.service.cjs', ['analyzeArchitecture']],
  ['./services/project-intelligence/semantic-search.service.cjs', ['searchProject', 'parseQuery']],
  ['./services/project-intelligence/impact-analysis.service.cjs', ['analyzeImpact']],
  ['./services/settings/settings.service.cjs', ['readSettings', 'updateSettings']],
  ['./services/settings/secrets.service.cjs', ['getSecret', 'isSecretKey', 'getSecretSource', 'setCachedSecret', 'clearCachedSecret', 'clearCachedSecrets']],
  ['./services/settings/credential-vault.cjs', ['isVaultAvailable', 'loadVault', 'setVaultSecret', 'removeVaultSecret', 'vaultStatus']],
  ['./services/ui/ui-state.service.cjs', ['readUIState', 'writeUIState', 'addRecent', 'clearRecent', 'removeRecent', 'setAutoSave']],
  ['./security/validate-path.cjs', ['resolveWorkspacePath']],
  ['./security/storage-path.cjs', ['assertSafeSegments', 'resolveStoragePath', 'ensureStorageDir', 'writeStorageFile', 'readStorageFile', 'listStorageFiles']],
  ['./security/validate-input.cjs', ['assertPlainObject', 'assertNonEmptyString', 'assertOptionalString', 'assertStringArray', 'assertEnum', 'assertBoolean', 'assertExternalUrl']],
  ['./security/trusted-sender.cjs', ['createTrustedSender']],
  ['./security/renderer-urls.cjs', ['isDevAppUrl', 'isProdEntryUrl', 'isAllowedMainFrameUrl']],
  ['./security/content-security-policy.cjs', ['buildProductionCsp', 'buildDevelopmentCsp']],
  ['./security/protocol-handler.cjs', ['createAppProtocolHandler']],
  ['./utils/errors.cjs', ['createError', 'boundDetail']],
  ['./utils/logger.cjs', ['createLogger', 'redact', 'redactText', 'setLogLevel', 'currentLevel']],
  ['./services/research/search-providers.cjs', ['searchAll', 'deduplicateSources', 'normalizeSource']],
  ['./services/research/url-fetch.service.cjs', ['fetchExcerpt', 'assertSafeUrl', 'isBlockedHost', 'isBlockedIp', 'stripMarkup', 'buildPinnedLookup', 'buildPinnedTransport']],
  ['./services/research/session-store.cjs', ['createSession', 'readSession', 'writeSession', 'listSessions', 'getActiveSession']],
  ['./services/research/brief.service.cjs', ['validateBrief', 'buildExtractiveBrief', 'buildResearchContext', 'loadResearchContext']],
  ['./services/research/research.service.cjs', ['startResearch', 'getStatus', 'cancelResearch', 'resumeResearch']],
  ['./services/research/depth-profiles.cjs', ['resolveDepth', 'getProfile']],
  ['./services/research/planner.cjs', ['planResearch', 'parsePlanJson']],
  ['./services/research/evidence.cjs', ['verifySession', 'extractClaims']],
  ['./services/research/credibility.cjs', ['assessSource', 'rankSources']],
  ['./services/documents/document.service.cjs', ['exportBriefDocx', 'exportTextDocx', 'importDocxFile']],
  ['./services/memory/memory.store.cjs', ['listMemories', 'getMemory', 'createMemory', 'updateMemory', 'deleteMemory']],
]

const IPC_MODULES = [
  './ipc/workspace.ipc.cjs',
  './ipc/filesystem.ipc.cjs',
  './ipc/terminal.ipc.cjs',
  './ipc/ai.ipc.cjs',
  './ipc/git.ipc.cjs',
  './ipc/diagnostics.ipc.cjs',
  './ipc/project-intelligence.ipc.cjs',
  './ipc/agent.ipc.cjs',
  './ipc/settings.ipc.cjs',
  './ipc/research.ipc.cjs',
  './ipc/app.ipc.cjs',
  './ipc/documents.ipc.cjs',
  './ipc/memory.ipc.cjs',
  './ipc/platform.ipc.cjs',
  './ipc/update.ipc.cjs',
  './ipc/register-handlers.cjs',
]

function relativeRequires(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8')

  return [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)]
    .map((match) => match[1])
    .filter((spec) => spec.startsWith('.'))
}

describe('backend wiring', () => {
  it('loads every service, security, and utility module', () => {
    for (const [modulePath, exports] of MODULES) {
      const loaded = require(modulePath)

      for (const name of exports) {
        assert.equal(
          typeof loaded[name] === 'function' || typeof loaded[name] === 'object',
          true,
          `${modulePath} must export ${name}`
        )
      }
    }
  })

  it('loads every IPC module with a register function', () => {
    for (const modulePath of IPC_MODULES) {
      assert.equal(typeof require(modulePath), 'function', modulePath)
    }
  })

  it('resolves every relative require in main and preload', () => {
    const mainRequires = relativeRequires(path.join(__dirname, 'main.cjs'))

    assert.ok(mainRequires.length > 0, 'main.cjs should have relative requires')

    for (const entry of ['main.cjs', 'preload.cjs']) {
      for (const spec of relativeRequires(path.join(__dirname, entry))) {
        assert.doesNotThrow(
          () => require.resolve(path.join(__dirname, spec)),
          `${entry}: ${spec}`
        )
      }
    }
  })
})
