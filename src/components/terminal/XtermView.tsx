// xterm.js render layer (Phase D2, blueprint T1 scope). Renders the
// existing buffered `runCommand` results — one transcript for all
// completed entries — with ANSI colors, selection, scrollback, and
// clickable links. This is a RENDERER, not a shell: no stdin
// handler is attached (typed keys echo nowhere and execute
// nothing), running entries keep the form's honest "Running…"
// indicator outside the transcript, and every block is labeled as a
// completed run with its exit code. Execution still flows only
// through the TerminalPanel controller + terminal:run IPC.
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react'
import { Terminal, type ITheme } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import 'xterm/css/xterm.css'
import { kryom } from '../../api/kryom'
import type { TerminalRunEntry } from '../TerminalPanel'

export interface XtermViewProps {
  entries: TerminalRunEntry[]
  theme: 'dark' | 'light'
  fontSize: number
  autoScroll: boolean
  onSelectionAvailable?: (hasSelection: boolean) => void
}

export interface XtermViewHandle {
  // Copies the current selection to the clipboard. Returns false
  // when there is no selection to copy.
  copySelection: () => boolean
}

interface XtermViewPropsWithRef extends XtermViewProps {
  ref?: Ref<XtermViewHandle>
}

const SCROLLBACK_LINES = 5000
const FONT_FAMILY =
  "'JetBrains Mono Variable', 'Cascadia Code', Consolas, monospace"

// Token fallbacks mirror src/styles/tokens.css (dark) and
// src/styles/theme.css (light). Live values resolve from the
// mounted container's computed style so the terminal follows the
// active theme without a second token source.
const THEME_FALLBACKS = {
  dark: {
    background: '#121319',
    foreground: '#e7e7ec',
    cursor: '#8b7cff',
    selectionBackground: 'rgba(139, 124, 255, 0.35)',
  },
  light: {
    background: '#ffffff',
    foreground: '#191a20',
    cursor: '#5f4fd6',
    selectionBackground: 'rgba(95, 79, 214, 0.28)',
  },
} as const

function cssVar(
  element: HTMLElement,
  name: string,
  fallback: string
): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim()

  return value || fallback
}

function buildTheme(
  container: HTMLElement,
  theme: 'dark' | 'light'
): ITheme {
  const fallback = THEME_FALLBACKS[theme]

  return {
    background: cssVar(container, '--kc-panel-deep', fallback.background),
    foreground: cssVar(container, '--kc-text', fallback.foreground),
    cursor: cssVar(container, '--kc-accent', fallback.cursor),
    selectionBackground: fallback.selectionBackground,
  }
}

function statusLine(result: NonNullable<TerminalRunEntry['result']>): string {
  return (
    `Exit code: ${result.exitCode}` +
    (result.timedOut ? ' · timed out' : '') +
    (result.outputLimited ? ' · output truncated' : '') +
    (result.cancelled
      ? ' · cancelled'
      : result.exitCode === 0 && !result.timedOut
        ? ' · success'
        : ' · failed')
  )
}

function writeEntry(terminal: Terminal, entry: TerminalRunEntry): void {
  const result = entry.result

  if (!result) {
    return
  }

  // Chrome lines use basic SGR (bold header, yellow warnings, dim
  // footer); the command output itself renders verbatim so its own
  // ANSI colors and unicode survive untouched.
  terminal.writeln(`\x1b[1m> ${entry.command}\x1b[0m`)

  for (const warning of result.warnings) {
    terminal.writeln(`\x1b[33m⚠ ${warning} Review before trusting.\x1b[0m`)
  }

  if (result.output !== '') {
    // xterm needs explicit carriage returns; lone \n would
    // stair-step. \r\n input (Windows shells) collapses first so it
    // never double-breaks.
    terminal.write(result.output.replace(/\r?\n/g, '\r\n'))

    if (!result.output.endsWith('\n')) {
      terminal.writeln('')
    }
  }

  terminal.writeln(`\x1b[2m${statusLine(result)}\x1b[0m`)
  terminal.writeln('')
}

export function XtermView(props: XtermViewPropsWithRef) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Ids of entries already in the transcript, in order. The
  // controller completes entries in order (single-flight), so the
  // transcript only ever appends — except entry eviction (20-entry
  // cap) and Clear, which rebuild from scratch.
  const renderedRef = useRef<number[]>([])
  const selectionRef = useRef(props.onSelectionAvailable)
  selectionRef.current = props.onSelectionAvailable
  const autoScrollRef = useRef(props.autoScroll)
  autoScrollRef.current = props.autoScroll
  const [announcement, setAnnouncement] = useState('')

  useImperativeHandle(
    props.ref,
    () => ({
      copySelection: () => {
        const selection = terminalRef.current?.getSelection() ?? ''

        if (!selection) {
          return false
        }

        if (navigator.clipboard) {
          void navigator.clipboard
            .writeText(selection)
            .catch(() => undefined)
        }

        return true
      },
    }),
    []
  )

  // Mount once: exactly one Terminal per mounted view. StrictMode
  // double-invoke is safe — cleanup disposes everything created.
  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const terminal = new Terminal({
      // Static bar cursor: this surface renders output only, so
      // nothing here should look like an input position.
      cursorStyle: 'bar',
      cursorBlink: false,
      fontSize: props.fontSize,
      fontFamily: FONT_FAMILY,
      theme: buildTheme(container, props.theme),
      scrollback: SCROLLBACK_LINES,
      screenReaderMode: true,
    })

    const fit = new FitAddon()
    // Links open through the validated openExternal bridge (the
    // same path Research sources use) — never window.open, which
    // the main process denies.
    const links = new WebLinksAddon((_event, uri) => {
      kryom().openExternal(uri).catch(() => undefined)
    })

    terminal.loadAddon(fit)
    terminal.loadAddon(links)
    terminal.open(container)

    // Ctrl+C / Ctrl+Shift+C copies the selection. There is no
    // foreground process to SIGINT in the buffered runner, so copy
    // is the only key action; everything else passes through.
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'c'
      ) {
        return copyKeySelection(terminal)
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'c'
      ) {
        return copyKeySelection(terminal)
      }

      return true
    })

    const selectionListener = terminal.onSelectionChange(() => {
      selectionRef.current?.(terminal.getSelection() !== '')
    })

    fit.fit()

    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => fit.fit())
        : null

    observer?.observe(container)

    terminalRef.current = terminal
    fitRef.current = fit

    return () => {
      observer?.disconnect()
      selectionListener.dispose()
      links.dispose()
      fit.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
      renderedRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Theme + font updates apply live to the mounted terminal.
  useEffect(() => {
    const terminal = terminalRef.current
    const container = containerRef.current

    if (!terminal || !container) {
      return
    }

    terminal.options.theme = buildTheme(container, props.theme)
    terminal.options.fontSize = props.fontSize
    fitRef.current?.fit()
  }, [props.theme, props.fontSize])

  // Transcript sync: append newly completed entries, rebuild after
  // eviction, clear with the controller.
  useEffect(() => {
    const terminal = terminalRef.current

    if (!terminal) {
      return
    }

    const rendered = renderedRef.current
    const ids = props.entries.map((entry) => entry.id)

    if (ids.length === 0) {
      terminal.clear()
      renderedRef.current = []
      setAnnouncement('')
      return
    }

    const prefixIntact =
      rendered.length <= ids.length &&
      rendered.every((id, index) => ids[index] === id)

    if (!prefixIntact) {
      terminal.clear()
      renderedRef.current = []

      for (const entry of props.entries) {
        if (entry.result) {
          writeEntry(terminal, entry)
          renderedRef.current.push(entry.id)
        }
      }
    } else {
      for (const entry of props.entries.slice(rendered.length)) {
        if (entry.result) {
          writeEntry(terminal, entry)
          renderedRef.current.push(entry.id)
        }
      }
    }

    const completed = props.entries.filter(
      (entry) => entry.result !== null
    )
    const last = completed[completed.length - 1]

    if (last?.result) {
      setAnnouncement(
        `Run ${last.id} ${last.result.cancelled ? 'cancelled' : last.result.exitCode === 0 && !last.result.timedOut ? 'completed' : 'failed'}, exit code ${last.result.exitCode}.`
      )
    }

    fitRef.current?.fit()

    if (autoScrollRef.current) {
      terminal.scrollToBottom()
    }
  }, [props.entries])

  return (
    <div className="xterm-host">
      <div
        ref={containerRef}
        className="xterm-container"
        role="log"
        aria-label="Terminal output"
      />
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}

function copyKeySelection(terminal: Terminal): boolean {
  const selection = terminal.getSelection()

  // Returning false swallows the key. Swallow only when a real
  // selection was copied; otherwise let the key pass through.
  if (!selection) {
    return true
  }

  if (navigator.clipboard) {
    void navigator.clipboard.writeText(selection).catch(() => undefined)
  }

  return false
}
