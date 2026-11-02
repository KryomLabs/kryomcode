// Phase A shell view tests: hub routing, history lists, run/debug
// entry, aside visibility, and registry membership/areas.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AiWorkspaceHub } from './AiWorkspaceHub'
import { HistoryPanel } from './HistoryPanel'
import { RunDebugSidebar } from './RunDebugSidebar'
import { AsidePanel } from './AsidePanel'
import {
  __resetActivityRegistry,
  getActivity,
  hasActivity,
  listActivities,
  registerBuiltinActivities,
} from './activity-registry'

describe('AiWorkspaceHub', () => {
  it('routes every entry to its real handler', () => {
    const handlers = {
      onNewThread: vi.fn(),
      onOpenChat: vi.fn(),
      onOpenResearch: vi.fn(),
      onOpenAgentRuns: vi.fn(),
      onOpenIntel: vi.fn(),
      onOpenPlatform: vi.fn(),
    }

    render(<AiWorkspaceHub {...handlers} />)

    const pairs: Array<[string, keyof typeof handlers]> = [
      ['New AI thread', 'onNewThread'],
      ['Open Chat', 'onOpenChat'],
      ['Open Research', 'onOpenResearch'],
      ['Open Agent Runs', 'onOpenAgentRuns'],
      ['Open Intelligence', 'onOpenIntel'],
      ['Open Platform', 'onOpenPlatform'],
    ]

    for (const [label, key] of pairs) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))
      expect(handlers[key]).toHaveBeenCalledTimes(1)
    }
  })
})

describe('HistoryPanel', () => {
  const threads = [
    {
      id: 'meta:meta-session:ms-1',
      mode: 'meta' as const,
      source: 'meta-session' as const,
      ref: 'ms-1',
      root: 'C:/p',
      title: 'Fix login',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'chat:chat-store:c1',
      mode: 'chat' as const,
      source: 'chat-store' as const,
      ref: 'c1',
      root: 'C:/p',
      title: 'Hello',
      updatedAt: '2026-01-03T00:00:00.000Z',
    },
  ]

  function historyProps(overrides = {}) {
    return {
      threads,
      recent: ['C:/p'],
      corrupt: false,
      filter: 'all' as const,
      onFilterChange: vi.fn(),
      onOpenThread: vi.fn(),
      onNewThread: vi.fn(),
      onOpenRecent: vi.fn(),
      ...overrides,
    }
  }

  it('opens threads and recents through shell handlers', () => {
    const props = historyProps()

    render(<HistoryPanel {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /Fix login/ }))
    expect(props.onOpenThread).toHaveBeenCalledWith(threads[0])

    fireEvent.click(
      screen.getByRole('button', { name: /New Meta AI thread/ })
    )
    expect(props.onNewThread).toHaveBeenCalledWith('meta')

    fireEvent.click(screen.getByTitle('C:/p'))
    expect(props.onOpenRecent).toHaveBeenCalledWith('C:/p')
  })

  it('filters threads by mode', () => {
    const props = historyProps({ filter: 'chat' as const })

    render(<HistoryPanel {...props} />)

    expect(screen.queryByRole('button', { name: /Fix login/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: /Hello/ })
    ).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    expect(props.onFilterChange).toHaveBeenCalledWith('research')
  })

  it('shows honest empty states and corruption notice', () => {
    const { rerender } = render(
      <HistoryPanel {...historyProps({ threads: [], recent: [] })} />
    )

    expect(screen.getByText('No threads yet.')).not.toBeNull()
    expect(screen.getByText('No recent projects.')).not.toBeNull()

    rerender(<HistoryPanel {...historyProps({ threads: [], corrupt: true })} />)
    expect(screen.getByRole('alert').textContent).toContain('Nothing was deleted')
  })
})

describe('RunDebugSidebar', () => {
  it('routes run, problems, and terminal through handlers', () => {
    const onRunDiagnostics = vi.fn()
    const onOpenProblems = vi.fn()
    const onOpenTerminal = vi.fn()

    render(
      <RunDebugSidebar
        workspaceRoot="C:/p"
        diagnostics={{ count: 2, success: false }}
        onRunDiagnostics={onRunDiagnostics}
        onOpenProblems={onOpenProblems}
        onOpenTerminal={onOpenTerminal}
      />
    )

    expect(screen.getByText('2 problems found.')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Run Diagnostics/ }))
    expect(onRunDiagnostics).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Open Problems/ }))
    expect(onOpenProblems).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Open Terminal/ }))
    expect(onOpenTerminal).toHaveBeenCalled()
  })

  it('routes to the Debug Console only when the shell provides it', () => {
    const onOpenDebugConsole = vi.fn()
    const { rerender } = render(
      <RunDebugSidebar
        workspaceRoot="C:/p"
        diagnostics={null}
        onRunDiagnostics={vi.fn()}
        onOpenProblems={vi.fn()}
        onOpenTerminal={vi.fn()}
      />
    )

    expect(
      screen.queryByRole('button', { name: /Open Debug Console/ })
    ).toBeNull()

    rerender(
      <RunDebugSidebar
        workspaceRoot="C:/p"
        diagnostics={null}
        onRunDiagnostics={vi.fn()}
        onOpenProblems={vi.fn()}
        onOpenTerminal={vi.fn()}
        onOpenDebugConsole={onOpenDebugConsole}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: /Open Debug Console/ })
    )
    expect(onOpenDebugConsole).toHaveBeenCalled()
  })

  it('asks for a project when none is open', () => {
    render(
      <RunDebugSidebar
        workspaceRoot={null}
        diagnostics={null}
        onRunDiagnostics={vi.fn()}
        onOpenProblems={vi.fn()}
        onOpenTerminal={vi.fn()}
      />
    )

    expect(
      screen.getByText('Open a project folder to run diagnostics.')
    ).not.toBeNull()
  })
})

describe('AsidePanel', () => {
  it('hides content while closed and closes on demand', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <AsidePanel open width={360} title="AI WORKSPACE" onClose={onClose}>
        <span>body</span>
      </AsidePanel>
    )

    expect(screen.getByText('body')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close auxiliary panel' }))
    expect(onClose).toHaveBeenCalled()

    rerender(
      <AsidePanel open={false} width={360} title="AI WORKSPACE" onClose={onClose}>
        <span>body</span>
      </AsidePanel>
    )

    expect(
      (screen.getByText('body').closest('aside') as HTMLElement).hidden
    ).toBe(true)
  })
})

describe('activity registry (Phase A membership)', () => {
  it('registers exactly the eight shell destinations with areas', () => {
    __resetActivityRegistry()
    registerBuiltinActivities()

    const entries = listActivities()

    expect(entries.map((entry) => entry.id)).toEqual([
      'explorer',
      'search',
      'git',
      'run',
      'extensions',
      'ai-workspace',
      'knowledge',
      'history',
    ])
    expect(getActivity('git')?.area).toBe('sidebar')
    expect(getActivity('run')?.area).toBe('sidebar')
    expect(getActivity('ai-workspace')?.area).toBe('aside')
    expect(hasActivity('intel')).toBe(false)
    expect(hasActivity('ai')).toBe(false)

    __resetActivityRegistry()
  })
})
