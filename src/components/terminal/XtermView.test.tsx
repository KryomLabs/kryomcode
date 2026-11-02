// XtermView tests (Phase D2, T1 scope): single terminal
// instance with the required options, completed runs rendered as
// labeled blocks, no stdin surface (renderer, not a shell), live
// theme/font updates, disposal without leaks, selection copy, and
// validated link opening.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  instances: [] as Array<Record<string, any>>,
  fits: [] as Array<Record<string, any>>,
  linkHandlers: [] as Array<(event: unknown, uri: string) => void>,
}))

vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation((options: Record<string, unknown>) => {
    const instance: Record<string, any> = {
      options,
      open: vi.fn(),
      loadAddon: vi.fn(),
      write: vi.fn(),
      writeln: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      scrollToBottom: vi.fn(),
      getSelection: vi.fn(() => ''),
      onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
      onData: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
    }

    mocks.instances.push(instance)

    return instance
  }),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => {
    const fit: Record<string, any> = { fit: vi.fn(), dispose: vi.fn() }

    mocks.fits.push(fit)

    return fit
  }),
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation((handler: unknown) => {
    mocks.linkHandlers.push(handler as (event: unknown, uri: string) => void)

    return { dispose: vi.fn() }
  }),
}))

import { XtermView, type XtermViewHandle } from './XtermView'
import type { TerminalRunEntry } from '../TerminalPanel'

function completedEntry(
  id: number,
  command: string,
  output: string,
  exitCode = 0
): TerminalRunEntry {
  return {
    id,
    command,
    result: {
      exitCode,
      output,
      timedOut: false,
      cancelled: false,
      outputLimited: false,
      warnings: [],
    },
  }
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    entries: [],
    theme: 'dark' as const,
    fontSize: 13,
    autoScroll: true,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  mocks.instances.length = 0
  mocks.fits.length = 0
  mocks.linkHandlers.length = 0
  Reflect.deleteProperty(window, 'kryom')
  // No restoreAllMocks: the xterm module mocks are file-scoped and
  // every assertion reads a per-test instance from the arrays above.
})

describe('XtermView', () => {
  it('initializes exactly one terminal with the T1 options', () => {
    const { container, rerender } = render(
      <XtermView {...baseProps()} />
    )

    expect(mocks.instances).toHaveLength(1)

    const terminal = mocks.instances[0]

    expect(terminal.options.screenReaderMode).toBe(true)
    expect(terminal.options.scrollback).toBe(5000)
    expect(terminal.options.fontSize).toBe(13)
    expect(String(terminal.options.fontFamily)).toContain('JetBrains Mono')
    expect(terminal.options.cursorBlink).toBe(false)
    expect(terminal.open).toHaveBeenCalledTimes(1)
    expect(
      terminal.open.mock.calls[0][0]
    ).toBe(container.querySelector('.xterm-container'))
    expect(terminal.loadAddon).toHaveBeenCalledTimes(2)
    expect(mocks.fits).toHaveLength(1)
    expect(mocks.fits[0].fit).toHaveBeenCalled()
    expect(mocks.linkHandlers).toHaveLength(1)
    expect(typeof mocks.linkHandlers[0]).toBe('function')

    rerender(<XtermView {...baseProps()} fontSize={14} />)

    expect(mocks.instances).toHaveLength(1)
  })

  it('renders completed runs as labeled blocks and announces them', () => {
    const { container } = render(
      <XtermView
        {...baseProps({
          entries: [
            completedEntry(1, 'npm test', 'ok\n', 0),
            { id: 2, command: 'npm run build', result: null },
          ],
        })}
      />
    )

    const terminal = mocks.instances[0]
    const written: string = [
      ...terminal.write.mock.calls.map((call: unknown[]) => String(call[0])),
      ...terminal.writeln.mock.calls.map((call: unknown[]) => String(call[0])),
    ].join('\n')

    expect(written).toContain('> npm test')
    expect(written).toContain('ok')
    expect(written).toContain('Exit code: 0 · success')
    // The running entry stays out of the transcript: no fake stream.
    expect(written).not.toContain('npm run build')

    const live = container.querySelector('.sr-only')?.textContent ?? ''

    expect(live).toContain('Run 1 completed, exit code 0.')
  })

  it('attaches no stdin surface: typed input can execute nothing', () => {
    render(
      <XtermView
        {...baseProps({ entries: [completedEntry(1, 'npm test', 'ok', 0)] })}
      />
    )

    const terminal = mocks.instances[0]

    expect(terminal.onData).not.toHaveBeenCalled()
  })

  it('applies theme and font updates live and refits', () => {
    const { rerender } = render(
      <XtermView {...baseProps({ fontSize: 13, theme: 'dark' })} />
    )

    const terminal = mocks.instances[0]
    const fit = mocks.fits[0]
    const fitsBefore = fit.fit.mock.calls.length

    rerender(<XtermView {...baseProps({ fontSize: 16, theme: 'light' })} />)

    expect(terminal.options.fontSize).toBe(16)
    expect(terminal.options.theme.background).toBe('#ffffff')
    expect(fit.fit.mock.calls.length).toBeGreaterThan(fitsBefore)
  })

  it('clears with the controller and rebuilds after eviction', () => {
    const { rerender } = render(
      <XtermView
        {...baseProps({ entries: [completedEntry(1, 'a', 'out-a', 0)] })}
      />
    )

    const terminal = mocks.instances[0]
    const writesBefore = terminal.writeln.mock.calls.length

    expect(writesBefore).toBeGreaterThan(0)

    // Eviction: entry 1 is gone, entry 2 is new — full rebuild.
    rerender(
      <XtermView
        {...baseProps({ entries: [completedEntry(2, 'b', 'out-b', 0)] })}
      />
    )

    expect(terminal.clear).toHaveBeenCalled()
    // Output bodies go through write(), chrome lines through
    // writeln() — the rebuilt transcript must contain both.
    const written: string = [
      ...terminal.write.mock.calls.map((call: unknown[]) => String(call[0])),
      ...terminal.writeln.mock.calls.map((call: unknown[]) => String(call[0])),
    ].join('\n')

    expect(written).toContain('> b')
    expect(written).toContain('out-b')

    rerender(<XtermView {...baseProps({ entries: [] })} />)

    expect(terminal.clear).toHaveBeenCalledTimes(2)
  })

  it('disposes the terminal and addons on unmount', () => {
    const { unmount } = render(
      <XtermView
        {...baseProps({ entries: [completedEntry(1, 'a', 'out', 0)] })}
      />
    )

    const terminal = mocks.instances[0]
    const fit = mocks.fits[0]

    unmount()

    expect(terminal.dispose).toHaveBeenCalledTimes(1)
    expect(fit.dispose).toHaveBeenCalledTimes(1)
  })

  it('copies the selection through the imperative handle', () => {
    const writeText = vi.fn(async () => undefined)

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const ref: { current: XtermViewHandle | null } = { current: null }

    render(<XtermView {...baseProps()} ref={ref} />)

    const terminal = mocks.instances[0]

    expect(ref.current?.copySelection()).toBe(false)
    expect(writeText).not.toHaveBeenCalled()

    terminal.getSelection.mockReturnValue('selected output')

    expect(ref.current?.copySelection()).toBe(true)
    expect(writeText).toHaveBeenCalledWith('selected output')
  })

  it('copies on Ctrl+Shift+C only when a selection exists', () => {
    const writeText = vi.fn(async () => undefined)

    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<XtermView {...baseProps()} />)

    const terminal = mocks.instances[0]
    const handler = terminal.attachCustomKeyEventHandler.mock.calls[0][0] as (
      event: unknown
    ) => boolean
    const keyEvent = {
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      key: 'C',
    }

    // No selection: the key passes through.
    expect(handler(keyEvent)).toBe(true)
    expect(writeText).not.toHaveBeenCalled()

    terminal.getSelection.mockReturnValue('sel')

    // Selection: copied, key swallowed.
    expect(handler(keyEvent)).toBe(false)
    expect(writeText).toHaveBeenCalledWith('sel')
  })

  it('routes link activation through the validated openExternal bridge', () => {
    const openExternal = vi.fn(async () => ({ success: true }))

    Object.defineProperty(window, 'kryom', {
      configurable: true,
      writable: true,
      value: { openExternal },
    })

    render(<XtermView {...baseProps()} />)

    expect(mocks.linkHandlers).toHaveLength(1)
    mocks.linkHandlers[0]({}, 'https://example.com/docs')

    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs')
  })
})
