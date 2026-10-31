interface KryomNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: KryomNode[]
}

interface KryomWorkspace {
  root: string
  tree: KryomNode[]
}

interface KryomChatSession {
  id: string
  title: string
  messageCount: number
  updatedAt: string | null
}

interface KryomChatSearchMatch {
  id: string
  title: string
  messageCount: number
  updatedAt: string | null
  titleMatched: boolean
  matchCount: number
  snippet: string
}

interface KryomContextFile {
  path: string
  name: string
  chars: number
  truncated: boolean
  excerpt: string
}

interface KryomAIMessage {
  role: 'user' | 'assistant'
  content: string
  model?: string
}

interface KryomAIResponse {
  answer: string
  model: string
  researchSessionId?: string
}

interface KryomFileMeta {
  content: string
  mtimeMs: number
  size: number
  path: string
}

interface KryomSearchMatch {
  path: string
  relativePath: string
  line?: number
  text?: string
}

interface KryomSearchResult {
  matches: KryomSearchMatch[]
  truncated: boolean
  searchedFiles: number
}

interface KryomTerminalResult {
  exitCode: number
  output: string
  timedOut: boolean
  cancelled: boolean
  outputLimited: boolean
  warnings: string[]
}

interface KryomRunningProcess {
  id: string
  command: string
  startedAt: number
}

interface KryomAgentEdit {
  index?: number
  path: string
  action: 'create' | 'modify' | 'delete'
  content?: string
  contentLength?: number
  preview?: string
  reason?: string
  originalDigest?: string
  originalLength?: number
}

interface KryomAgentContextFile {
  path: string
  relativePath: string
  bytes: number
}

interface KryomAgentContextExcluded {
  path: string
  reason: string
}

interface KryomAgentContextPreview {
  files: KryomAgentContextFile[]
  excluded: KryomAgentContextExcluded[]
  totalBytes: number
}

interface KryomAgentPlan {
  model: string
  task: string
  researchSessionId?: string
  contextFiles: KryomAgentContextFile[]
  contextExcluded: KryomAgentContextExcluded[]
  totalContextBytes: number
  edits: KryomAgentEdit[]
  commands: string[]
  notes: string
  expectedOutcome?: string
  risks?: KryomPlanRisk[]
  suggestedSteps?: string[]
  contextSnapshot?: KryomContextSnapshot | null
}

interface KryomPlanRisk {
  severity: 'low' | 'medium' | 'high'
  explanation: string
  mitigation: string
}

type KryomPlanStepState =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'verified'
  | 'blocked'
  | 'failed'
  | 'cancelled'

interface KryomPlanEvidence {
  kind: 'checkpoint' | 'report' | 'diagnostics' | 'file' | 'commit' | 'note' | 'research' | 'chat'
  ref: string
  summary: string
  at: string
}

interface KryomChatExcerpt {
  messageCount: number
  chars: number
  truncated: boolean
  excerpt: string
  digest: string
  at: string
}

interface KryomContextFileSnapshot {
  relativePath: string
  bytes: number
  digest: string
  excerpt: string
  status?: 'current' | 'stale' | 'missing'
  reason?: string
}

interface KryomContextResearchSnapshot {
  sessionId: string
  objective: string
  status: string
  briefVersion: number
  excerptChars: number
  digest: string
  at: string
  freshness?: 'current' | 'stale' | 'missing'
  freshnessReason?: string
}

interface KryomContextWorkspaceSnapshot {
  projectName: string
  chars: number
  digest: string
  at: string
}

interface KryomContextSnapshot {
  at: string
  projectName: string
  files: KryomContextFileSnapshot[]
  research: KryomContextResearchSnapshot | null
  chat: (KryomChatExcerpt & { status?: string; reason?: string }) | null
  workspace: (KryomContextWorkspaceSnapshot & { status?: string; reason?: string }) | null
}

interface KryomPlanStep {
  id: string
  kind: 'review' | 'task' | 'apply' | 'verify'
  label: string
  state: KryomPlanStepState
  startedAt: string | null
  finishedAt: string | null
  detail: string
  evidence: KryomPlanEvidence[]
  interrupted: boolean
}

type KryomReportConclusion =
  | 'passed'
  | 'failed'
  | 'cancelled'
  | 'timed_out'
  | 'blocked'
  | 'skipped'
  | 'not_executed'

interface KryomReportExecution {
  runId: string
  command: string
  startedAt: string
  completedAt: string
  durationMs: number
  exitCode: number
  timedOut: boolean
  cancelled: boolean
  source: 'diagnostics'
}

interface KryomModelExplanation {
  summary: string
  failureAnalysis: string | null
  suggestedNextSteps: string | null
}

interface KryomVerificationReport {
  id: string
  planId: string
  stepId: string
  check: string
  result: 'pass' | 'fail' | 'error'
  conclusion: KryomReportConclusion
  legacyProvenance: boolean
  exitCode: number | null
  timedOut: boolean
  outputSummary: string
  at: string
  liveProvider: false
  origin: 'command'
  execution: KryomReportExecution | null
  diagnosis: KryomDiagnosis | null
  modelExplanation: KryomModelExplanation | null
  repair: {
    cycleId: string
    attempt: number
    attemptId: string
    checkpointId: string | null
    appliedFiles: string[]
  } | null
}

interface KryomTrackedPlan {
  id: string
  projectName: string
  title: string
  objective: string
  expectedOutcome: string
  risks: KryomPlanRisk[]
  steps: KryomPlanStep[]
  context: KryomContextSnapshot | null
  status: 'active' | 'completed' | 'cancelled'
  verification: 'unverified' | 'partial' | 'verified' | 'failed'
  reports: KryomVerificationReport[]
  createdAt: string
  updatedAt: string
}

type KryomRepairState =
  | 'awaiting-proposal'
  | 'proposing'
  | 'awaiting-approval'
  | 'applying'
  | 'awaiting-verification'
  | 'recording'
  | 'passed'
  | 'exhausted'
  | 'expired'
  | 'cancelled'
  | 'approval-denied'
  | 'stale'
  | 'checkpoint-failed'
  | 'error'

interface KryomRepairAttempt {
  n: number
  attemptId: string
  proposal: KryomAgentPlan | null
  checkpointId: string | null
  appliedFiles: string[]
  reportId: string | null
  startedAt: string
  endedAt: string | null
  durationMs: number | null
}

interface KryomRepairCycle {
  version: 1
  id: string
  planId: string
  stepId: string
  check: string
  diagnosis: KryomDiagnosis | null
  budgetMs: number
  createdAt: string
  deadline: number
  state: KryomRepairState
  stopReason: string | null
  stoppedAt: string | null
  detail: string
  attempts: KryomRepairAttempt[]
  interrupted: boolean
  remainingAttempts: number
  remainingMs: number
  elapsedMs: number
}

interface KryomStaleFinding {
  index: number
  action: string
  path: string
  status: 'current' | 'stale' | 'missing' | 'inaccessible' | 'unverified'
  reason: string
}

interface KryomAgentApplyResult {
  completed: boolean
  cancelled: boolean
  applied: Array<{ path: string; action: string }>
  failed: { message: string } | null
  rolledBack: boolean
  stale?: KryomStaleFinding[]
  conflicts?: Array<{ path: string; indexes: number[] }>
  checkpoint:
    | { id: string; files: number }
    | { error: string }
    | null
}

interface KryomChangeSetImport {
  specifier: string
  kind: 'import' | 'dynamic-import' | 'export' | 'require'
  status: 'resolved' | 'unresolved' | 'unknown' | 'external'
  target: string | null
  reason: string
}

interface KryomChangeSetTarget {
  index: number
  action: 'create' | 'modify' | 'delete'
  path: string
  status: string
  statusReason: string
  language: 'js' | 'ts' | 'unsupported'
  analysisSource: 'proposed' | 'current' | 'none'
  fingerprint: string | null
  fingerprintLength: number | null
  currentDigest: string | null
  currentLength: number | null
  imports: KryomChangeSetImport[]
  specifiersTruncated: boolean
}

interface KryomChangeSetIssue {
  kind?: 'conflict' | 'freshness' | 'delete-dependent'
  index: number | null
  path: string | null
  reason: string
}

interface KryomChangeSetManifest {
  version: 1
  at: string
  projectName: string
  targets: KryomChangeSetTarget[]
  externalDependencies: Array<{
    path: string
    depth: number
    digest: string | null
    length: number | null
    status: string
  }>
  edges: Array<{ from: number; to: number; via: string }>
  order: number[]
  orderReason: string
  cycles: string[][]
  conflicts: Array<{ path: string; indexes: number[] }>
  reviewGroups: Array<{ indexes: number[]; files: string[] }>
  unresolved: Array<{ from: string; specifier: string; reason: string }>
  totalUnresolved: number
  externals: string[]
  totalExternals: number
  totalUnknown: number
  validation: {
    ok: boolean
    blockers: KryomChangeSetIssue[]
    warnings: KryomChangeSetIssue[]
  }
  bounds: {
    targets: number
    filesParsed: number
    edges: number
    depthReached: number
    truncated: boolean
  }
}

interface KryomCheckpoint {
  id: string
  createdAt: string
  task: string | null
  files: number
}

interface KryomUndoResult {
  id: string
  completed: boolean
  restored: string[]
  skipped: Array<{ path: string; reason: string }>
  failures: Array<{ path: string; reason: string }>
}

interface KryomGitStatus {
  branch: string | null
  upstream: string | null
  toplevel: string
  staged: string[]
  unstaged: string[]
  untracked: string[]
  clean: boolean
}

interface KryomGitDiff {
  diff: string
  truncated: boolean
  staged: boolean
}

interface KryomDiagnostic {
  file: string
  line: number
  column: number
  severity: 'error' | 'warning'
  code: string | null
  message: string
  source: string
}

interface KryomDiagnosisFinding {
  id: string
  category:
    | 'assertion_failure'
    | 'compilation_error'
    | 'type_error'
    | 'missing_dependency'
    | 'configuration_error'
    | 'runtime_error'
    | 'timeout'
    | 'cancelled'
    | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  file: string | null
  line: number | null
  column: number | null
  test: string | null
  summary: string
  evidence: string
}

interface KryomDiagnosis {
  runId: string
  command: string
  status: 'passed' | 'failed' | 'timeout' | 'cancelled'
  runner: 'node-test' | 'tsc' | 'eslint' | 'pytest' | 'unknown'
  exitCode: number
  timedOut: boolean
  cancelled: boolean
  durationMs: number
  provenance: 'executed' | 'fixture'
  at: string
  planId: string | null
  stepId: string | null
  summary: string
  findings: KryomDiagnosisFinding[]
}

interface KryomDiagnosticsResult {
  success: boolean
  exitCode: number
  timedOut: boolean
  cancelled: boolean
  outputLimited: boolean
  warnings: string[]
  output: string
  diagnostics: KryomDiagnostic[]
  diagnosticsTruncated: boolean
  durationMs: number
  diagnosis: KryomDiagnosis
}

interface KryomWorkspaceSummary {
  root: string
  projectType: string
  frameworks: string[]
  scripts: Record<string, string>
  description: string | null
  configs: string[]
  fileIndex: Array<{ relativePath: string; size: number }>
  counts: {
    files: number
    directories: number
    skipped: number
    truncated: boolean
  }
}

interface KryomWorkspaceContext {
  context: string
  truncated: boolean
  projectType: string
}

interface KryomSettings {
  defaultModel: string
  aiContextEnabled: boolean
  confirmAllCommands: boolean
  panelLeftWidth: number
  panelRightWidth: number
  panelBottomHeight: number
}

interface KryomResearchStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  detail: string
  error: string
  startedAt: string | null
  finishedAt: string | null
}

interface KryomResearchQualitySignal {
  label: string
  detail: string
  polarity: 'positive' | 'neutral' | 'caution'
}

interface KryomResearchQuality {
  signals: KryomResearchQualitySignal[]
  summary: string
}

interface KryomResearchSource {
  id?: string
  provider: string
  title: string
  url: string
  authors: string[]
  publishedAt: string | null
  abstract: string
  venue: string
  doi: string | null
  sourceType: string
  accessStatus: string
  excerpt: string
  supports?: string[]
  retrievedAt?: string | null
  quality?: KryomResearchQuality | null
}

interface KryomResearchFinding {
  claim: string
  sourceIndexes: number[]
  confidence: string
  note: string
}

interface KryomResearchSubQuestion {
  id: string
  text: string
  queries: string[]
  status: 'pending' | 'running' | 'done' | 'failed'
  sourcesFound?: number
  error?: string
}

interface KryomResearchPlan {
  subQuestions: KryomResearchSubQuestion[]
  searchTerms: string[]
  evidenceNeeds: string[]
  ambiguityNotes: string[]
  via: string
}

interface KryomResearchClaim {
  id: string
  text: string
  sourceId: string | null
  questionIds: string[]
  method: string
  status?: string
  supportingSourceIds?: string[]
  explanation?: string
  conflictNote?: string
}

interface KryomResearchConflict {
  id: string
  claimIds: string[]
  sourceIds: string[]
  topic: string
  status: string
  description: string
}

type KryomResearchDepth = 'quick' | 'standard' | 'deep'

interface KryomResearchSession {
  id: string
  version: number
  objective: string
  name?: string
  depth?: KryomResearchDepth
  questions: string[]
  queries: Array<{ query: string; questionId?: string; at: string }>
  steps: KryomResearchStep[]
  plan?: KryomResearchPlan
  sources: KryomResearchSource[]
  evidence: Array<{ sourceUrl: string; excerpt: string; at: string }>
  findings: KryomResearchFinding[]
  claims?: KryomResearchClaim[]
  conflicts?: KryomResearchConflict[]
  decisions: Array<{ text: string; at: string }>
  brief: { version: number; markdown: string; generatedAt: string | null; via: string }
  implementationTasks: string[]
  verification: string[]
  errors: Array<{ where: string; message: string; at: string }>
  status: 'running' | 'completed' | 'blocked' | 'cancelled' | 'failed'
  statusDetail: string
  createdAt: string
  updatedAt: string
}

interface KryomResearchSummary {
  id: string
  objective: string
  name?: string
  depth?: string
  status: string
  sources: number
  briefVersion: number
  updatedAt: string
  createdAt: string
}

type KryomMemoryType = 'decision' | 'convention' | 'fact'

interface KryomMemorySourceSpec {
  kind: 'file' | 'chat' | 'research' | 'commit'
  path?: string
  sessionId?: string
  sha?: string
}

interface KryomMemorySource {
  kind: 'file' | 'chat' | 'research' | 'commit'
  path?: string
  digest?: string
  sessionId?: string
  briefVersion?: number
  sha?: string
  status: 'current' | 'stale' | 'unverified'
  reason: string
}

interface KryomMemoryRecord {
  id: string
  type: KryomMemoryType
  title: string | null
  content: string
  createdAt: string
  updatedAt: string
  sources: KryomMemorySource[]
  stale: boolean
  staleReasons: string[]
}

interface KryomMemoryList {
  records: KryomMemoryRecord[]
  corrupt: string[]
}

interface KryomOpenFileResult {
  root: string
  tree: KryomNode[]
  filePath: string
}

interface KryomSaveAsResult {
  path: string
  content: string
  mtimeMs: number
}

interface KryomAppVersion {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
}

type KryomSecretSource = 'environment' | 'vault' | 'missing' | 'none'

interface KryomAIStatus {
  modelKeyConfigured: boolean
  researchKeyConfigured: boolean
  modelKeySource: KryomSecretSource
  researchKeySource: KryomSecretSource
  vaultAvailable: boolean
}

interface KryomProviderKeyStatus {
  providerId: string
  available: boolean
  configured: boolean
  source: KryomSecretSource
}

interface KryomProviderKeyResult {
  saved?: boolean
  removed?: boolean
  name?: string
  configured?: boolean
  source: KryomSecretSource
}

interface KryomUIState {
  autoSave: boolean
  recent: string[]
}

interface KryomCommand {
  id: string
  payload?: { path?: string; nonce?: number }
}

interface KryomGitRemote {
  name: string
  fetchUrl: string | null
  pushUrl: string | null
}

interface KryomVerifyResult {
  ok: boolean
  kind: 'github' | 'local'
  url: string
  refs: string[]
}

interface KryomCloneResult {
  root: string
  tree: KryomNode[]
  path: string
}

interface KryomPullResult {
  success: boolean
  remote: string
  branch: string
  summary: string
}

interface KryomDocxExport {
  path: string
  bytes: number
}

interface KryomDocxImport {
  text: string
  truncated: boolean
  fileName: string
}

interface KryomIndexStatus {
  indexed: boolean
  root: string
  refreshedAt?: string
  total: number
  truncated?: boolean
  counts?: { files: number; directories: number; skipped: number; truncated: boolean }
}

interface KryomIndexReport {
  refreshedAt: string
  counts: { files: number; directories: number; skipped: number; truncated: boolean }
  added: string[]
  changed: string[]
  removed: string[]
  unchanged: number
  total: number
  truncated: boolean
}

interface KryomIndexFreshnessEntry {
  path: string
  status: 'current' | 'stale' | 'missing' | 'unindexed' | 'inaccessible' | 'unverified'
  reason: string
}

interface KryomSymbolEntry {
  name: string
  kind: string
  file: string
  line: number
  exported: boolean
}

interface KryomImportEntry {
  file: string
  line: number
  specifier: string
  names: string[]
}

interface KryomSymbolScan {
  scanned: string[]
  skipped: Array<{ path: string; reason: string }>
  stale: KryomIndexFreshnessEntry[]
  symbols: KryomSymbolEntry[]
  imports: KryomImportEntry[]
  approximate: boolean
  note: string
}

interface KryomSymbolHit {
  file: string
  line: number
}

interface KryomIntelSearchHit {
  file: string
  line: number
  kind: 'exact' | 'text' | 'symbol' | 'structural'
  score: number
  why: string
  excerpt: string
}

interface KryomIntelSearch {
  query: string
  interpretation: {
    tokens: string[]
    phrases: string[]
    symbolHints: string[]
    fileHints: string[]
  }
  results: KryomIntelSearchHit[]
  searchedFiles: number
  stale: KryomIndexFreshnessEntry[]
  indexTruncated: boolean
  method: string
}

interface KryomImpactReport {
  refreshedAt: string
  targets: string[]
  directDependents: Array<{ file: string; via: string; line: number }>
  indirectDependents: Array<{ file: string; via: string; line: number; depth: number }>
  affectedFiles: string[]
  relatedTests: string[]
  forwardDependencies: Array<{ file: string; imports: string[] }>
  evidence: Array<{ file: string; line: number; via: string; excerpt: string }>
  risks: Array<{ level: string; reason: string }>
  unresolvedImports: Array<{ file: string; line: number; specifier: string; reason: string }>
  stale: KryomIndexFreshnessEntry[]
  indexTruncated: boolean
}

interface KryomArchitecture {
  refreshedAt: string
  indexTruncated: boolean
  totalIndexed: number
  surveyed: number
  primaryLanguage: string
  languages: Record<string, number>
  frameworks: string[]
  package: {
    name: string | null
    version: string | null
    description: string | null
    scripts: Record<string, string>
  }
  entryPoints: Array<{ path: string; evidence: string; exists: boolean }>
  configs: string[]
  modules: Array<{ name: string; files: number; sample: string[] }>
  services: string[]
  boundaries: Array<{ name: string; evidence: string; detail: string }>
  conventions: Array<{ name: string; evidence: string }>
}

interface KryomImplSubtask {
  index: number
  title: string
  description: string
  files: Array<{ path: string; exists: boolean }>
  dependsOn: number[]
  verification: string
  completion: string
}

interface KryomImplPlan {
  plan: KryomTrackedPlan
  indexRefreshed: boolean
  decomposition: {
    objective: string
    expectedOutcome: string
    subtasks: KryomImplSubtask[]
    risks: KryomPlanRisk[]
    assumptions: string[]
    droppedEdges: Array<{ from: number; to: number; reason: string }>
  }
  executionOrder: number[]
  parallelGroups: Array<{ wave: number; subtasks: number[]; parallel: boolean }>
  sharedFileConflicts: Array<{ file: string; subtasks: number[]; resolution: string }>
  evidence: {
    failures: string[]
    searchedFiles: number
    relevantFiles: KryomIntelSearchHit[]
    contextExcluded: KryomAgentContextExcluded[]
  }
}

interface KryomImplRevision extends KryomImplPlan {
  revises: string
  preservedCompleted: Array<{ id: string; label: string; state: string }>
  invalidatedAssumptions: Array<{ relativePath?: string; path?: string; status: string }>
}

type KryomSpecialistId =
  | 'research'
  | 'coding'
  | 'testing'
  | 'debugging'
  | 'security'
  | 'review'

type KryomSpecialistState = 'running' | 'succeeded' | 'failed' | 'timeout' | 'cancelled'

interface KryomSpecialistRun {
  version: number
  id: string
  specialist: KryomSpecialistId
  task: string
  model: string
  planId?: string
  startedAt: string
  finishedAt: string | null
  state: KryomSpecialistState
  result?: unknown
  error?: string
  contextFiles?: KryomAgentContextFile[]
  contextExcluded?: KryomAgentContextExcluded[]
  evidenceNotes?: string[]
}

type KryomOrchTaskState =
  | 'pending'
  | 'running'
  | 'proposed'
  | 'merging'
  | 'merged'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'rejected'
  | 'blocked'
  | 'stale'

interface KryomOrchTask {
  index: number
  id: string
  specialist: KryomSpecialistId
  title: string
  detail: string
  files: string[]
  dependsOn: number[]
  planStepId: string | null
  state: KryomOrchTaskState
  attempts: number
  specialistRunId: string | null
  proposal: { specialistRunId: string; result: unknown; finishedAt: string } | null
  merge: {
    edits?: number
    checkpoint?: string | null
    files?: string[]
    note?: string
    manifest?: { order: number[]; conflicts: unknown[]; cycles: unknown[]; blockers: unknown[] }
  } | null
  error: string | null
}

interface KryomOrchRun {
  version: number
  id: string
  planId: string
  planTitle: string
  state: 'active' | 'completed' | 'cancelled' | 'interrupted'
  interrupted?: boolean
  createdAt: string
  updatedAt: string
  tasks: KryomOrchTask[]
  ownership: Array<{ file: string; tasks: number[] }>
  outcome: {
    merged: number
    total: number
    partial: boolean
    byState?: Record<string, number>
    cancelledSpecialists?: number
  } | null
  history: Array<{ at: string; kind: string; task?: string; reason?: string }>
}

// Autonomous coding-agent runs (Milestone 3). The record is the
// single source of truth the Agent workspace renders: state,
// persisted events, approvals, subtasks, checks, and the final
// deterministic summary.
type KryomAgentRunState =
  | 'analyzing'
  | 'researching'
  | 'planning'
  | 'proposing'
  | 'waiting_for_approval'
  | 'executing'
  | 'verifying'
  | 'repairing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'

type KryomAgentRunSubtaskState =
  | 'pending'
  | 'ready'
  | 'applying'
  | 'applied'
  | 'check-pending'
  | 'check-running'
  | 'passed'
  | 'failed'
  | 'repairing'
  | 'repaired'
  | 'skipped'

type KryomAgentResearchMode = 'off' | 'auto' | 'required'

type KryomAgentApprovalKind = 'plan' | 'command' | 'repair'

interface KryomAgentRunEvent {
  seq: number
  at: string
  kind: string
  phase: string
  message: string
  data: unknown
}

interface KryomAgentRunSubtask {
  index: number
  title: string
  state: KryomAgentRunSubtaskState
  files: Array<{ path: string; exists: boolean }>
  verification: string
  verificationNote: string
  check: string | null
  conclusion: string | null
  runId: string | null
  checkpointId: string | null
  error: string
  attempts: number
}

interface KryomAgentRunProposalFile {
  path: string
  action: 'create' | 'modify' | 'delete'
  contentLength?: number
  preview?: string
  reason?: string
}

interface KryomAgentRunProposalMeta {
  subtask: number
  title: string
  editCount: number
  droppedOutOfScope: number
  files: KryomAgentRunProposalFile[]
  commands: string[]
  notes: string
  proposedAt: string
}

interface KryomAgentRunCheck {
  subtask: number | null
  check: string
  conclusion: string
  exitCode: number | null
  timedOut: boolean
  runId: string | null
  reason: string
  reportId: string | null
  output: string | null
  outputLimited: boolean
  problems: number
  problemsTruncated: boolean
  at: string
}

interface KryomAgentCommandReview {
  verdict: 'run' | 'approve' | 'deny'
  reason: string
  warnings: string[]
}

interface KryomAgentRunApproval {
  id: string
  kind: KryomAgentApprovalKind
  createdAt: string
  payload: {
    planId?: string
    objective?: string
    expectedOutcome?: string
    risks?: KryomPlanRisk[]
    subtasks?: Array<{
      index: number
      title: string
      files: Array<{ path: string; exists: boolean }>
      dependsOn: number[]
      verification: string
      completion: string
      editCount: number
    }>
    editCount?: number
    files?: Array<{ path: string; action: string }>
    verification?: Array<{
      subtask: number
      title: string
      stated: string
      command: string | null
      review: KryomAgentCommandReview | null
    }>
    changeSet?: {
      version: number
      order: number[]
      orderReason: string
      conflicts: Array<{ path: string; indexes: number[] }>
      cycles: string[][]
      validation: { ok: boolean; blockers: Array<{ kind: string; path: string | null; reason: string }>; warnings: Array<{ path: string | null; reason: string }> }
      reviewGroups: Array<{ indexes: number[]; files: string[] }>
      bounds: { targets: number; filesParsed: number; edges: number; depthReached: number; truncated: boolean }
    } | null
    subtask?: number | null
    title?: string
    check?: string
    command?: string
    purpose?: string
    review?: KryomAgentCommandReview
    cycleId?: string
    attemptId?: string
    attempt?: number
    edits?: KryomAgentRunProposalFile[]
    notes?: string
  }
}

interface KryomAgentRunSummary {
  version: number
  runId: string | null
  task: string
  state: string
  workComplete: boolean
  verification: 'verified' | 'partially-verified' | 'unverified'
  whatChanged: Array<{ path: string; action: string; label: string; subtask: number | null }>
  whyChanged: string
  filesAffected: number
  checks: {
    passed: KryomAgentRunCheck[]
    failed: KryomAgentRunCheck[]
    skipped: KryomAgentRunCheck[]
    notExecuted: KryomAgentRunCheck[]
    manualPending: KryomAgentRunCheck[]
  }
  checkCounts: { passed: number; failed: number; skipped: number; notExecuted: number; manualPending: number }
  remainingIssues: string[]
  suggestedNext: string
  repairs: number
  approvals: number
  startedAt: string | null
  finishedAt: string | null
}

interface KryomAgentRun {
  version: number
  id: string
  task: string
  model: string
  researchMode: KryomAgentResearchMode
  includeChat: boolean
  contextPaths: string[]
  state: KryomAgentRunState
  prevState: KryomAgentRunState | null
  createdAt: string
  updatedAt: string
  startedAt: string
  finishedAt: string | null
  deadline: number
  cancelRequested: boolean
  pauseRequested: boolean
  understanding: {
    at: string
    projectName: string
    projectType: string
    inspected: Array<{ relativePath: string; digest: string; bytes: number }>
    excluded: Array<{ path: string; reason: string }>
    relevantFiles: Array<{ path: string; score: number | null; reason: string }>
    git: { available: boolean; branch?: string | null; clean?: boolean; unstagedTotal?: number; stagedTotal?: number; untrackedTotal?: number; reason?: string }
    failures: string[]
    brief: string
  } | null
  analysis: {
    outcome: string
    affectedFiles: string[]
    hintsDropped: number
    risks: KryomPlanRisk[]
    needsResearch: boolean
    researchQuestions: string[]
    validationCriteria: string[]
  } | null
  researchSessionId: string | null
  research: { sessionId: string; status: string; sources: number; excerptChars: number } | null
  planId: string | null
  planIds: string[]
  revisions: number
  decomposition: {
    objective: string
    expectedOutcome: string
    risks: KryomPlanRisk[]
    assumptions: string[]
    subtasks: Array<{
      index: number
      title: string
      description: string
      files: Array<{ path: string; exists: boolean }>
      dependsOn: number[]
      verification: string
      completion: string
    }>
  } | null
  executionOrder: number[]
  proposals: Record<string, KryomAgentRunProposalMeta>
  proposalFiles: string[]
  changeSet: KryomAgentRunApproval['payload']['changeSet']
  pendingApproval: KryomAgentRunApproval | null
  approvedCommands: string[]
  repair: { subtask: number; check: string; command: string; cycleId: string | null } | null
  subtasks: KryomAgentRunSubtask[]
  appliedFiles: Array<{ path: string; action: string; subtask: number }>
  checks: KryomAgentRunCheck[]
  events: KryomAgentRunEvent[]
  summary: KryomAgentRunSummary | null
  memoryId: string | null
  error: { phase: string; message: string; at: string } | null
  live: boolean
  interrupted: boolean
}

interface KryomAgentRunListItem {
  id: string
  task: string
  state: KryomAgentRunState
  live: boolean
  interrupted: boolean
  createdAt: string
  updatedAt: string
  finishedAt: string | null
  subtasks: Array<{ index: number; title: string; state: KryomAgentRunSubtaskState }>
  checkCounts: { passed: number; failed: number; skipped: number; notExecuted: number }
  eventCount: number
  error: { phase: string; message: string; at: string } | null
}

interface KryomAgentRunProposal {
  subtask: number
  title: string
  edits: KryomAgentEdit[]
  droppedOutOfScope: string[]
  commands: string[]
  notes: string
  expectedOutcome: string
  risks: KryomPlanRisk[]
  model: string
  proposedAt: string
}

interface KryomQualityReport {
  version: number
  id: string
  createdAt: string
  scope: {
    planId: string | null
    files: KryomIndexFreshnessEntry[]
    git: { available: boolean; truncated: boolean }
  }
  regression: {
    changedFiles: KryomIndexFreshnessEntry[]
    affectedFiles: string[]
    relatedTests: string[]
    impacts: Array<{ file: string; via: string; line: number }>
    failures: Array<{ check: string; status: string; history: number; latestReportId: string | null }>
    notes: string[]
  }
  testSuggestions: Array<{
    symbol: string
    kind: string
    file: string
    line: number
    rationale: string
    coveredBy: string[]
  }>
  testNotes: string[]
  security: {
    findings: Array<{
      pattern: string
      severity: string
      confidence: string
      title: string
      file: string
      line: number
      excerpt: string
      recommendation: string
    }>
    scannedFiles: number
    truncated: boolean
    method: string
  }
  performance: {
    indexed: boolean
    refreshedAt?: string
    totalFiles?: number
    truncated?: boolean
    largestFiles?: Array<{ file: string; size: number }>
    notes: string[]
  }
  verdict: { verdict: 'clean' | 'review' | 'attention'; reasons: string[] }
  remainingRisks: string[]
}

// Level 4B support bundle. Non-secret facts only; the home
// directory arrives redacted as ~.
interface KryomSupportBundle {
  kind: 'kryom-support-bundle'
  bundleVersion: number
  collectedAt: string
  app: {
    version: string
    channel: 'stable' | 'preview'
    environment: string
    packaged: boolean
  }
  runtime: {
    electron: string
    chrome: string
    node: string
    platform: string
    arch: string
  }
  providers: {
    selectedProvider: string
    selectedModel: string
    metaConfigured: boolean
    metaAvailable: boolean
  }
  features: {
    workspaceOpen: boolean
    workspaceRoot: string | null
    indexIndexed: boolean
    filesIndexed: number
    extensionsInstalled: number
    extensionsActive: number
    skillsTotal: number
    workflowsTotal: number
  }
  recentErrors: Array<{ at: string; summary: string }>
}

// Level 4B update status. The feed URL is never exposed: the
// renderer only learns whether one is configured.
interface KryomUpdateStatus {
  version: string
  channel: 'stable' | 'preview'
  environment: string
  feedConfigured: boolean
  staged: { path: string; bytes: number } | null
}

interface KryomUpdateCheck {
  available: boolean
  manifest: {
    version: string
    channel: string
    publishedAt: string | null
    releaseNotes: string
    artifacts: Array<{ platform: string; url: string; sha512: string; size: number }>
  } | null
  reason: string
}

// Level 4A platform contracts. These mirror the main-process
// services; secrets never cross this boundary.
interface KryomModelCapabilities {
  text: boolean
  streaming: boolean
  vision: boolean
  tools: boolean
}

interface KryomProviderModelSummary {
  providerId: string
  providerName: string
  modelId: string
  displayName: string
  capabilities: KryomModelCapabilities
  contextWindow: number | null
  tokenUsage: boolean
  isDefault?: boolean
}

interface KryomProviderSummary {
  id: string
  displayName: string
  description: string
  version: string
  models: Array<{
    id: string
    displayName: string
    capabilities: KryomModelCapabilities
    contextWindow: number | null
    tokenUsage: boolean
    isDefault?: boolean
  }>
  auth: { kind: string; configured: boolean }
  available: boolean
}

interface KryomProviderConfig {
  version: number
  selectedProvider: string
  selectedModel: string
  enabled: Record<string, boolean>
  fallback: { provider: string; model: string } | null
  features: Record<string, { provider: string; model: string }>
}

interface KryomProviderRoute {
  providerId: string
  providerName: string
  modelId: string
  displayName: string
}

interface KryomConnectionTest {
  ok: boolean
  checks: Array<{ name: string; ok: boolean; detail: string }>
}

interface KryomPermissionInfo {
  id: string
  label: string
  description: string
  risk: 'low' | 'medium' | 'high'
}

interface KryomPermissionCheck {
  subject: string
  permission: string
  granted: boolean
  grantedAt: string | null
  trust: string
}

interface KryomGrantEntry {
  subject: string
  trust: string
  permissions: Array<{
    permission: string
    label: string
    risk: string
    grantedAt: string
  }>
}

interface KryomAuditEvent {
  at: string
  type: string
  subject: string | null
  detail: string
  outcome: string | null
}

interface KryomExtensionManifest {
  manifestVersion: 1
  id: string
  name: string
  description: string
  version: string
  publisher: string
  main: string
  apiVersion: number
  engines: { kryomcode: string } | null
  permissions: string[]
  optionalPermissions: string[]
  contributes: { commands: Array<{ id: string; title: string }> }
  dependencies: Record<string, string>
}

interface KryomExtensionEntry {
  id: string
  version: string
  source: 'dev' | 'local'
  path: string
  enabled: boolean
  installedAt: string
  manifest: KryomExtensionManifest
  lastError: string | null
  active: boolean
}

interface KryomExtensionStatus extends KryomExtensionEntry {
  commands: Array<{ extensionId: string; id: string; title: string }>
}

interface KryomSkillSummary {
  skillVersion: 1
  id: string
  name: string
  description: string
  version: string
  instructions: string
  tasks: string[]
  inputSchema: unknown
  outputSchema: unknown
  tools: string[]
  entryTool: string
  permissions: string[]
  models: unknown
  dependencies: string[]
  scope: 'builtin' | 'user' | 'project' | 'extension'
  enabled: boolean
}

interface KryomWorkflowStep {
  id: string
  kind: string
  title: string
  uses: string | null
  specialist: string | null
  task: string | null
  message: string | null
  params: Record<string, unknown>
  retries: number
  timeoutMs: number
  onFailure: 'stop' | 'continue'
  if: unknown
}

interface KryomWorkflowSummary {
  workflowVersion: 1
  id: string
  name: string
  description: string
  version: string
  inputs: Array<{ name: string; description: string; default: string }>
  steps: KryomWorkflowStep[]
  owner: string
  scope: 'builtin' | 'user' | 'project'
}

interface KryomWorkflowRun {
  version: number
  id: string
  workflowId: string
  workflowName: string
  workflowVersion: string
  state: string
  inputs: Record<string, string>
  task: string
  steps: Array<{
    id: string
    kind: string
    title: string
    state: string
    attempts: number
    output: unknown
    error: string | null
  }>
  approvals: Array<{ stepId: string; decision: string; at: string; note: string }>
  pendingStep: string | null
  outcome: { completed: boolean; reason: string } | null
  createdAt: string
  updatedAt: string
  history: Array<Record<string, unknown>>
}

interface KryomIntegrationSummary {
  id: string
  displayName: string
  description: string
  auth: { kind: string }
  capabilities: string[]
  methods: string[]
}

interface KryomIntegrationStatus {
  connected: boolean
  state: string
  repository: unknown
  detail: string
  updatedAt?: string | null
  account?: string | null
}

interface KryomTemplateSummary {
  templateVersion: number
  id: string
  name: string
  description: string
  version: string
  category: string
  language: string
  framework: string
  runtime: string
  variables: Array<{
    name: string
    description: string
    default: string
    required: boolean
    pattern?: string
  }>
  setup: { instructions: string; commands: string[] }
  scope: 'builtin' | 'user'
  fileCount: number
}

interface KryomTemplateFile {
  path: string
  bytes: number
}

interface KryomTemplatePreview {
  templateId: string
  destination: string
  files: KryomTemplateFile[]
  collisions: string[]
  empty: boolean
  setup: { instructions: string; commands: string[] }
}

interface KryomTemplateResult {
  destination: string
  files: KryomTemplateFile[]
  overwritten: string[]
  setup: { instructions: string; commands: string[] }
}

interface KryomAPI {
  platform: string

  versions: {
    electron: string
    chrome: string
    node: string
  }

  openWorkspace: () => Promise<KryomWorkspace | null>

  openFile: () => Promise<KryomOpenFileResult | null>

  openPath: (dirPath: string) => Promise<KryomWorkspace>

  readFile: (filePath: string) => Promise<string>

  readContextFile: (payload: {
    path: string
  }) => Promise<KryomContextFile>

  saveFile: (
    filePath: string,
    content: string,
  ) => Promise<{ success: boolean }>

  runCommand: (command: string) => Promise<KryomTerminalResult>

  askAI: (payload: {
    prompt: string
    context?: string
    history?: KryomAIMessage[]
    model?: string
    researchSessionId?: string
  }) => Promise<KryomAIResponse>

  cancelAI: () => Promise<{ cancelled: boolean }>

  saveChat: (
    messages: KryomAIMessage[],
    root?: string | null
  ) => Promise<{ saved: boolean; reason?: string; messages?: number }>

  restoreChat: () => Promise<{ messages: KryomAIMessage[]; restored: boolean }>

  listChatSessions: () => Promise<{ sessions: KryomChatSession[]; activeId: string }>

  createChatSession: (payload?: {
    title?: string
  }) => Promise<KryomChatSession>

  switchChatSession: (payload: {
    id: string
  }) => Promise<{ id: string; title: string; messages: KryomAIMessage[] }>

  renameChatSession: (payload: {
    id: string
    title?: string
  }) => Promise<KryomChatSession>

  deleteChatSession: (payload: {
    id: string
  }) => Promise<{ id: string; deleted: boolean }>

  searchChatSessions: (payload: {
    query: string
  }) => Promise<{ query: string; matches: KryomChatSearchMatch[] }>

  closeWorkspace: () => Promise<{ success: boolean }>

  refreshWorkspace: () => Promise<KryomWorkspace>

  readFileMeta: (filePath: string) => Promise<KryomFileMeta>

  saveFileConditional: (
    filePath: string,
    content: string,
    expectedMtimeMs?: number | null,
  ) => Promise<{ success: boolean; mtimeMs: number }>

  saveAs: (
    content: string,
    suggestedName?: string,
  ) => Promise<KryomSaveAsResult | null>

  createPath: (payload: {
    path: string
    type: 'file' | 'directory'
    content?: string
  }) => Promise<{ success: boolean; path: string }>

  renamePath: (payload: {
    oldPath: string
    newPath: string
  }) => Promise<{ success: boolean; path: string }>

  deletePath: (targetPath: string) => Promise<{ success: boolean }>

  searchFiles: (payload: {
    query: string
    mode?: 'name' | 'content'
  }) => Promise<KryomSearchResult>

  cancelCommand: () => Promise<{ killed: number }>

  classifyCommand: (command: string) => Promise<{ warnings: string[] }>

  getTerminalStatus: () => Promise<{ running: KryomRunningProcess[] }>

  planAgentTask: (payload: {
    task: string
    model?: string
    contextPaths?: string[]
    researchSessionId?: string
    includeChat?: boolean
  }) => Promise<KryomAgentPlan>

  cancelAgentPlan: () => Promise<{ cancelled: boolean }>

  applyAgentEdits: (payload: {
    edits: KryomAgentEdit[]
    task?: string
  }) => Promise<KryomAgentApplyResult>

  buildAgentChangeSet: (payload: {
    edits: KryomAgentEdit[]
    baseline?: KryomChangeSetManifest | null
  }) => Promise<KryomChangeSetManifest>

  listCheckpoints: () => Promise<{ checkpoints: KryomCheckpoint[] }>

  undoCheckpoint: (
    checkpointId?: string | null
  ) => Promise<KryomUndoResult>

  trackAgentPlan: (payload: {
    proposal: KryomAgentPlan
    title?: string
  }) => Promise<KryomTrackedPlan>

  listAgentPlans: () => Promise<{ plans: KryomTrackedPlan[]; corrupt: string[] }>

  getAgentPlan: (payload: {
    id: string
  }) => Promise<KryomTrackedPlan>

  setAgentPlanStep: (payload: {
    id: string
    stepId: string
    state: KryomPlanStepState
    detail?: string
  }) => Promise<KryomTrackedPlan>

  attachAgentPlanEvidence: (payload: {
    id: string
    stepId: string
    evidence: { kind: KryomPlanEvidence['kind']; ref: string; summary?: string }
  }) => Promise<KryomTrackedPlan>

  recordAgentVerification: (payload: {
    planId: string
    stepId: string
    check: string
    result: 'pass' | 'fail' | 'error' | 'skip' | 'not_executed'
    exitCode?: number | null
    timedOut?: boolean
    output?: string
    executionRunId?: string
    diagnosis?: KryomDiagnosis
    modelExplanation?: KryomModelExplanation
    markStep?: 'verified' | 'failed' | 'blocked' | null
  }) => Promise<{ report: KryomVerificationReport; plan: KryomTrackedPlan }>

  cancelAgentPlanRecord: (payload: {
    id: string
    reason?: string
  }) => Promise<KryomTrackedPlan>

  resumeAgentPlan: (payload: {
    id: string
  }) => Promise<KryomTrackedPlan>

  completeAgentPlan: (payload: {
    id: string
  }) => Promise<KryomTrackedPlan>

  startRepairCycle: (payload: {
    planId: string
    stepId?: string
    check: string
    diagnosis?: KryomDiagnosis
  }) => Promise<{ cycle: KryomRepairCycle }>

  proposeRepairCycle: (payload: {
    cycleId: string
  }) => Promise<{ cycle: KryomRepairCycle; proposal: KryomAgentPlan }>

  applyRepairCycle: (payload: {
    cycleId: string
    attemptId: string
    edits: KryomAgentEdit[]
    task?: string
  }) => Promise<{ cycle: KryomRepairCycle; apply: KryomAgentApplyResult }>

  recordRepairCycle: (payload: {
    cycleId: string
    attemptId: string
    executionRunId: string
  }) => Promise<{
    cycle: KryomRepairCycle
    report: KryomVerificationReport
    plan: KryomTrackedPlan
  }>

  cancelRepairCycle: (payload: {
    cycleId: string
    reason?: 'cancelled' | 'approval-denied'
  }) => Promise<{ cycle: KryomRepairCycle }>

  getRepairCycle: (payload: {
    cycleId: string
  }) => Promise<{ cycle: KryomRepairCycle }>

  buildImplPlan: (payload: {
    requirement: string
    model?: string
    contextPaths?: string[]
    researchSessionId?: string
    includeChat?: boolean
    title?: string
  }) => Promise<KryomImplPlan>

  reviseImplPlan: (payload: {
    planId: string
    change: string
    model?: string
  }) => Promise<KryomImplRevision>

  cancelImplPlan: () => Promise<{ cancelled: boolean }>

  runSpecialist: (payload: {
    specialist: KryomSpecialistId
    task: string
    model?: string
    contextPaths?: string[]
    researchSessionId?: string
    includeChat?: boolean
    context?: string
    planId?: string
  }) => Promise<KryomSpecialistRun>

  getSpecialistRun: (payload: {
    runId: string
  }) => Promise<KryomSpecialistRun>

  cancelSpecialistRun: (payload: {
    runId: string
  }) => Promise<{ cancelled: boolean }>

  listSpecialistRuns: () => Promise<{ runs: KryomSpecialistRun[]; total: number; corrupt: string[] }>

  startOrchRun: (payload: {
    planId: string
    tasks: Array<{
      specialist: KryomSpecialistId
      title: string
      detail?: string
      files?: string[]
      dependsOn?: number[]
      planStepId?: string
    }>
  }) => Promise<KryomOrchRun>

  advanceOrchRun: (payload: {
    runId: string
  }) => Promise<KryomOrchRun>

  approveOrchTask: (payload: {
    runId: string
    taskId: string
  }) => Promise<KryomOrchRun>

  retryOrchTask: (payload: {
    runId: string
    taskId: string
  }) => Promise<KryomOrchRun>

  cancelOrchRun: (payload: {
    runId: string
  }) => Promise<KryomOrchRun>

  getOrchRun: (payload: {
    runId: string
  }) => Promise<KryomOrchRun>

  listOrchRuns: () => Promise<{ runs: KryomOrchRun[]; corrupt: string[] }>

  startAgentRun: (payload: {
    task: string
    model?: string
    contextPaths?: string[]
    researchMode?: KryomAgentResearchMode
    includeChat?: boolean
  }) => Promise<KryomAgentRun>

  getAgentRun: (payload: { runId: string }) => Promise<KryomAgentRun>

  listAgentRuns: () => Promise<{ runs: KryomAgentRunListItem[]; corrupt: string[] }>

  getAgentRunProposal: (payload: {
    runId: string
    subtask: number
  }) => Promise<{ runId: string; subtask: number; proposal: KryomAgentRunProposal }>

  cancelAgentRun: (payload: { runId: string }) => Promise<KryomAgentRun>

  pauseAgentRun: (payload: { runId: string }) => Promise<KryomAgentRun>

  resumeAgentRun: (payload: { runId: string }) => Promise<KryomAgentRun>

  approveAgentRun: (payload: {
    runId: string
    approvalId: string
  }) => Promise<KryomAgentRun>

  rejectAgentRun: (payload: {
    runId: string
    approvalId: string
    reason?: string
    revise?: boolean
  }) => Promise<KryomAgentRun>

  getAgentContext: (payload: {
    paths: string[]
  }) => Promise<KryomAgentContextPreview>

  getAgentChatExcerpt: () => Promise<KryomChatExcerpt>

  gitStatus: () => Promise<KryomGitStatus>

  gitDiff: (payload?: {
    staged?: boolean
    path?: string
  }) => Promise<KryomGitDiff>

  gitChangedFiles: (payload?: {
    staged?: boolean
  }) => Promise<{ files: string[]; staged: boolean }>

  gitStage: (paths: string[]) => Promise<{ success: boolean; staged: number }>

  gitUnstage: (paths: string[]) => Promise<{ success: boolean; unstaged: number }>

  gitDiscard: (paths: string[]) => Promise<{ success: boolean; discarded: number }>

  gitCommit: (payload: {
    message: string
  }) => Promise<{ success: boolean }>

  gitPush: (payload?: {
    remote?: string
    branch?: string
  }) => Promise<{ success: boolean; remote: string; branch: string }>

  gitPull: (payload?: {
    remote?: string
    branch?: string
  }) => Promise<KryomPullResult>

  gitRemotes: () => Promise<{ remotes: KryomGitRemote[] }>

  gitVerify: (payload: {
    url: string
  }) => Promise<KryomVerifyResult>

  gitClone: (payload: {
    url: string
    name?: string
  }) => Promise<KryomCloneResult | null>

  cancelGit: () => Promise<{ killed: number }>

  exportBriefDocx: (payload: {
    sessionId: string
    template: string
  }) => Promise<KryomDocxExport | null>

  exportTextDocx: (payload: {
    title: string
    markdown: string
    template: string
  }) => Promise<KryomDocxExport | null>

  importDocx: () => Promise<KryomDocxImport | null>

  runDiagnostics: (payload: {
    command: string
  }) => Promise<KryomDiagnosticsResult>

  buildQualityReport: (payload?: {
    planId?: string
    paths?: string[]
  }) => Promise<KryomQualityReport>

  getQualityReport: (payload: {
    reportId: string
  }) => Promise<KryomQualityReport>

  listQualityReports: () => Promise<{ reports: Array<{ id: string; createdAt: string; verdict: KryomQualityReport['verdict']; scopeFiles: number }>; total: number }>

  previewSupportBundle: () => Promise<KryomSupportBundle>

  exportSupportBundle: () => Promise<{ cancelled: boolean; path?: string; bytes?: number }>

  getUpdateStatus: () => Promise<KryomUpdateStatus>

  checkForUpdates: () => Promise<KryomUpdateCheck>

  downloadUpdate: () => Promise<{ path: string; bytes: number; verified: boolean }>

  cancelUpdate: () => Promise<{ cancelled: boolean }>

  clearStagedUpdate: () => Promise<{ cleared: boolean }>

  getWorkspaceSummary: () => Promise<KryomWorkspaceSummary>

  getWorkspaceContext: (payload?: {
    maxChars?: number
  }) => Promise<KryomWorkspaceContext>

  getIndexStatus: () => Promise<KryomIndexStatus>

  refreshIndex: (payload?: {
    force?: boolean
  }) => Promise<KryomIndexReport>

  checkIndexFreshness: (payload: {
    paths: string[]
  }) => Promise<{ indexed: boolean; refreshedAt?: string; entries: KryomIndexFreshnessEntry[]; allCurrent?: boolean }>

  scanSymbols: (payload?: {
    paths?: string[]
  }) => Promise<KryomSymbolScan>

  findSymbol: (payload: {
    name: string
  }) => Promise<{ name: string; definitions: KryomSymbolEntry[]; stale: KryomIndexFreshnessEntry[]; skipped: Array<{ path: string; reason: string }>; approximate: boolean }>

  findReferences: (payload: {
    name: string
  }) => Promise<{ name: string; definitions: KryomSymbolEntry[]; references: KryomSymbolHit[]; truncated: boolean; stale: KryomIndexFreshnessEntry[]; skipped: Array<{ path: string; reason: string }>; approximate: boolean }>

  searchProject: (payload: {
    query: string
  }) => Promise<KryomIntelSearch>

  analyzeImpact: (payload: {
    paths: string[]
  }) => Promise<KryomImpactReport>

  analyzeArchitecture: () => Promise<KryomArchitecture>

  getSettings: () => Promise<KryomSettings>

  updateSettings: (patch: Partial<KryomSettings>) => Promise<KryomSettings>

  startResearch: (payload: {
    objective: string
    depth?: KryomResearchDepth
    model?: string
    name?: string
  }) => Promise<{ id: string; status: string }>

  getResearchStatus: (payload: {
    id: string
  }) => Promise<KryomResearchSession>

  getActiveResearch: () => Promise<KryomResearchSession | null>

  listResearch: () => Promise<KryomResearchSummary[]>

  getResearch: (payload: {
    id: string
  }) => Promise<KryomResearchSession>

  getResearchBrief: (payload: {
    id: string
  }) => Promise<{ id: string; markdown: string }>

  cancelResearch: (payload: {
    id: string
  }) => Promise<KryomResearchSession>

  resumeResearch: (payload: {
    id: string
  }) => Promise<{ id: string; status: string }>

  selectResearch: (payload: {
    id: string
  }) => Promise<{ id: string }>

  renameResearch: (payload: {
    id: string
    name: string
  }) => Promise<KryomResearchSession>

  deleteResearch: (payload: {
    id: string
  }) => Promise<{ id: string; deleted: boolean }>

  searchResearch: (payload: {
    query: string
  }) => Promise<KryomResearchSummary[]>

  exportResearch: (payload: {
    id: string
    format?: 'markdown' | 'html'
  }) => Promise<{ id: string; format: string; fileName: string; content: string }>

  handoffResearch: (payload: {
    id: string
    findingIndexes?: number[]
    target?: 'chat' | 'agent-brief'
  }) => Promise<{ id: string; target: string; text: string }>

  listMemories: () => Promise<KryomMemoryList>

  getMemory: (payload: {
    id: string
  }) => Promise<KryomMemoryRecord>

  createMemory: (payload: {
    type: KryomMemoryType
    title?: string
    content: string
    sources?: KryomMemorySourceSpec[]
  }) => Promise<KryomMemoryRecord>

  updateMemory: (payload: {
    id: string
    type?: KryomMemoryType
    title?: string | null
    content?: string
    sources?: KryomMemorySourceSpec[]
  }) => Promise<KryomMemoryRecord>

  deleteMemory: (payload: {
    id: string
  }) => Promise<{ deleted: boolean; id: string }>

  deleteAllMemories: () => Promise<{
    deleted: string[]
    failed: Array<{ id: string; reason: string }>
  }>

  exportMemories: () => Promise<{
    cancelled: boolean
    path?: string
    bytes?: number
    exported?: number
    skipped?: string[]
  }>

  listProviders: () => Promise<{ providers: KryomProviderSummary[] }>

  getProvider: (payload: {
    providerId: string
  }) => Promise<KryomProviderSummary>

  getProviderSelection: () => Promise<{
    config: KryomProviderConfig
    route: KryomProviderRoute
  }>

  configureProvider: (payload: {
    selectedProvider?: string
    selectedModel?: string
    enabled?: Record<string, boolean>
  }) => Promise<KryomProviderConfig>

  listProviderModels: (payload?: {
    providerId?: string
  }) => Promise<{ models: KryomProviderModelSummary[] }>

  getProviderModel: (payload: {
    providerId: string
    modelId: string
  }) => Promise<KryomProviderModelSummary>

  testProvider: (payload: {
    providerId: string
    live?: boolean
  }) => Promise<KryomConnectionTest>

  setProviderKey: (payload: {
    providerId: string
    apiKey: string
  }) => Promise<KryomProviderKeyResult>

  removeProviderKey: (payload: {
    providerId: string
  }) => Promise<KryomProviderKeyResult>

  getProviderKeyStatus: (payload: {
    providerId: string
  }) => Promise<KryomProviderKeyStatus>

  listPermissions: () => Promise<{ permissions: KryomPermissionInfo[] }>

  listPermissionGrants: (payload?: {
    subject?: string
  }) => Promise<{ grants: KryomGrantEntry[] }>

  checkPermission: (payload: {
    subject: string
    permission: string
  }) => Promise<KryomPermissionCheck>

  grantPermission: (payload: {
    subject: string
    permission: string
  }) => Promise<KryomPermissionCheck>

  revokePermission: (payload: {
    subject: string
    permission?: string
  }) => Promise<{ subject: string; revoked: string[] }>

  listAuditEvents: (payload?: {
    limit?: number
  }) => Promise<{ events: KryomAuditEvent[]; total: number }>

  listExtensions: () => Promise<{ extensions: KryomExtensionEntry[] }>

  getExtension: (payload: {
    id: string
  }) => Promise<KryomExtensionStatus>

  pickExtensionDirectory: () => Promise<{ path: string } | null>

  installExtension: (payload: {
    path: string
    dev?: boolean
  }) => Promise<KryomExtensionEntry>

  enableExtension: (payload: {
    id: string
  }) => Promise<KryomExtensionEntry>

  disableExtension: (payload: {
    id: string
  }) => Promise<KryomExtensionEntry>

  activateExtension: (payload: {
    id: string
  }) => Promise<{ id: string; active: boolean; commands: Array<{ id: string; title: string }> }>

  deactivateExtension: (payload: {
    id: string
  }) => Promise<{ id: string; deactivated: boolean }>

  uninstallExtension: (payload: {
    id: string
  }) => Promise<{ id: string; removed: boolean }>

  runExtensionCommand: (payload: {
    id: string
    commandId: string
    args?: Record<string, unknown>
  }) => Promise<unknown>

  listSkills: () => Promise<{
    skills: KryomSkillSummary[]
    disabled: string[]
    corrupt: string[]
  }>

  getSkill: (payload: {
    id: string
  }) => Promise<KryomSkillSummary>

  saveSkill: (payload: {
    skill: Record<string, unknown>
    scope?: 'user' | 'project'
  }) => Promise<KryomSkillSummary>

  deleteSkill: (payload: {
    id: string
    scope?: 'user' | 'project'
  }) => Promise<{ id: string; deleted: boolean }>

  setSkillEnabled: (payload: {
    id: string
    enabled: boolean
  }) => Promise<{ id: string; enabled: boolean }>

  runSkill: (payload: {
    skillId: string
    task: string
    contextPaths?: string[]
    planId?: string
    approved?: boolean
    params?: unknown
  }) => Promise<{ kind: string; skill: string; tool: string; result: unknown }>

  listWorkflows: () => Promise<{
    workflows: KryomWorkflowSummary[]
    corrupt: string[]
  }>

  getWorkflow: (payload: {
    id: string
  }) => Promise<KryomWorkflowSummary>

  saveWorkflow: (payload: {
    workflow: Record<string, unknown>
    scope?: 'user' | 'project'
  }) => Promise<KryomWorkflowSummary>

  deleteWorkflow: (payload: {
    id: string
    scope?: 'user' | 'project'
  }) => Promise<{ id: string; deleted: boolean }>

  startWorkflow: (payload: {
    workflowId: string
    task?: string
    inputs?: Record<string, string>
  }) => Promise<KryomWorkflowRun>

  advanceWorkflow: (payload: {
    runId: string
  }) => Promise<KryomWorkflowRun>

  approveWorkflow: (payload: {
    runId: string
    decision: 'approve' | 'deny'
    note?: string
  }) => Promise<KryomWorkflowRun>

  resumeWorkflow: (payload: {
    runId: string
  }) => Promise<KryomWorkflowRun>

  cancelWorkflow: (payload: {
    runId: string
  }) => Promise<KryomWorkflowRun>

  getWorkflowRun: (payload: {
    runId: string
  }) => Promise<KryomWorkflowRun>

  listWorkflowRuns: () => Promise<{
    runs: Array<{
      id: string
      workflowId: string
      workflowName: string
      state: string
      createdAt: string
    }>
    total: number
    corrupt: string[]
  }>

  listIntegrations: () => Promise<{ integrations: KryomIntegrationSummary[] }>

  getIntegrationStatus: (payload: {
    id: string
  }) => Promise<KryomIntegrationStatus>

  connectIntegration: (payload: {
    id: string
  }) => Promise<unknown>

  disconnectIntegration: (payload: {
    id: string
  }) => Promise<{ id: string; cleared: boolean }>

  listIntegrationRepositories: (payload: {
    id: string
  }) => Promise<{ repositories: unknown[]; source: string }>

  getIntegrationHistory: (payload: {
    id: string
    limit?: number
  }) => Promise<unknown>

  listTemplates: () => Promise<{
    templates: KryomTemplateSummary[]
    corrupt: string[]
  }>

  getTemplate: (payload: {
    id: string
  }) => Promise<KryomTemplateSummary>

  pickTemplateDestination: () => Promise<{ path: string } | null>

  previewTemplate: (payload: {
    templateId: string
    destination: string
    variables?: Record<string, string>
  }) => Promise<KryomTemplatePreview>

  generateTemplate: (payload: {
    templateId: string
    destination: string
    variables?: Record<string, string>
    confirmed?: boolean
  }) => Promise<KryomTemplateResult>

  getAppVersion: () => Promise<KryomAppVersion>

  pickContextFiles: () => Promise<{ canceled: boolean; paths: string[] }>

  openExternal: (url: string) => Promise<{ success: boolean }>

  getAIStatus: () => Promise<KryomAIStatus>

  getUIState: () => Promise<KryomUIState>

  setUIState: (patch: {
    autoSave?: boolean
    clearRecent?: boolean
  }) => Promise<KryomUIState>

  pushUIContext: (ctx: {
    hasWorkspace: boolean
    hasEditor: boolean
    terminalRunning?: boolean
    dirtyCount?: number
    title?: string
    saveAllNonce?: number
  }) => Promise<{ success: boolean }>

  onCommand: (handler: (command: KryomCommand) => void) => () => void

  onUIState: (handler: (state: KryomUIState) => void) => () => void
}

interface Window {
  kryom: KryomAPI
}
