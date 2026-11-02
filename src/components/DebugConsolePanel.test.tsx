// Debug Console tests (Phase D1, decision D4): the tab renders
// only the shared log's 'debug' entries in order, with an honest
// empty state — and offers no Clear (the store belongs to Output).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DebugConsolePanel } from './DebugConsolePanel'
import { clearOutput, logOutput } from '../utils/output-log'

// jsdom has no scrollIntoView; the view calls it on entry changes.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  clearOutput()
})

describe('DebugConsolePanel', () => {
  it('shows an honest empty state with no debug entries', () => {
    logOutput('app', 'KryomCode started')

    render(<DebugConsolePanel />)

    expect(
      screen.getByText(/No debug output yet/)
    ).not.toBeNull()
    expect(screen.queryByText('KryomCode started')).toBeNull()
  })

  it('renders only debug-source entries in log order', () => {
    logOutput('app', 'first app event')
    logOutput('debug', 'npm run build → exit 0 · 0 problem(s)')
    logOutput('error', 'something failed')
    logOutput('debug', 'npm test → exit 1 · 2 problem(s)')

    const { container } = render(<DebugConsolePanel />)
    const lines = [...container.querySelectorAll('.output-message')].map(
      (node) => node.textContent
    )

    expect(lines).toEqual([
      'npm run build → exit 0 · 0 problem(s)',
      'npm test → exit 1 · 2 problem(s)',
    ])
    expect(screen.getByText(/Debug output \(2\)/)).not.toBeNull()
  })

  it('offers no Clear action over the shared log', () => {
    logOutput('debug', 'npm run build → exit 0 · 0 problem(s)')

    render(<DebugConsolePanel />)

    expect(
      screen.queryByRole('button', { name: /clear/i })
    ).toBeNull()
  })
})
