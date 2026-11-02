// OutputPanel tests (Phase D1): source filtering is view-only
// over the real shared log, and Clear keeps clearing the whole log.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OutputPanel } from './OutputPanel'
import { clearOutput, getOutput, logOutput } from '../utils/output-log'

// jsdom has no scrollIntoView; the view calls it on entry changes.
window.HTMLElement.prototype.scrollIntoView = vi.fn()

beforeEach(() => {
  clearOutput()
})

function seed() {
  logOutput('app', 'Project opened')
  logOutput('error', 'Save failed')
  logOutput('debug', 'npm test → exit 1 · 2 problem(s)')
}

describe('OutputPanel', () => {
  it('renders every entry in log order by default', () => {
    seed()

    const { container } = render(<OutputPanel />)
    const lines = [...container.querySelectorAll('.output-message')].map(
      (node) => node.textContent
    )

    expect(lines).toEqual([
      'Project opened',
      'Save failed',
      'npm test → exit 1 · 2 problem(s)',
    ])
    expect(screen.getByText(/Application events \(3\/3\)/)).not.toBeNull()
  })

  it('filters by source without touching the shared log', () => {
    seed()

    render(<OutputPanel />)

    fireEvent.change(screen.getByLabelText('Filter output by source'), {
      target: { value: 'error' },
    })

    expect(screen.getByText('Save failed')).not.toBeNull()
    expect(screen.queryByText('Project opened')).toBeNull()
    expect(screen.getByText(/Application events \(1\/3\)/)).not.toBeNull()
    expect(getOutput()).toHaveLength(3)
  })

  it('clears the whole shared log', () => {
    seed()

    render(<OutputPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(getOutput()).toHaveLength(0)
    expect(screen.getByText(/No events yet/)).not.toBeNull()
  })
})
