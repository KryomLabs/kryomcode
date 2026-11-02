import { useEffect, useRef, useState } from 'react'
import {
  clearOutput,
  getOutput,
  subscribeOutput,
  type OutputEntry,
} from '../utils/output-log'

// Output tab: the renderer's application event log. Entries are real
// milestones and errors only; an empty log means a quiet session.
export function OutputPanel() {
  const [entries, setEntries] = useState<OutputEntry[]>(() => getOutput())
  const [source, setSource] = useState<string>('all')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => subscribeOutput(setEntries), [])

  // Sources present in the log, in first-seen order. Filtering is
  // view-only: Clear still clears the whole shared log.
  const sources: string[] = []

  for (const entry of entries) {
    if (!sources.includes(entry.source)) {
      sources.push(entry.source)
    }
  }

  const visible =
    source === 'all'
      ? entries
      : entries.filter((entry) => entry.source === source)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [visible.length])

  return (
    <section className="output-panel bottom-tab-panel" aria-label="Output">
      <div className="output-toolbar">
        <span className="muted">
          Application events{entries.length > 0 ? ` (${visible.length}/${entries.length})` : ''}
        </span>
        <label className="output-filter">
          Source
          <select
            aria-label="Filter output by source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="all">All</option>
            {sources.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button
          type="button"
          className="mini-btn"
          onClick={() => clearOutput()}
          disabled={entries.length === 0}
          title="Clear the whole application event log"
        >
          Clear
        </button>
      </div>

      <div className="output-log" role="log" aria-label="Application event log">
        {entries.length === 0 && (
          <p className="muted padded">
            No events yet. Workspace, file, terminal, and AI activity is
            recorded here as it happens.
          </p>
        )}

        {entries.length > 0 && visible.length === 0 && (
          <p className="muted padded">
            No events from source “{source}”.
          </p>
        )}

        {visible.map((entry) => (
          <div key={entry.id} className="output-line">
            <span className="output-time">{entry.at}</span>
            <span className="output-source">[{entry.source}]</span>
            <span className="output-message">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}
