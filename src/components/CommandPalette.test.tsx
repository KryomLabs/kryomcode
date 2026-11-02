// Command palette tests: open/close, filter, keyboard run,
// Escape semantics, focus return, and duplicate collapsing.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  CommandPalette,
  dedupeCommands,
  type PaletteCommand,
} from './CommandPalette'

function commands(): PaletteCommand[] {
  return [
    { id: 'file.save', label: 'Save', hint: 'Ctrl+S', run: vi.fn() },
    { id: 'view.explorer', label: 'Explorer', hint: 'Sidebar', run: vi.fn() },
    { id: 'run.diagnostics', label: 'Run Diagnostics', run: vi.fn() },
  ]
}

describe('dedupeCommands', () => {
  it('collapses duplicate ids to the first registration', () => {
    const first = { id: 'a', label: 'First', run: vi.fn() }
    const out = dedupeCommands([
      first,
      { id: 'a', label: 'Second', run: vi.fn() },
      { id: 'b', label: 'Other', run: vi.fn() },
    ])

    expect(out.map((entry) => entry.label)).toEqual(['First', 'Other'])
  })
})

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    const { container } = render(
      <CommandPalette open={false} commands={commands()} onClose={vi.fn()} />
    )

    expect(container.innerHTML).toBe('')
  })

  it('lists commands and filters by query', () => {
    render(<CommandPalette open commands={commands()} onClose={vi.fn()} />)
    expect(screen.getByText('Save')).not.toBeNull()
    expect(screen.getByText('Run Diagnostics')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('Command name'), {
      target: { value: 'diag' },
    })

    expect(screen.queryByText('Save')).toBeNull()
    expect(screen.getByText('Run Diagnostics')).not.toBeNull()
  })

  it('runs the active command on Enter and closes', () => {
    const list = commands()
    const onClose = vi.fn()

    render(<CommandPalette open commands={list} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('Command name'), {
      target: { value: 'save' },
    })
    fireEvent.keyDown(screen.getByLabelText('Command name'), {
      key: 'Enter',
    })

    expect(onClose).toHaveBeenCalled()
    expect(list[0].run).toHaveBeenCalled()
    expect(list[1].run).not.toHaveBeenCalled()
  })

  it('moves with arrows and runs the highlighted row', () => {
    const list = commands()

    render(<CommandPalette open commands={list} onClose={vi.fn()} />)

    const input = screen.getByLabelText('Command name')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(list[1].run).toHaveBeenCalled()
    expect(list[0].run).not.toHaveBeenCalled()
  })

  it('closes on Escape without running anything', () => {
    const list = commands()
    const onClose = vi.fn()

    render(<CommandPalette open commands={list} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    expect(list[0].run).not.toHaveBeenCalled()
    expect(list[1].run).not.toHaveBeenCalled()
    expect(list[2].run).not.toHaveBeenCalled()
  })

  it('returns focus to the opener on close', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <div>
        <button type="button">Opener</button>
        <CommandPalette open={false} commands={commands()} onClose={onClose} />
      </div>
    )

    // Focus sits on the opener when the palette opens, so open
    // captures it and close restores it (jsdom focus is synchronous).
    screen.getByRole('button', { name: 'Opener' }).focus()
    rerender(
      <div>
        <button type="button">Opener</button>
        <CommandPalette open commands={commands()} onClose={onClose} />
      </div>
    )
    rerender(
      <div>
        <button type="button">Opener</button>
        <CommandPalette open={false} commands={commands()} onClose={onClose} />
      </div>
    )

    expect(document.activeElement?.textContent).toBe('Opener')
  })

  it('renders each id once even with duplicates', () => {
    const run = vi.fn()

    render(
      <CommandPalette
        open
        commands={[
          { id: 'dup', label: 'Duplicate', run },
          { id: 'dup', label: 'Duplicate', run },
        ]}
        onClose={vi.fn()}
      />
    )

    expect(screen.getAllByText('Duplicate').length).toBe(1)
  })
})
