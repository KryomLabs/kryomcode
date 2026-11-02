// TerminalPanel input tests: the command input starts empty (no
// pre-filled value can execute accidentally) and the Running line
// only names user-terminal runs, never diagnostics or agent runs.
// Phase D2: the xterm renderer is default with a <pre> fallback, and
// focus requests land on the command input.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  TerminalPanelView,
  type TerminalController,
  type TerminalPanelViewProps,
} from './TerminalPanel'

// The D2 tests mount the real XtermView against mocked xterm modules
// (jsdom has no canvas/DOM terminal APIs).
vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    options: {},
    open: vi.fn(),
    loadAddon: vi.fn(),
    write: vi.fn(),
    writeln: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
    scrollToBottom: vi.fn(),
    getSelection: vi.fn(() => ''),
    onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
    attachCustomKeyEventHandler: vi.fn(),
  })),
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({ dispose: vi.fn() })),
}))

// jsdom has no scrollIntoView; the view calls it on entry changes.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

function fakeController(
  overrides: Partial<TerminalController> = {}
): TerminalController {
  return {
    command: '',
    setCommand: vi.fn(),
    entries: [],
    running: false,
    runningList: [],
    error: '',
    runTerminalCommand: vi.fn(),
    recallCommand: vi.fn(),
    cancel: vi.fn(),
    refreshStatus: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  }
}

function renderView(
  controller: TerminalController,
  viewProps: Partial<TerminalPanelViewProps> = {}
) {
  return render(
    <TerminalPanelView
      controller={controller}
      workspaceRoot="/tmp/demo"
      {...viewProps}
    />
  )
}

function completedController(): TerminalController {
  return fakeController({
    entries: [
      {
        id: 1,
        command: 'npm test',
        result: {
          exitCode: 0,
          output: 'ok',
          timedOut: false,
          cancelled: false,
          outputLimited: false,
          warnings: [],
        },
      },
    ],
  })
}

describe('TerminalPanelView', () => {
  it('starts with an empty command input', () => {
    renderView(fakeController())

    const input = screen.getByLabelText(
      'Terminal command'
    ) as HTMLInputElement

    expect(input.value).toBe('')
    expect(input.placeholder).toContain('Enter a command')
  })

  it('shows only user-terminal runs in the Running line', () => {
    renderView(
      fakeController({
        runningList: [
          {
            id: 'proc-1',
            command: 'npm test',
            startedAt: 1,
            origin: 'diagnostics',
          },
          {
            id: 'proc-2',
            command: 'npm run build',
            startedAt: 2,
            origin: 'user-terminal',
          },
        ],
      })
    )

    const line = screen.getByText(/Running:/).textContent ?? ''

    expect(line).toContain('npm run build')
    expect(line).not.toContain('npm test')
  })

  it('hides the Running line when only foreign runs exist', () => {
    renderView(
      fakeController({
        runningList: [
          {
            id: 'proc-1',
            command: 'npm test',
            startedAt: 1,
            origin: 'diagnostics',
          },
        ],
      })
    )

    expect(screen.queryByText(/Running:/)).toBeNull()
  })

  it('renders completed entries through xterm by default', () => {
    const { container } = renderView(completedController())

    expect(container.querySelector('.xterm-container')).not.toBeNull()
    expect(container.querySelector('pre.terminal-output')).toBeNull()
  })

  it('keeps the legacy <pre> fallback when the setting selects it', () => {
    const { container } = renderView(completedController(), {
      renderer: 'pre',
    })

    expect(container.querySelector('.xterm-container')).toBeNull()

    const output = container.querySelector('pre.terminal-output')

    expect(output).not.toBeNull()
    expect(output?.textContent).toContain('ok')
  })

  it('discloses the run working directory', () => {
    renderView(fakeController())

    expect(screen.getByText(/Runs in \/tmp\/demo/)).not.toBeNull()
  })

  it('moves DOM focus to the command input on focus requests', () => {
    renderView(fakeController(), { focusRequest: { nonce: 1 } })

    const input = screen.getByLabelText('Terminal command')

    expect(document.activeElement).toBe(input)
  })
})
