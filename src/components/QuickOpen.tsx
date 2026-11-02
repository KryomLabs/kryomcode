import { useEffect, useMemo, useRef, useState } from 'react'
import { baseName } from '../utils/paths'
import { fuzzyScore } from '../utils/fuzzy'

export interface QuickOpenProps {
  open: boolean
  root: string
  tree: KryomNode[]
  onOpen: (path: string) => void
  onClose: () => void
}

interface FileEntry {
  path: string
  relative: string
  name: string
}

const MAX_INDEXED = 3000
const MAX_SHOWN = 60

function flattenTree(nodes: KryomNode[], root: string): FileEntry[] {
  const out: FileEntry[] = []
  const stack: KryomNode[] = [...nodes]

  while (stack.length > 0 && out.length < MAX_INDEXED) {
    const node = stack.pop()

    if (!node) {
      break
    }

    if (node.type === 'file') {
      const name = baseName(node.path)
      const relative = node.path.startsWith(`${root}/`)
        ? node.path.slice(root.length + 1)
        : node.path.startsWith(`${root}\\`)
          ? node.path.slice(root.length + 1)
          : node.path

      out.push({ path: node.path, relative, name })
    } else if (node.children) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index])
      }
    }
  }

  return out
}

function rankEntries(entries: FileEntry[], query: string): FileEntry[] {
  const q = query.trim().toLowerCase()

  if (!q) {
    return [...entries]
      .sort((a, b) => a.relative.localeCompare(b.relative))
      .slice(0, MAX_SHOWN)
  }

  const scored: Array<{ entry: FileEntry; score: number }> = []

  for (const entry of entries) {
    const nameScore = fuzzyScore(q, entry.name.toLowerCase())
    const pathScore = fuzzyScore(q, entry.relative.toLowerCase())

    if (nameScore < 0 && pathScore < 0) {
      continue
    }

    scored.push({
      entry,
      score:
        Math.max(nameScore * 3, pathScore) * 1000 -
        entry.relative.length,
    })
  }

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, MAX_SHOWN).map((item) => item.entry)
}

export function QuickOpen(props: QuickOpenProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const entries = useMemo(
    () => flattenTree(props.tree, props.root),
    [props.tree, props.root]
  )

  const truncated = entries.length >= MAX_INDEXED
  const matches = useMemo(() => rankEntries(entries, query), [entries, query])

  useEffect(() => {
    if (props.open) {
      setQuery('')
      setActive(0)

      const timer = window.setTimeout(() => inputRef.current?.focus(), 0)

      return () => window.clearTimeout(timer)
    }

    return undefined
  }, [props.open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!props.open) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose()
      }
    }

    document.addEventListener('keydown', onKey)

    return () => document.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!props.open) {
    return null
  }

  function choose(entry: FileEntry | undefined) {
    if (!entry) {
      return
    }

    props.onOpen(entry.path)
    props.onClose()
  }

  return (
    <div
      className="dialog-overlay quick-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose()
        }
      }}
    >
      <div
        className="quick-open"
        role="dialog"
        aria-modal="true"
        aria-label="Go to File"
      >
        <input
          ref={inputRef}
          className="quick-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((index) =>
                matches.length === 0
                  ? 0
                  : (index + 1) % matches.length
              )
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((index) =>
                matches.length === 0
                  ? 0
                  : (index - 1 + matches.length) % matches.length
              )
            } else if (event.key === 'Enter') {
              event.preventDefault()
              choose(matches[active])
            }
          }}
          placeholder="Type a file name to open…"
          aria-label="File name"
          spellCheck={false}
        />

        <ul className="quick-list" ref={listRef} role="listbox" aria-label="Matching files">
          {matches.length === 0 && (
            <li className="muted padded">
              {entries.length === 0
                ? 'Open a project to search its files.'
                : 'No files match.'}
            </li>
          )}

          {matches.map((entry, index) => (
            <li key={entry.path} role="option" aria-selected={index === active}>
              <button
                type="button"
                data-active={index === active}
                className={
                  index === active ? 'quick-row active' : 'quick-row'
                }
                onClick={() => choose(entry)}
                onMouseMove={() => {
                  if (index !== active) {
                    setActive(index)
                  }
                }}
              >
                <span className="quick-name">{entry.name}</span>
                <span className="muted quick-path">{entry.relative}</span>
              </button>
            </li>
          ))}
        </ul>

        <p className="muted quick-foot">
          {matches.length} shown · ↑↓ to move · Enter to open · Esc to close
          {truncated ? ' · file index capped, narrow the match' : ''}
        </p>
      </div>
    </div>
  )
}
