// Extensible activity-bar navigation (Level 3C, Phase A). Builtin
// destinations register here at startup, and future modules
// (extensions, skills, integrations) add their own via
// registerActivity without touching the application shell. Areas:
// sidebar views render in the left sidebar, aside views render in
// the right-side auxiliary dock, panel destinations toggle the
// bottom panel, center destinations switch the center view, and
// action destinations run a shell command instead of selecting
// anything.

export type ActivityArea = 'sidebar' | 'aside' | 'panel' | 'center' | 'action'

export interface ActivityDefinition {
  id: string
  label: string
  paths: string[]
  area: ActivityArea
  order: number
  hint?: string
}

const ID_PATTERN = /^[a-z0-9-]{2,24}$/
const AREAS: ActivityArea[] = ['sidebar', 'aside', 'panel', 'center', 'action']

const registry = new Map<string, ActivityDefinition>()
let builtinsRegistered = false

function assertDefinition(def: ActivityDefinition): void {
  if (!def || typeof def !== 'object') {
    throw new Error('Invalid activity: an object is required.')
  }

  if (typeof def.id !== 'string' || !ID_PATTERN.test(def.id)) {
    throw new Error(
      'Invalid activity: id must be 2-24 lowercase letters, digits, or dashes.'
    )
  }

  if (
    typeof def.label !== 'string' ||
    !def.label.trim() ||
    def.label.length > 40
  ) {
    throw new Error(`Invalid activity "${def.id}": label is invalid.`)
  }

  if (
    !Array.isArray(def.paths) ||
    def.paths.length === 0 ||
    def.paths.length > 8 ||
    def.paths.some(
      (entry) =>
        typeof entry !== 'string' || !entry.trim() || entry.length > 500
    )
  ) {
    throw new Error(`Invalid activity "${def.id}": icon paths are invalid.`)
  }

  if (!AREAS.includes(def.area)) {
    throw new Error(`Invalid activity "${def.id}": area is invalid.`)
  }

  if (typeof def.order !== 'number' || !Number.isFinite(def.order)) {
    throw new Error(`Invalid activity "${def.id}": order is invalid.`)
  }
}

export function registerActivity(def: ActivityDefinition): void {
  assertDefinition(def)

  if (registry.has(def.id)) {
    throw new Error(`Activity "${def.id}" is already registered.`)
  }

  registry.set(def.id, { ...def, paths: [...def.paths] })
}

export function unregisterActivity(id: string): boolean {
  return registry.delete(id)
}

export function getActivity(id: string): ActivityDefinition | null {
  return registry.get(id) ?? null
}

export function hasActivity(id: string): boolean {
  return registry.has(id)
}

export function listActivities(): ActivityDefinition[] {
  return [...registry.values()].sort((a, b) =>
    a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order
  )
}

// Original stroke icons in a 24x24 grid; no external icon font.
const BUILTINS: ActivityDefinition[] = [
  {
    id: 'explorer',
    label: 'Explorer',
    area: 'sidebar',
    order: 10,
    paths: [
      'M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z',
      'M13 3v5h6',
      'M9 13h6M9 17h4',
    ],
  },
  {
    id: 'search',
    label: 'Search',
    area: 'sidebar',
    order: 20,
    paths: ['M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M20 20l-4.2-4.2'],
  },
  {
    id: 'git',
    label: 'Source Control',
    area: 'sidebar',
    order: 30,
    paths: [
      'M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v6',
      'M6 3a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 6 3z',
      'M18 15a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 18 15z',
      'M6 15a1.6 1.6 0 1 0 0 3.2A1.6 1.6 0 0 0 6 15z',
    ],
  },
  {
    id: 'run',
    label: 'Run and Debug',
    area: 'sidebar',
    order: 40,
    paths: ['M7 4l13 8-13 8z', 'M7 4v16'],
  },
  {
    id: 'extensions',
    label: 'Extensions',
    area: 'sidebar',
    order: 50,
    paths: [
      'M4 4h7v7H4z',
      'M13 4h7v7h-7z',
      'M4 13h7v7H4z',
      'M15.5 13.5l4 4m0-4l-4 4',
    ],
  },
  {
    id: 'ai-workspace',
    label: 'AI Workspace',
    area: 'aside',
    order: 60,
    hint: 'Chat, Research, Build',
    paths: [
      'M12 3l2.2 5.4L20 10l-4.4 3.8L17 20l-5-3.4L7 20l1.4-6.2L4 10l5.8-1.6z',
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    area: 'aside',
    order: 70,
    hint: 'Documents, connections, memory',
    paths: [
      'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z',
      'M4 5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13',
      'M9 8h6',
    ],
  },
  {
    id: 'history',
    label: 'History',
    area: 'aside',
    order: 80,
    hint: 'Recent threads and projects',
    paths: [
      'M4 12a8 8 0 1 1 2.3 5.7',
      'M4 12H2m2 0l2-2',
      'M12 8v4l3 2',
    ],
  },
]

export function registerBuiltinActivities(): void {
  if (builtinsRegistered) {
    return
  }

  for (const def of BUILTINS) {
    if (!registry.has(def.id)) {
      registry.set(def.id, { ...def, paths: [...def.paths] })
    }
  }

  builtinsRegistered = true
}

// Test seam: clears the registry (including builtins) so duplicate
// registration tests start clean. Never used by the running app.
export function __resetActivityRegistry(): void {
  registry.clear()
  builtinsRegistered = false
}
