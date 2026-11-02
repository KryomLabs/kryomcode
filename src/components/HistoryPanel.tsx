// History view (Phase B): unified thread discovery over the D1
// thread index. Entries are references — opening routes through
// the shell's existing openers; stale refs fail loud in the opener,
// never by deleting index data here.
import { baseName } from '../utils/paths'
import type { ThreadMode, ThreadRef } from '../state/thread-index'

export type HistoryFilter = ThreadMode | 'all'

const FILTERS: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'chat', label: 'Chat' },
  { id: 'research', label: 'Research' },
  { id: 'agent', label: 'Agent' },
  { id: 'meta', label: 'Meta AI' },
]

const MODE_LABEL: Record<ThreadMode, string> = {
  chat: 'Chat',
  research: 'Research',
  agent: 'Agent',
  meta: 'Meta AI',
}

export interface HistoryPanelProps {
  threads: ThreadRef[]
  recent: string[]
  corrupt: boolean
  filter: HistoryFilter
  onFilterChange: (filter: HistoryFilter) => void
  onOpenThread: (thread: ThreadRef) => void
  onNewThread: (mode: ThreadMode) => void
  onOpenRecent: (root: string) => void
}

function formatWhen(iso: string): string {
  if (iso === '') {
    return 'unknown time'
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return 'unknown time'
  }

  return date.toLocaleString()
}

export function HistoryPanel(props: HistoryPanelProps) {
  const visible =
    props.filter === 'all'
      ? props.threads
      : props.threads.filter((thread) => thread.mode === props.filter)

  return (
    <div className="aside-hub" role="group" aria-label="History">
      <div
        className="history-filter"
        role="group"
        aria-label="Filter threads by mode"
      >
        {FILTERS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={
              props.filter === entry.id
                ? 'filter-chip active'
                : 'filter-chip'
            }
            aria-pressed={props.filter === entry.id}
            onClick={() => props.onFilterChange(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {props.corrupt && (
        <p className="muted padded" role="alert">
          Saved thread index was unreadable — showing live records only.
          Nothing was deleted.
        </p>
      )}

      <p className="side-subhead">THREADS</p>
      {visible.length === 0 && (
        <p className="muted padded">No threads yet.</p>
      )}
      {visible.slice(0, 50).map((thread) => (
        <button
          key={thread.id}
          type="button"
          className="hub-row"
          onClick={() => props.onOpenThread(thread)}
          title={`${thread.title} · ${thread.ref}`}
        >
          <span className="hub-label">{thread.title}</span>
          <span className="muted hub-hint">
            {MODE_LABEL[thread.mode]} · {formatWhen(thread.updatedAt)}
          </span>
        </button>
      ))}

      <p className="side-subhead">NEW</p>
      {(['chat', 'research', 'agent', 'meta'] as ThreadMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          className="hub-row hub-action"
          onClick={() => props.onNewThread(mode)}
        >
          <span className="hub-label">+ New {MODE_LABEL[mode]} thread</span>
        </button>
      ))}

      <p className="side-subhead">RECENT PROJECTS</p>
      {props.recent.length === 0 && (
        <p className="muted padded">No recent projects.</p>
      )}
      {props.recent.slice(0, 10).map((root) => (
        <button
          key={root}
          type="button"
          className="hub-row"
          onClick={() => props.onOpenRecent(root)}
          title={root}
        >
          <span className="hub-label">{baseName(root)}</span>
          <span className="muted hub-hint">{root}</span>
        </button>
      ))}
    </div>
  )
}
