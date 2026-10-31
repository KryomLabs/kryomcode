// Session snapshots for crash/restart recovery (Level 2B.2). The
// renderer persists open tabs (with bounded dirty contents) and the
// agent draft per workspace root in localStorage; disk-backed state
// (chat, research, settings) already survives on its own. Everything
// here is best-effort: quota errors and corrupt entries are dropped,
// never thrown.
//
// Level 3C (v2): the unified tab model persists code tabs plus the
// open Meta AI tab ids (sessions themselves live in the session
// store); v1 snapshots still load with their active path mapped to a
// code tab id.
import type { CodeTab } from '../state/workbench-tabs'
import { codeTabId } from '../state/workbench-tabs'

export interface TabSnapshotEntry {
  path: string
  dirtyContent: string | null
  savedContent: string
}

export interface TabSnapshot {
  version: 2
  savedAt: string
  tabs: TabSnapshotEntry[]
  activeId: string | null
  metaTabIds: string[]
}

export interface AgentDraft {
  version: 1
  savedAt: string
  task: string
  selectedFiles: string[]
  includeActive: boolean
  includeChat: boolean
  researchSessionId: string | null
  plan: KryomAgentPlan | null
  planId: string | null
  repairCycleId: string | null
}

const TABS_KEY = 'kryom.session.tabs.v1'
const AGENT_KEY = 'kryom.session.agent.v1'
const MAX_ROOTS = 8
const MAX_DIRTY_CHARS = 512 * 1024
const MAX_PLAN_CHARS = 256 * 1024

function readMap(key: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(key)

    if (!raw) {
      return {}
    }

    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeMap(key: string, map: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(map))
  } catch {
    // Quota or access errors drop the snapshot; the app keeps running.
  }
}

function trimRoots<T extends { savedAt: string }>(
  map: Record<string, T>
): Record<string, T> {
  const entries = Object.entries(map)

  if (entries.length <= MAX_ROOTS) {
    return map
  }

  entries.sort(([, a], [, b]) => (a.savedAt < b.savedAt ? -1 : 1))

  return Object.fromEntries(entries.slice(entries.length - MAX_ROOTS))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  const out: string[] = []

  for (const entry of value) {
    if (typeof entry !== 'string') {
      return null
    }

    out.push(entry)
  }

  return out
}

export function saveTabSnapshot(
  root: string,
  tabs: CodeTab[],
  activeId: string | null,
  metaTabIds: string[] = []
): void {
  let dirtyBudget = MAX_DIRTY_CHARS
  const entries: TabSnapshotEntry[] = []

  for (const tab of tabs) {
    let dirtyContent: string | null = null

    if (tab.content !== tab.savedContent) {
      if (tab.content.length <= dirtyBudget) {
        dirtyContent = tab.content
        dirtyBudget -= tab.content.length
      }
      // Over-budget dirty buffers keep their path only: the tab
      // reopens from disk clean. Documented, extremely rare.
    }

    entries.push({
      path: tab.path,
      dirtyContent,
      savedContent: tab.savedContent,
    })
  }

  const map = readMap(TABS_KEY) as Record<string, TabSnapshot>
  map[root] = {
    version: 2,
    savedAt: new Date().toISOString(),
    tabs: entries,
    activeId,
    metaTabIds: [...new Set(metaTabIds)].filter(
      (id) => typeof id === 'string'
    ).slice(0, 20),
  }

  writeMap(TABS_KEY, trimRoots(map))
}

export function loadTabSnapshot(root: string): TabSnapshot | null {
  const entry = readMap(TABS_KEY)[root]

  if (!isRecord(entry)) {
    return null
  }

  // v1 snapshots (pre-3C): code tabs plus an active path.
  if (entry.version === 1) {
    if (
      typeof entry.savedAt !== 'string' ||
      !Array.isArray(entry.tabs) ||
      !(typeof entry.activePath === 'string' || entry.activePath === null)
    ) {
      return null
    }

    const tabs = readSnapshotTabs(entry.tabs)

    if (!tabs) {
      return null
    }

    return {
      version: 2,
      savedAt: entry.savedAt,
      tabs,
      activeId:
        typeof entry.activePath === 'string'
          ? codeTabId(entry.activePath)
          : null,
      metaTabIds: [],
    }
  }

  if (entry.version !== 2) {
    return null
  }

  if (
    typeof entry.savedAt !== 'string' ||
    !Array.isArray(entry.tabs) ||
    !(typeof entry.activeId === 'string' || entry.activeId === null)
  ) {
    return null
  }

  const tabs = readSnapshotTabs(entry.tabs)

  if (!tabs) {
    return null
  }

  const metaTabIds = Array.isArray(entry.metaTabIds)
    ? entry.metaTabIds.filter(
        (id): id is string =>
          typeof id === 'string' && id.startsWith('meta-ai:')
      ).slice(0, 20)
    : []

  return {
    version: 2,
    savedAt: entry.savedAt,
    tabs,
    activeId: entry.activeId,
    metaTabIds,
  }
}

function readSnapshotTabs(value: unknown[]): TabSnapshotEntry[] | null {
  const tabs: TabSnapshotEntry[] = []

  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.path !== 'string' ||
      !(typeof item.dirtyContent === 'string' || item.dirtyContent === null) ||
      typeof item.savedContent !== 'string'
    ) {
      return null
    }

    tabs.push({
      path: item.path,
      dirtyContent: item.dirtyContent,
      savedContent: item.savedContent,
    })
  }

  return tabs
}

export function clearTabSnapshot(root: string): void {
  const map = readMap(TABS_KEY)

  if (root in map) {
    delete map[root]
    writeMap(TABS_KEY, map)
  }
}

export function saveAgentDraft(
  root: string,
  draft: Omit<AgentDraft, 'version' | 'savedAt'>
): void {
  let plan: KryomAgentPlan | null = null

  if (draft.plan) {
    try {
      const serialized = JSON.stringify(draft.plan)

      if (serialized.length <= MAX_PLAN_CHARS) {
        plan = draft.plan
      }
      // Oversized plans are dropped; the draft inputs are still kept.
    } catch {
      plan = null
    }
  }

  const map = readMap(AGENT_KEY) as Record<string, AgentDraft>
  map[root] = {
    version: 1,
    savedAt: new Date().toISOString(),
    task: draft.task,
    selectedFiles: draft.selectedFiles,
    includeActive: draft.includeActive,
    includeChat: draft.includeChat === true,
    researchSessionId: draft.researchSessionId,
    plan,
    planId: typeof draft.planId === 'string' ? draft.planId : null,
    repairCycleId:
      typeof draft.repairCycleId === 'string' ? draft.repairCycleId : null,
  }

  writeMap(AGENT_KEY, trimRoots(map))
}

export function loadAgentDraft(root: string): AgentDraft | null {
  const entry = readMap(AGENT_KEY)[root]

  if (!isRecord(entry) || entry.version !== 1) {
    return null
  }

  const selectedFiles = asStringArray(entry.selectedFiles)

  if (
    typeof entry.savedAt !== 'string' ||
    typeof entry.task !== 'string' ||
    selectedFiles === null ||
    typeof entry.includeActive !== 'boolean' ||
    !(
      typeof entry.researchSessionId === 'string' ||
      entry.researchSessionId === null
    ) ||
    !(entry.plan === null || isRecord(entry.plan))
  ) {
    return null
  }

  return {
    version: 1,
    savedAt: entry.savedAt,
    task: entry.task,
    selectedFiles,
    includeActive: entry.includeActive,
    includeChat: entry.includeChat === true,
    researchSessionId: entry.researchSessionId,
    plan: entry.plan as KryomAgentPlan | null,
    planId: typeof entry.planId === 'string' ? entry.planId : null,
    repairCycleId:
      typeof entry.repairCycleId === 'string' ? entry.repairCycleId : null,
  }
}

export function clearAgentDraft(root: string): void {
  const map = readMap(AGENT_KEY)

  if (root in map) {
    delete map[root]
    writeMap(AGENT_KEY, map)
  }
}

// Autonomous-run workspace UI state (Milestone 3): the composer
// draft plus the selected run id per workspace root. The run itself
// is disk-backed; this only restores the view.
export interface AgentRunUI {
  version: 1
  savedAt: string
  selectedRunId: string | null
  task: string
  selectedFiles: string[]
  includeActive: boolean
  includeChat: boolean
  researchMode: string
  model: string
}

const AGENT_RUN_UI_KEY = 'kryom.session.agent-run-ui.v1'
const MAX_TASK_CHARS = 16 * 1024

export function saveAgentRunUI(
  root: string,
  ui: Omit<AgentRunUI, 'version' | 'savedAt'>
): void {
  const map = readMap(AGENT_RUN_UI_KEY) as Record<string, AgentRunUI>

  map[root] = {
    version: 1,
    savedAt: new Date().toISOString(),
    selectedRunId:
      typeof ui.selectedRunId === 'string' ? ui.selectedRunId : null,
    task: ui.task.slice(0, MAX_TASK_CHARS),
    selectedFiles: ui.selectedFiles.filter(
      (entry) => typeof entry === 'string'
    ).slice(0, 32),
    includeActive: ui.includeActive === true,
    includeChat: ui.includeChat === true,
    researchMode: ui.researchMode,
    model: ui.model,
  }

  writeMap(AGENT_RUN_UI_KEY, trimRoots(map))
}

export function loadAgentRunUI(root: string): AgentRunUI | null {
  const entry = readMap(AGENT_RUN_UI_KEY)[root]

  if (!isRecord(entry) || entry.version !== 1) {
    return null
  }

  const selectedFiles = asStringArray(entry.selectedFiles)

  if (
    typeof entry.savedAt !== 'string' ||
    typeof entry.task !== 'string' ||
    selectedFiles === null ||
    typeof entry.includeActive !== 'boolean' ||
    typeof entry.researchMode !== 'string' ||
    typeof entry.model !== 'string' ||
    !(typeof entry.selectedRunId === 'string' || entry.selectedRunId === null)
  ) {
    return null
  }

  return {
    version: 1,
    savedAt: entry.savedAt,
    selectedRunId: entry.selectedRunId,
    task: entry.task,
    selectedFiles,
    includeActive: entry.includeActive,
    includeChat: entry.includeChat === true,
    researchMode: entry.researchMode,
    model: entry.model,
  }
}
