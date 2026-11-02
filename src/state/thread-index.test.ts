// D1 thread-index tests: versioning, corruption safety, merge
// purity, project isolation, and failure handling.
import { describe, expect, it } from 'vitest'
import {
  THREAD_INDEX_KEY,
  THREAD_INDEX_VERSION,
  buildThreadRefs,
  filterThreadsByMode,
  filterThreadsForRoot,
  loadThreadIndex,
  makeThreadId,
  saveThreadIndex,
} from './thread-index'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))

  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  } as Storage
}

describe('thread index storage', () => {
  it('loads empty when nothing is stored', () => {
    const result = loadThreadIndex(memoryStorage())

    expect(result.corrupt).toBe(false)
    expect(result.index).toEqual({ version: THREAD_INDEX_VERSION, refs: [] })
  })

  it('round-trips refs without payloads', () => {
    const storage = memoryStorage()
    const refs = buildThreadRefs({
      root: 'C:/p',
      chats: [{ id: 'c1', title: 'Hi', messageCount: 2, updatedAt: '2026-01-02' }],
      research: [],
      agentRuns: [],
      metaSessions: [],
    })

    expect(saveThreadIndex(storage, { version: THREAD_INDEX_VERSION, refs })).toBe(
      true
    )

    const raw = storage.getItem(THREAD_INDEX_KEY) ?? ''
    expect(raw).not.toContain('messageCount')

    const loaded = loadThreadIndex(storage)
    expect(loaded.corrupt).toBe(false)
    expect(loaded.index.refs).toEqual(refs)
  })

  it('treats bad versions and corrupt JSON as empty, never throwing', () => {
    for (const raw of [
      '{not json',
      JSON.stringify({ version: 99, refs: [] }),
      JSON.stringify({ version: THREAD_INDEX_VERSION, refs: 'nope' }),
      JSON.stringify({ version: THREAD_INDEX_VERSION }),
    ]) {
      const result = loadThreadIndex(memoryStorage({ [THREAD_INDEX_KEY]: raw }))

      expect(result.corrupt).toBe(true)
      expect(result.index.refs).toEqual([])
    }
  })

  it('drops invalid entries but keeps valid siblings', () => {
    const good = {
      id: makeThreadId('chat', 'chat-store', 'c1'),
      mode: 'chat',
      source: 'chat-store',
      ref: 'c1',
      root: 'C:/p',
      title: 'Hi',
      updatedAt: '2026-01-02',
    }
    const storage = memoryStorage({
      [THREAD_INDEX_KEY]: JSON.stringify({
        version: THREAD_INDEX_VERSION,
        refs: [good, { id: 'bogus' }, null, 'x'],
      }),
    })

    const result = loadThreadIndex(storage)

    expect(result.corrupt).toBe(false)
    expect(result.index.refs).toEqual([good])
    // Stored bytes untouched: no repair-in-place.
    expect(storage.getItem(THREAD_INDEX_KEY)).toContain('bogus')
  })

  it('rejects refs whose id does not match mode/source/ref', () => {
    const storage = memoryStorage({
      [THREAD_INDEX_KEY]: JSON.stringify({
        version: THREAD_INDEX_VERSION,
        refs: [
          {
            id: 'chat:chat-store:WRONG',
            mode: 'chat',
            source: 'chat-store',
            ref: 'c1',
            root: 'C:/p',
            title: 'Hi',
            updatedAt: '2026-01-02',
          },
        ],
      }),
    })

    expect(loadThreadIndex(storage).index.refs).toEqual([])
  })

  it('reports save failures instead of throwing', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota')
      },
    } as unknown as Storage

    expect(
      saveThreadIndex(storage, { version: THREAD_INDEX_VERSION, refs: [] })
    ).toBe(false)
  })
})

describe('thread index merge and filters', () => {
  it('merges all homes newest-first with fallbacks', () => {
    const refs = buildThreadRefs({
      root: 'C:/p',
      chats: [{ id: 'c1', title: '', messageCount: 0, updatedAt: '2026-01-01' }],
      research: [
        {
          id: 'r1',
          objective: 'obj',
          status: 'done',
          sources: 3,
          briefVersion: 1,
          updatedAt: '2026-01-03',
          createdAt: '2026-01-03',
        },
      ],
      agentRuns: [
        {
          version: 1,
          id: 'a1',
          planId: 'p1',
          planTitle: '',
          state: 'completed',
          createdAt: '2026-01-02',
          updatedAt: '2026-01-02',
          tasks: [],
          ownership: [],
          outcome: null,
          history: [],
        },
      ],
      metaSessions: [],
    })

    expect(refs.map((ref) => ref.id)).toEqual([
      'research:research:r1',
      'agent:agent-run:a1',
      'chat:chat-store:c1',
    ])
    expect(refs[1].title).toBe('Untitled run')
    expect(refs[2].title).toBe('Untitled conversation')
  })

  it('isolates projects and filters modes', () => {
    const refs = buildThreadRefs({
      root: 'C:/p',
      chats: [],
      research: [],
      agentRuns: [],
      metaSessions: [
        { id: 'm1', title: 'A', root: 'C:/p', updatedAt: '2026-01-01' },
        { id: 'm2', title: 'B', root: 'C:/other', updatedAt: '2026-01-02' },
      ],
    })

    expect(filterThreadsForRoot(refs, 'C:/p').map((r) => r.ref)).toEqual(['m1'])
    expect(filterThreadsByMode(refs, 'meta')).toHaveLength(2)
    expect(filterThreadsByMode(refs, 'chat')).toEqual([])
    expect(filterThreadsByMode(refs, 'all')).toHaveLength(2)
  })
})
