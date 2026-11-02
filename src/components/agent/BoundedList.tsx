// Threshold-gated windowing for long agent output (timelines,
// checks). A hook, so callers keep their own list semantics (<ul>,
// <div role="log">) and only the item window plus the footer come
// from here. Small lists render in full; large lists show a leading
// window with explicit Show more / Show all controls. `expandAll`
// lets a live view (timeline follow mode) keep the tail visible
// while new items arrive. Callers reset the window by keying the
// view on the run id; polls that append items never collapse it.
import { useState } from 'react'

export interface BoundedWindow<T> {
  visible: T[]
  remaining: number
  footer: React.ReactNode
}

export function useBoundedList<T>(
  items: T[],
  options: { threshold?: number; page?: number; expandAll?: boolean } = {}
): BoundedWindow<T> {
  const threshold = options.threshold ?? 50
  const page = options.page ?? 50
  const [extra, setExtra] = useState(0)
  const [showAll, setShowAll] = useState(false)

  const expanded = showAll || options.expandAll === true
  const visible = expanded ? items : items.slice(0, threshold + extra)
  const remaining = items.length - visible.length

  return {
    visible,
    remaining,
    footer:
      remaining > 0 ? (
        <div className="bounded-list-more">
          <button
            type="button"
            className="mini-btn"
            onClick={() => setExtra((value) => value + page)}
          >
            Show more ({remaining} remaining)
          </button>
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowAll(true)}
          >
            Show all
          </button>
        </div>
      ) : null,
  }
}
