// Command palette (Phase A): keyboard-first invocation for every
// registered shell command. Entries come from the shell with real
// handlers only — a command without a handler is never listed, and
// duplicate ids collapse to their first registration. Shares the
// QuickOpen fuzzy ranking and dialog styling.
import { useEffect, useMemo, useRef, useState } from 'react'
import { rankFuzzy } from '../utils/fuzzy'

export interface PaletteCommand {
  id: string
  label: string
  hint?: string
  run: () => void
}

export interface CommandPaletteProps {
  open: boolean
  commands: PaletteCommand[]
  onClose: () => void
}

const MAX_SHOWN = 60

export function dedupeCommands(commands: PaletteCommand[]): PaletteCommand[] {
  const seen = new Set<string>()
  const out: PaletteCommand[] = []

  for (const command of commands) {
    if (seen.has(command.id)) {
      continue
    }

    seen.add(command.id)
    out.push(command)
  }

  return out
}

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const restoreRef = useRef<Element | null>(null)

  const commands = useMemo(
    () => dedupeCommands(props.commands),
    [props.commands]
  )
  const matches = useMemo(
    () =>
      rankFuzzy(
        commands,
        query,
        (command) => command.label,
        (command) => `${command.id} ${command.hint ?? ''}`,
        MAX_SHOWN
      ),
    [commands, query]
  )

  useEffect(() => {
    if (props.open) {
      restoreRef.current = document.activeElement
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
    const row = listRef.current?.querySelector('[data-active="true"]')

    // jsdom (unit tests) has no scrollIntoView; browsers do.
    if (row && typeof (row as Element).scrollIntoView === 'function') {
      ;(row as Element).scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  // Focus returns to the opener so keyboard flow survives the dialog.
  useEffect(() => {
    if (!props.open && restoreRef.current instanceof HTMLElement) {
      restoreRef.current.focus()
      restoreRef.current = null
    }
  }, [props.open])

  if (!props.open) {
    return null
  }

  function choose(command: PaletteCommand | undefined) {
    if (!command) {
      return
    }

    props.onClose()
    command.run()
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
        aria-label="Command Palette"
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
                matches.length === 0 ? 0 : (index + 1) % matches.length
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
          placeholder="Type a command…"
          aria-label="Command name"
          spellCheck={false}
        />

        <ul
          className="quick-list"
          ref={listRef}
          role="listbox"
          aria-label="Matching commands"
        >
          {matches.length === 0 && (
            <li className="muted padded">No commands match.</li>
          )}

          {matches.map((command, index) => (
            <li key={command.id} role="option" aria-selected={index === active}>
              <button
                type="button"
                data-active={index === active}
                className={
                  index === active ? 'quick-row active' : 'quick-row'
                }
                onClick={() => choose(command)}
                onMouseMove={() => {
                  if (index !== active) {
                    setActive(index)
                  }
                }}
              >
                <span className="quick-name">{command.label}</span>
                {command.hint && (
                  <span className="muted quick-path">{command.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <p className="muted quick-foot">
          {matches.length} shown · ↑↓ to move · Enter to run · Esc to close
        </p>
      </div>
    </div>
  )
}
