// ProblemsPanel tests (Phase D1): diagnostics render from real
// records with editor navigation, per-tab Clear resets through the
// existing null-result path, runs log one-line Debug Console
// summaries, and Stop uses the scoped diagnostics cancel channel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ProblemsPanel } from './ProblemsPanel'
import { clearOutput, getOutput } from '../utils/output-log'

const mockConfirm = vi.fn(async (..._args: unknown[]): Promise<boolean> => true)

vi.mock('./dialogs', () => ({
  useDialogs: () => ({ confirm: (...args: unknown[]) => mockConfirm(...args) }),
}))

function diagnosticsResult(overrides: Record<string, unknown> = {}) {
  return {
    success: false,
    exitCode: 1,
    timedOut: false,
    cancelled: false,
    outputLimited: false,
    warnings: [],
    output: 'tsc output',
    diagnostics: [
      {
        file: 'src/a.ts',
        line: 3,
        column: 5,
        severity: 'error',
        code: 'TS2322',
        message: 'Type mismatch.',
        source: 'tsc',
      },
      {
        file: 'src/b.ts',
        line: 1,
        column: 1,
        severity: 'warning',
        code: null,
        message: 'Unused variable.',
        source: 'tsc',
      },
    ],
    diagnosticsTruncated: false,
    durationMs: 120,
    ...overrides,
  } as unknown as KryomDiagnosticsResult
}

function setBridge(overrides: Record<string, unknown> = {}) {
  const runDiagnostics =
    overrides.runDiagnostics ??
    vi.fn(async () => diagnosticsResult())

  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: {
      classifyCommand: vi.fn(async () => ({ warnings: [] })),
      runDiagnostics,
      cancelDiagnostics: vi.fn(async () => ({ killed: 0 })),
      ...overrides,
    },
  })

  return window.kryom as unknown as Record<string, ReturnType<typeof vi.fn>>
}

function panelProps(overrides: Record<string, unknown> = {}) {
  return {
    workspaceRoot: 'C:/p',
    requireConfirmAll: false,
    scripts: ['build'],
    onOpenFileAtLine: vi.fn(),
    onStatus: vi.fn(),
    onResult: vi.fn(),
    onDiagnostics: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  clearOutput()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  vi.restoreAllMocks()
  mockConfirm.mockReset()
  mockConfirm.mockResolvedValue(true)
})

describe('ProblemsPanel', () => {
  it('renders diagnostics from the run record with editor navigation', async () => {
    setBridge()
    const props = panelProps()

    render(<ProblemsPanel {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByText(/2 problem\(s\)/)).not.toBeNull()
    })

    expect(screen.getByText('TS2322 Type mismatch.')).not.toBeNull()
    expect(screen.getByText('Unused variable.')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /src\/a\.ts:3:5/ }))
    expect(props.onOpenFileAtLine).toHaveBeenCalledWith('C:/p/src/a.ts', 3)
  })

  it('clears results through the null-result path', async () => {
    setBridge()
    const props = panelProps()

    render(<ProblemsPanel {...props} />)

    const clear = screen.getByRole('button', { name: 'Clear' })
    expect((clear as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByText(/2 problem\(s\)/)).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(props.onDiagnostics).toHaveBeenCalledWith(null)
    expect(
      screen.getByText(/Run a build or test command/)
    ).not.toBeNull()
  })

  it('logs a one-line debug summary per run, never the full output', async () => {
    setBridge()
    render(<ProblemsPanel {...panelProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByText(/2 problem\(s\)/)).not.toBeNull()
    })

    const debug = getOutput().filter((entry) => entry.source === 'debug')

    expect(debug).toHaveLength(1)
    expect(debug[0].message).toContain('npm run build')
    expect(debug[0].message).toContain('exit 1')
    expect(debug[0].message).toContain('2 problem(s)')
    expect(debug[0].message).not.toContain('tsc output')
  })

  it('stops through the scoped diagnostics cancel channel', async () => {
    let release!: (value: KryomDiagnosticsResult) => void
    const pending = new Promise<KryomDiagnosticsResult>((resolve) => {
      release = resolve
    })
    const bridge = setBridge({ runDiagnostics: vi.fn(() => pending) })

    render(<ProblemsPanel {...panelProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Stop' })).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(bridge.cancelDiagnostics).toHaveBeenCalledTimes(1)

    release(diagnosticsResult({ cancelled: true }))

    await waitFor(() => {
      expect(screen.getByText(/Cancelled/)).not.toBeNull()
    })
  })
})
