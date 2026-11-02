// TasksPanel tests (Phase D1): plans, orchestration runs, and
// quality reports render from real list records with refresh and
// honest empty states.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TasksPanel } from './TasksPanel'

function setBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    listAgentPlans: vi.fn(async () => ({
      plans: [
        {
          id: 'plan-1',
          title: 'Ship search',
          objective: 'Add project search',
          status: 'active',
          verification: 'partial',
          steps: [
            { state: 'verified' },
            { state: 'in_progress' },
          ],
          reports: [
            {
              id: 'rep-1',
              check: 'npm test',
              conclusion: 'needs_attention',
              origin: 'agent',
              execution: { exitCode: 1 },
            },
          ],
        },
      ],
      corrupt: [],
    })),
    listOrchRuns: vi.fn(async () => ({
      runs: [
        {
          id: 'or-1',
          planTitle: 'Ship search',
          state: 'active',
          tasks: [{ state: 'merged' }, { state: 'proposed' }],
        },
      ],
      corrupt: [],
    })),
    listQualityReports: vi.fn(async () => ({
      reports: [
        {
          id: 'qr-1',
          createdAt: '2026-10-30T10:00:00.000Z',
          verdict: { verdict: 'pass' },
          scopeFiles: 4,
        },
      ],
      total: 1,
    })),
    ...overrides,
  }

  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: bridge,
  })

  return bridge
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  vi.restoreAllMocks()
})

describe('TasksPanel', () => {
  it('renders plans, orchestration, and quality from list records', async () => {
    setBridge()

    render(
      <TasksPanel
        workspaceRoot="C:/p"
        onStatus={vi.fn()}
        onOpenFile={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText(/1 plan\(s\) · 1 orchestration run\(s\) · 1 quality report\(s\)/)
      ).not.toBeNull()
    })

    expect(screen.getByText(/Ship search · active · partial/)).not.toBeNull()
    expect(screen.getByText(/1\/2 verified/)).not.toBeNull()
    expect(screen.getByText(/or-1 · active/)).not.toBeNull()
    expect(screen.getByText(/1\/2 merged/)).not.toBeNull()
    expect(screen.getByText(/qr-1 · pass/)).not.toBeNull()
    expect(screen.getByText(/npm test: needs attention/)).not.toBeNull()
  })

  it('refreshes the lists on demand', async () => {
    const bridge = setBridge()

    render(
      <TasksPanel
        workspaceRoot="C:/p"
        onStatus={vi.fn()}
        onOpenFile={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(bridge.listAgentPlans).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => {
      expect(bridge.listAgentPlans).toHaveBeenCalledTimes(2)
    })
  })

  it('shows honest empty states without a project and without records', async () => {
    const { rerender } = render(
      <TasksPanel
        workspaceRoot={null}
        onStatus={vi.fn()}
        onOpenFile={vi.fn()}
      />
    )

    expect(screen.getByText(/Open a project to see/)).not.toBeNull()

    setBridge({
      listAgentPlans: vi.fn(async () => ({ plans: [], corrupt: [] })),
      listOrchRuns: vi.fn(async () => ({ runs: [], corrupt: [] })),
      listQualityReports: vi.fn(async () => ({ reports: [], total: 0 })),
    })

    rerender(
      <TasksPanel
        workspaceRoot="C:/p"
        onStatus={vi.fn()}
        onOpenFile={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('No tracked plans yet.')).not.toBeNull()
    })

    expect(screen.getByText('No orchestration runs yet.')).not.toBeNull()
    expect(screen.getByText('No quality reports yet.')).not.toBeNull()
  })
})
