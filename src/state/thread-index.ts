// Unified thread index (Phase B, D1 option A). The three storage
// homes keep their records; this index holds REFERENCES ONLY —
// stable ids, modes, titles, timestamps — never message payloads.
// Corrupt or version-mismatched indexes degrade to an empty list;
// they can never delete or overwrite source records.

export const THREAD_INDEX_VERSION = 1
export const THREAD_INDEX_KEY = 'kryom.thread-index.v1'

export type ThreadMode = 'chat' | 'research' | 'agent' | 'meta'
export type ThreadSource =
  | 'chat-store'
  | 'research'
  | 'agent-run'
  | 'meta-session'

export interface ThreadRef {
  // Stable composite id: `${mode}:${source}:${ref}`.
  id: string
  mode: ThreadMode
  source: ThreadSource
  // Record id in the source home.
  ref: string
  // Project root the record belongs to ('' when unknown/project-less).
  root: string
  title: string
  updatedAt: string
}

export interface ThreadIndex {
  version: number
  refs: ThreadRef[]
}

export interface IndexLoadResult {
  index: ThreadIndex
  // True when stored data existed but was unusable ( Caller may warn;
  // the index still behaves as empty — nothing is repaired in place.
  corrupt: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

function sanitizeRef(value: unknown): ThreadRef | null {
  if (!isRecord(value)) {
    return null
  }

  const mode = value.mode
  const source = value.source
  const ref = asString(value.ref, 160)
  const root = asString(value.root, 1024)
  const title = asString(value.title, 200)
  const updatedAt = asString(value.updatedAt, 40)
  const id = asString(value.id, 240)

  if (
    (mode !== 'chat' &&
      mode !== 'research' &&
      mode !== 'agent' &&
      mode !== 'meta') ||
    (source !== 'chat-store' &&
      source !== 'research' &&
      source !== 'agent-run' &&
      source !== 'meta-session') ||
    ref === null ||
    root === null ||
    title === null ||
    updatedAt === null ||
    id === null
  ) {
    return null
  }

  if (id !== `${mode}:${source}:${ref}`) {
    return null
  }

  return { id, mode, source, ref, root, title, updatedAt }
}

export function loadThreadIndex(storage: Pick<Storage, 'getItem'>): IndexLoadResult {
  const empty: ThreadIndex = { version: THREAD_INDEX_VERSION, refs: [] }
  let raw: string | null = null

  try {
    raw = storage.getItem(THREAD_INDEX_KEY)
  } catch {
    return { index: empty, corrupt: true }
  }

  if (raw === null || raw === '') {
    return { index: empty, corrupt: false }
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return { index: empty, corrupt: true }
  }

  if (!isRecord(parsed) || parsed.version !== THREAD_INDEX_VERSION) {
    return { index: empty, corrupt: true }
  }

  if (!Array.isArray(parsed.refs)) {
    return { index: empty, corrupt: true }
  }

  // Invalid entries drop individually; one bad ref never poisons
  // the rest, and the stored file is left untouched.
  const refs: ThreadRef[] = []

  for (const entry of parsed.refs) {
    const clean = sanitizeRef(entry)

    if (clean) {
      refs.push(clean)
    }
  }

  refs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return { index: { version: THREAD_INDEX_VERSION, refs }, corrupt: false }
}

export function saveThreadIndex(
  storage: Pick<Storage, 'setItem'>,
  index: ThreadIndex
): boolean {
  try {
    storage.setItem(
      THREAD_INDEX_KEY,
      JSON.stringify({ version: THREAD_INDEX_VERSION, refs: index.refs })
    )
    return true
  } catch {
    return false
  }
}

export function makeThreadId(
  mode: ThreadMode,
  source: ThreadSource,
  ref: string
): string {
  return `${mode}:${source}:${ref}`
}

export interface IndexInputs {
  root: string
  chats: KryomChatSession[]
  research: KryomResearchSummary[]
  agentRuns: KryomOrchRun[]
  metaSessions: Array<{
    id: string
    title: string
    root: string | null
    updatedAt: string
  }>
}

// Pure merge of live home listings into references. Titles fall back
// to stable labels when a home omits them; nothing here writes.
export function buildThreadRefs(inputs: IndexInputs): ThreadRef[] {
  const refs: ThreadRef[] = []

  for (const chat of inputs.chats) {
    refs.push({
      id: makeThreadId('chat', 'chat-store', chat.id),
      mode: 'chat',
      source: 'chat-store',
      ref: chat.id,
      root: inputs.root,
      title: chat.title || 'Untitled conversation',
      updatedAt: chat.updatedAt ?? '',
    })
  }

  for (const item of inputs.research) {
    refs.push({
      id: makeThreadId('research', 'research', item.id),
      mode: 'research',
      source: 'research',
      ref: item.id,
      root: inputs.root,
      title: item.name || item.objective || 'Untitled investigation',
      updatedAt: item.updatedAt ?? '',
    })
  }

  for (const run of inputs.agentRuns) {
    refs.push({
      id: makeThreadId('agent', 'agent-run', run.id),
      mode: 'agent',
      source: 'agent-run',
      ref: run.id,
      root: inputs.root,
      title: run.planTitle || 'Untitled run',
      updatedAt: run.updatedAt ?? '',
    })
  }

  for (const session of inputs.metaSessions) {
    refs.push({
      id: makeThreadId('meta', 'meta-session', session.id),
      mode: 'meta',
      source: 'meta-session',
      ref: session.id,
      root: session.root ?? '',
      title: session.title || 'Untitled thread',
      updatedAt: session.updatedAt ?? '',
    })
  }

  refs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return refs
}

// Project isolation: entries from other roots never surface.
export function filterThreadsForRoot(refs: ThreadRef[], root: string): ThreadRef[] {
  if (root === '') {
    return refs.filter((ref) => ref.root === '')
  }

  return refs.filter((ref) => ref.root === root)
}

export function filterThreadsByMode(
  refs: ThreadRef[],
  mode: ThreadMode | 'all'
): ThreadRef[] {
  if (mode === 'all') {
    return refs
  }

  return refs.filter((ref) => ref.mode === mode)
}
