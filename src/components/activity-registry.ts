// Extensible activity-bar navigation (Level 3C, Phase 1; Level 4
// readiness). Builtin destinations register here at startup, and
// future modules (extensions, skills, integrations) add their own via
// registerActivity without touching the application shell. Areas:
// sidebar views render in the sidebar, panel destinations toggle the
// bottom panel, center destinations switch the center view, and
// action destinations run a shell command (open Meta AI tab, open
// settings) instead of selecting anything.

export type ActivityArea = 'sidebar' | 'panel' | 'center' | 'action'

export interface ActivityDefinition {
  id: string
  label: string
  paths: string[]
  area: ActivityArea
  order: number
  hint?: string
}

const ID_PATTERN = /^[a-z0-9-]{2,24}$/
const AREAS: ActivityArea[] = ['sidebar', 'panel', 'center', 'action']

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
    area: 'panel',
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
    label: 'Run and Diagnostics',
    area: 'panel',
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
    id: 'tools',
    label: 'Project Tools',
    area: 'sidebar',
    order: 60,
    hint: 'GitHub, documents, provider keys',
    paths: [
      'M9 7V4M15 7V4',
      'M7 7h10v4a5 5 0 0 1-10 0z',
      'M12 16v5',
    ],
  },
  {
    id: 'memory',
    label: 'Memory',
    area: 'sidebar',
    order: 70,
    paths: [
      'M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z',
    ],
  },
  {
    id: 'intel',
    label: 'Intelligence',
    area: 'center',
    order: 80,
    hint: 'Project index, planning, specialists, quality',
    paths: [
      'M12 3v4M12 17v4M3 12h4M17 12h4',
      'M12 12m-3.5 0a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0',
    ],
  },
  {
    id: 'platform',
    label: 'Platform',
    area: 'center',
    order: 90,
    hint: 'Providers, skills, workflows, integrations, templates',
    paths: [
      'M12 3l9 5-9 5-9-5z',
      'M3 13l9 5 9-5',
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    area: 'center',
    order: 95,
    hint: 'Autonomous coding agent runs',
    paths: [
      'M5 4h14v12H9l-4 4z',
      'M9 9h6M9 12h4',
    ],
  },
  {
    id: 'ai',
    label: 'Meta AI',
    area: 'action',
    order: 100,
    hint: 'Open a Meta AI session tab',
    paths: [
      'M18.6 6.6c-2 0-3.4 1.2-4.5 2.7l-2.1 3.4-2.1-3.4C8.8 7.8 7.4 6.6 5.4 6.6a4.1 4.1 0 0 0 0 8.2c2 0 3.4-1.2 4.5-2.7l2.1-3.4 2.1 3.4c1.1 1.5 2.5 2.7 4.5 2.7a4.1 4.1 0 0 0 0-8.2z',
    ],
  },
  {
    id: 'home',
    label: 'Welcome',
    area: 'center',
    order: 105,
    hint: 'Welcome and recent projects',
    paths: [
      'M4 11l8-7 8 7',
      'M6 9.5V20a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5',
    ],
  },
  {
    id: 'account',
    label: 'Account',
    area: 'sidebar',
    order: 110,
    paths: [
      'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
      'M4 21a8 8 0 0 1 16 0',
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
