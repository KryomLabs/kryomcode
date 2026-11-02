// Bottom-panel Debug Console (Phase D1, blueprint decision D4): a thin
// filtered view over the existing renderer output log
// (src/utils/output-log.ts). It shows only entries logged with the
// 'debug' source — one-line diagnostics/terminal run summaries —
// while full output stays where it already lives (Problems raw
// output, Terminal entries). No new backend, no new store, no debug
// adapter: candidate (b) of the §4.F open decision.
//
// Deliberately has no Clear action: the log is shared with the
// Output tab, and clearing it here would wipe Output's history.
import { useEffect, useRef, useState } from 'react'
import {
  getOutput,
  subscribeOutput,
  type OutputEntry,
} from '../utils/output-log'

export const DEBUG_CONSOLE_SOURCE = 'debug'

export function DebugConsolePanel() {
  const [entries, setEntries] = useState<OutputEntry[]>(() =>
    getOutput().filter((entry) => entry.source === DEBUG_CONSOLE_SOURCE)
  )
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(
    () =>
      subscribeOutput((next) =>
        setEntries(
          next.filter((entry) => entry.source === DEBUG_CONSOLE_SOURCE)
        )
      ),
    []
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [entries.length])

  return (
    <section
      className="debug-console-panel bottom-tab-panel"
      aria-label="Debug Console"
    >
      <div className="output-toolbar">
        <span className="muted">
          Debug output{entries.length > 0 ? ` (${entries.length})` : ''}
        </span>
      </div>

      <div
        className="output-log"
        role="log"
        aria-label="Debug console output"
      >
        {entries.length === 0 && (
          <p className="muted padded">
            No debug output yet. Diagnostics and terminal runs record
            one-line summaries here; full output stays in the Problems
            and Terminal tabs.
          </p>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="output-line">
            <span className="output-time">{entry.at}</span>
            <span className="output-message">{entry.message}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </section>
  )
}
