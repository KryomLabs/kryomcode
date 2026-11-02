const { contextBridge, ipcRenderer } = require('electron')

// Minimal capability bridge: each method maps to one validated main
// process channel. No Node.js APIs, no file system, and no secrets are
// exposed to the renderer.

contextBridge.exposeInMainWorld('kryom', {
  platform: process.platform,

  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },

  openWorkspace: () => ipcRenderer.invoke('workspace:open'),

  openFile: () => ipcRenderer.invoke('workspace:open-file'),

  openPath: (dirPath) =>
    ipcRenderer.invoke('workspace:open-path', dirPath),

  closeWorkspace: () => ipcRenderer.invoke('workspace:close'),

  refreshWorkspace: () => ipcRenderer.invoke('workspace:refresh'),

  readFile: (filePath) =>
    ipcRenderer.invoke('workspace:read-file', filePath),

  readContextFile: (payload) =>
    ipcRenderer.invoke('context:read-file', payload),

  saveFile: (filePath, content) =>
    ipcRenderer.invoke('workspace:save-file', filePath, content),

  readFileMeta: (filePath) =>
    ipcRenderer.invoke('filesystem:read-meta', filePath),

  saveFileConditional: (filePath, content, expectedMtimeMs) =>
    ipcRenderer.invoke(
      'filesystem:save-conditional',
      filePath,
      content,
      expectedMtimeMs
    ),

  saveAs: (content, suggestedName) =>
    ipcRenderer.invoke('filesystem:save-as', content, suggestedName),

  createPath: (payload) =>
    ipcRenderer.invoke('filesystem:create', payload),

  renamePath: (payload) =>
    ipcRenderer.invoke('filesystem:rename', payload),

  deletePath: (targetPath) =>
    ipcRenderer.invoke('filesystem:delete', targetPath),

  searchFiles: (payload) =>
    ipcRenderer.invoke('search:files', payload),

  runCommand: (command) =>
    ipcRenderer.invoke('terminal:run', command),

  cancelCommand: () =>
    ipcRenderer.invoke('terminal:cancel'),

  getTerminalStatus: () =>
    ipcRenderer.invoke('terminal:status'),

  askAI: (payload) =>
    ipcRenderer.invoke('ai:chat', payload),

  cancelAI: () =>
    ipcRenderer.invoke('ai:cancel'),

  classifyCommand: (command) =>
    ipcRenderer.invoke('terminal:classify', { command }),

  saveChat: (messages, root) =>
    ipcRenderer.invoke('chat:save', { messages, root }),

  restoreChat: () =>
    ipcRenderer.invoke('chat:restore'),

  listChatSessions: () =>
    ipcRenderer.invoke('chat:sessions'),

  createChatSession: (payload) =>
    ipcRenderer.invoke('chat:create', payload),

  switchChatSession: (payload) =>
    ipcRenderer.invoke('chat:switch', payload),

  renameChatSession: (payload) =>
    ipcRenderer.invoke('chat:rename', payload),

  deleteChatSession: (payload) =>
    ipcRenderer.invoke('chat:delete', payload),

  searchChatSessions: (payload) =>
    ipcRenderer.invoke('chat:search', payload),

  planAgentTask: (payload) =>
    ipcRenderer.invoke('agent:plan', payload),

  cancelAgentPlan: () =>
    ipcRenderer.invoke('agent:cancel'),

  applyAgentEdits: (payload) =>
    ipcRenderer.invoke('agent:apply', payload),

  buildAgentChangeSet: (payload) =>
    ipcRenderer.invoke('agent:change-set', payload),

  listCheckpoints: () =>
    ipcRenderer.invoke('agent:checkpoints'),

  undoCheckpoint: (checkpointId) =>
    ipcRenderer.invoke('agent:undo', { checkpointId }),

  getAgentContext: (payload) =>
    ipcRenderer.invoke('agent:context', payload),

  getAgentChatExcerpt: () =>
    ipcRenderer.invoke('agent:chat-excerpt'),

  trackAgentPlan: (payload) =>
    ipcRenderer.invoke('agent:track-plan', payload),

  listAgentPlans: () =>
    ipcRenderer.invoke('agent:plans'),

  getAgentPlan: (payload) =>
    ipcRenderer.invoke('agent:plan-get', payload),

  setAgentPlanStep: (payload) =>
    ipcRenderer.invoke('agent:plan-step', payload),

  attachAgentPlanEvidence: (payload) =>
    ipcRenderer.invoke('agent:plan-evidence', payload),

  recordAgentVerification: (payload) =>
    ipcRenderer.invoke('agent:plan-verify', payload),

  cancelAgentPlanRecord: (payload) =>
    ipcRenderer.invoke('agent:plan-cancel', payload),

  resumeAgentPlan: (payload) =>
    ipcRenderer.invoke('agent:plan-resume', payload),

  completeAgentPlan: (payload) =>
    ipcRenderer.invoke('agent:plan-complete', payload),

  startRepairCycle: (payload) =>
    ipcRenderer.invoke('agent:repair-start', payload),

  proposeRepairCycle: (payload) =>
    ipcRenderer.invoke('agent:repair-propose', payload),

  applyRepairCycle: (payload) =>
    ipcRenderer.invoke('agent:repair-apply', payload),

  recordRepairCycle: (payload) =>
    ipcRenderer.invoke('agent:repair-record', payload),

  cancelRepairCycle: (payload) =>
    ipcRenderer.invoke('agent:repair-cancel', payload),

  getRepairCycle: (payload) =>
    ipcRenderer.invoke('agent:repair-get', payload),

  buildImplPlan: (payload) =>
    ipcRenderer.invoke('agent:impl-plan', payload),

  reviseImplPlan: (payload) =>
    ipcRenderer.invoke('agent:impl-plan-revise', payload),

  cancelImplPlan: () =>
    ipcRenderer.invoke('agent:impl-plan-cancel'),

  runSpecialist: (payload) =>
    ipcRenderer.invoke('agent:specialist-run', payload),

  getSpecialistRun: (payload) =>
    ipcRenderer.invoke('agent:specialist-get', payload),

  cancelSpecialistRun: (payload) =>
    ipcRenderer.invoke('agent:specialist-cancel', payload),

  listSpecialistRuns: () =>
    ipcRenderer.invoke('agent:specialist-list'),

  startOrchRun: (payload) =>
    ipcRenderer.invoke('agent:orch-start', payload),

  advanceOrchRun: (payload) =>
    ipcRenderer.invoke('agent:orch-advance', payload),

  approveOrchTask: (payload) =>
    ipcRenderer.invoke('agent:orch-approve', payload),

  retryOrchTask: (payload) =>
    ipcRenderer.invoke('agent:orch-retry', payload),

  cancelOrchRun: (payload) =>
    ipcRenderer.invoke('agent:orch-cancel', payload),

  getOrchRun: (payload) =>
    ipcRenderer.invoke('agent:orch-get', payload),

  listOrchRuns: () =>
    ipcRenderer.invoke('agent:orch-list'),

  startAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-start', payload),

  getAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-get', payload),

  listAgentRuns: () =>
    ipcRenderer.invoke('agent:run-list'),

  getAgentRunProposal: (payload) =>
    ipcRenderer.invoke('agent:run-proposal', payload),

  cancelAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-cancel', payload),

  cancelAgentVerification: () =>
    ipcRenderer.invoke('agent:cancel-verification'),

  pauseAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-pause', payload),

  resumeAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-resume', payload),

  approveAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-approve', payload),

  rejectAgentRun: (payload) =>
    ipcRenderer.invoke('agent:run-reject', payload),

  gitStatus: () =>
    ipcRenderer.invoke('git:status'),

  gitDiff: (payload) =>
    ipcRenderer.invoke('git:diff', payload),

  gitChangedFiles: (payload) =>
    ipcRenderer.invoke('git:changed-files', payload),

  gitStage: (paths) =>
    ipcRenderer.invoke('git:stage', paths),

  gitUnstage: (paths) =>
    ipcRenderer.invoke('git:unstage', paths),

  gitDiscard: (paths) =>
    ipcRenderer.invoke('git:discard', paths),

  gitCommit: (payload) =>
    ipcRenderer.invoke('git:commit', payload),

  gitPush: (payload) =>
    ipcRenderer.invoke('git:push', payload),

  gitPull: (payload) =>
    ipcRenderer.invoke('git:pull', payload),

  gitRemotes: () =>
    ipcRenderer.invoke('git:remotes'),

  gitVerify: (payload) =>
    ipcRenderer.invoke('git:verify', payload),

  gitClone: (payload) =>
    ipcRenderer.invoke('git:clone', payload),

  cancelGit: () =>
    ipcRenderer.invoke('git:cancel'),

  exportBriefDocx: (payload) =>
    ipcRenderer.invoke('documents:export-brief', payload),

  exportTextDocx: (payload) =>
    ipcRenderer.invoke('documents:export-text', payload),

  importDocx: () =>
    ipcRenderer.invoke('documents:import'),

  runDiagnostics: (payload) =>
    ipcRenderer.invoke('diagnostics:run', payload),

  cancelDiagnostics: () =>
    ipcRenderer.invoke('diagnostics:cancel'),

  getWorkspaceSummary: () =>
    ipcRenderer.invoke('intelligence:summary'),

  getWorkspaceContext: (payload) =>
    ipcRenderer.invoke('intelligence:context', payload),

  getIndexStatus: () =>
    ipcRenderer.invoke('intelligence:index-status'),

  refreshIndex: (payload) =>
    ipcRenderer.invoke('intelligence:index-refresh', payload),

  checkIndexFreshness: (payload) =>
    ipcRenderer.invoke('intelligence:index-freshness', payload),

  scanSymbols: (payload) =>
    ipcRenderer.invoke('intelligence:symbols', payload),

  findSymbol: (payload) =>
    ipcRenderer.invoke('intelligence:symbol', payload),

  findReferences: (payload) =>
    ipcRenderer.invoke('intelligence:references', payload),

  searchProject: (payload) =>
    ipcRenderer.invoke('intelligence:search', payload),

  analyzeImpact: (payload) =>
    ipcRenderer.invoke('intelligence:impact', payload),

  analyzeArchitecture: () =>
    ipcRenderer.invoke('intelligence:architecture'),

  buildQualityReport: (payload) =>
    ipcRenderer.invoke('diagnostics:quality', payload),

  getQualityReport: (payload) =>
    ipcRenderer.invoke('diagnostics:quality-get', payload),

  listQualityReports: () =>
    ipcRenderer.invoke('diagnostics:quality-list'),

  previewSupportBundle: () =>
    ipcRenderer.invoke('diagnostics:support-preview'),

  exportSupportBundle: () =>
    ipcRenderer.invoke('diagnostics:support-export'),

  getUpdateStatus: () =>
    ipcRenderer.invoke('update:status'),

  checkForUpdates: () =>
    ipcRenderer.invoke('update:check'),

  downloadUpdate: () =>
    ipcRenderer.invoke('update:download', {}),

  cancelUpdate: () =>
    ipcRenderer.invoke('update:cancel'),

  clearStagedUpdate: () =>
    ipcRenderer.invoke('update:clear'),

  getSettings: () =>
    ipcRenderer.invoke('settings:get'),

  updateSettings: (patch) =>
    ipcRenderer.invoke('settings:update', patch),

  startResearch: (payload) =>
    ipcRenderer.invoke('research:start', payload),

  getResearchStatus: (payload) =>
    ipcRenderer.invoke('research:status', payload),

  getActiveResearch: () =>
    ipcRenderer.invoke('research:active'),

  listResearch: () =>
    ipcRenderer.invoke('research:list'),

  getResearch: (payload) =>
    ipcRenderer.invoke('research:get', payload),

  getResearchBrief: (payload) =>
    ipcRenderer.invoke('research:brief', payload),

  cancelResearch: (payload) =>
    ipcRenderer.invoke('research:cancel', payload),

  resumeResearch: (payload) =>
    ipcRenderer.invoke('research:resume', payload),

  selectResearch: (payload) =>
    ipcRenderer.invoke('research:select', payload),

  renameResearch: (payload) =>
    ipcRenderer.invoke('research:rename', payload),

  deleteResearch: (payload) =>
    ipcRenderer.invoke('research:delete', payload),

  searchResearch: (payload) =>
    ipcRenderer.invoke('research:search', payload),

  exportResearch: (payload) =>
    ipcRenderer.invoke('research:export', payload),

  handoffResearch: (payload) =>
    ipcRenderer.invoke('research:handoff', payload),

  listMemories: () =>
    ipcRenderer.invoke('memory:list'),

  getMemory: (payload) =>
    ipcRenderer.invoke('memory:get', payload),

  createMemory: (payload) =>
    ipcRenderer.invoke('memory:create', payload),

  updateMemory: (payload) =>
    ipcRenderer.invoke('memory:update', payload),

  deleteMemory: (payload) =>
    ipcRenderer.invoke('memory:delete', payload),

  deleteAllMemories: () =>
    ipcRenderer.invoke('memory:delete-all'),

  exportMemories: () =>
    ipcRenderer.invoke('memory:export'),

  listProviders: () =>
    ipcRenderer.invoke('provider:list'),

  getProvider: (payload) =>
    ipcRenderer.invoke('provider:get', payload),

  getProviderSelection: () =>
    ipcRenderer.invoke('provider:selection'),

  configureProvider: (payload) =>
    ipcRenderer.invoke('provider:configure', payload),

  listProviderModels: (payload) =>
    ipcRenderer.invoke('provider:models', payload),

  getProviderModel: (payload) =>
    ipcRenderer.invoke('provider:model', payload),

  testProvider: (payload) =>
    ipcRenderer.invoke('provider:test', payload),

  setProviderKey: (payload) =>
    ipcRenderer.invoke('provider:set-key', payload),

  removeProviderKey: (payload) =>
    ipcRenderer.invoke('provider:remove-key', payload),

  getProviderKeyStatus: (payload) =>
    ipcRenderer.invoke('provider:key-status', payload),

  listPermissions: () =>
    ipcRenderer.invoke('permission:list'),

  listPermissionGrants: (payload) =>
    ipcRenderer.invoke('permission:grants', payload),

  checkPermission: (payload) =>
    ipcRenderer.invoke('permission:check', payload),

  grantPermission: (payload) =>
    ipcRenderer.invoke('permission:grant', payload),

  revokePermission: (payload) =>
    ipcRenderer.invoke('permission:revoke', payload),

  listAuditEvents: (payload) =>
    ipcRenderer.invoke('audit:list', payload),

  listExtensions: () =>
    ipcRenderer.invoke('extension:list'),

  getExtension: (payload) =>
    ipcRenderer.invoke('extension:get', payload),

  pickExtensionDirectory: () =>
    ipcRenderer.invoke('extension:pick-directory'),

  installExtension: (payload) =>
    ipcRenderer.invoke('extension:install', payload),

  enableExtension: (payload) =>
    ipcRenderer.invoke('extension:enable', payload),

  disableExtension: (payload) =>
    ipcRenderer.invoke('extension:disable', payload),

  activateExtension: (payload) =>
    ipcRenderer.invoke('extension:activate', payload),

  deactivateExtension: (payload) =>
    ipcRenderer.invoke('extension:deactivate', payload),

  uninstallExtension: (payload) =>
    ipcRenderer.invoke('extension:uninstall', payload),

  runExtensionCommand: (payload) =>
    ipcRenderer.invoke('extension:command', payload),

  listSkills: () =>
    ipcRenderer.invoke('skill:list'),

  getSkill: (payload) =>
    ipcRenderer.invoke('skill:get', payload),

  saveSkill: (payload) =>
    ipcRenderer.invoke('skill:save', payload),

  deleteSkill: (payload) =>
    ipcRenderer.invoke('skill:delete', payload),

  setSkillEnabled: (payload) =>
    ipcRenderer.invoke('skill:set-enabled', payload),

  runSkill: (payload) =>
    ipcRenderer.invoke('skill:run', payload),

  listWorkflows: () =>
    ipcRenderer.invoke('workflow:list'),

  getWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:get', payload),

  saveWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:save', payload),

  deleteWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:delete', payload),

  startWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:start', payload),

  advanceWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:advance', payload),

  approveWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:approve', payload),

  resumeWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:resume', payload),

  cancelWorkflow: (payload) =>
    ipcRenderer.invoke('workflow:cancel', payload),

  getWorkflowRun: (payload) =>
    ipcRenderer.invoke('workflow:get-run', payload),

  listWorkflowRuns: () =>
    ipcRenderer.invoke('workflow:runs'),

  listIntegrations: () =>
    ipcRenderer.invoke('integration:list'),

  getIntegrationStatus: (payload) =>
    ipcRenderer.invoke('integration:status', payload),

  connectIntegration: (payload) =>
    ipcRenderer.invoke('integration:connect', payload),

  disconnectIntegration: (payload) =>
    ipcRenderer.invoke('integration:disconnect', payload),

  listIntegrationRepositories: (payload) =>
    ipcRenderer.invoke('integration:repositories', payload),

  getIntegrationHistory: (payload) =>
    ipcRenderer.invoke('integration:history', payload),

  listTemplates: () =>
    ipcRenderer.invoke('template:list'),

  getTemplate: (payload) =>
    ipcRenderer.invoke('template:get', payload),

  pickTemplateDestination: () =>
    ipcRenderer.invoke('template:pick-destination'),

  previewTemplate: (payload) =>
    ipcRenderer.invoke('template:preview', payload),

  generateTemplate: (payload) =>
    ipcRenderer.invoke('template:generate', payload),

  getAppVersion: () =>
    ipcRenderer.invoke('app:get-version'),

  pickContextFiles: () =>
    ipcRenderer.invoke('dialog:pick-context-files'),

  openExternal: (url) =>
    ipcRenderer.invoke('app:open-external', url),

  getAIStatus: () =>
    ipcRenderer.invoke('app:get-ai-status'),

  getUIState: () =>
    ipcRenderer.invoke('ui:get'),

  setUIState: (patch) =>
    ipcRenderer.invoke('ui:set', patch),

  pushUIContext: (ctx) =>
    ipcRenderer.invoke('ui:context', ctx),

  onCommand: (handler) => {
    const listener = (_event, command) => handler(command)

    ipcRenderer.on('kryom:command', listener)

    return () =>
      ipcRenderer.removeListener('kryom:command', listener)
  },

  onUIState: (handler) => {
    const listener = (_event, state) => handler(state)

    ipcRenderer.on('kryom:ui', listener)

    return () =>
      ipcRenderer.removeListener('kryom:ui', listener)
  },
})
