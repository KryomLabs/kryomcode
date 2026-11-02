// Shortcuts dialog tests (Phase D1): every documented bottom
// panel, terminal, and problem shortcut mirrors a wired binding.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ShortcutsDialog } from './ShortcutsDialog'

describe('ShortcutsDialog', () => {
  it('documents the bottom panel, terminal, and problems bindings', () => {
    render(<ShortcutsDialog open onClose={vi.fn()} />)

    expect(screen.getByText('Ctrl+J').closest('.shortcuts-row')?.textContent).toContain(
      'Toggle the bottom panel'
    )
    expect(
      screen.getByText('Ctrl+Shift+J').closest('.shortcuts-row')?.textContent
    ).toContain('Toggle the Problems tab')
    expect(screen.getByText('Ctrl+`').closest('.shortcuts-row')?.textContent).toContain(
      'Toggle the Terminal tab'
    )
    expect(
      screen.getByText('F8 / Shift+F8').closest('.shortcuts-row')?.textContent
    ).toContain('Next / previous problem')
  })

  it('closes on Escape and renders nothing when closed', () => {
    const onClose = vi.fn()
    const { rerender, container } = render(
      <ShortcutsDialog open onClose={onClose} />
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()

    rerender(<ShortcutsDialog open={false} onClose={onClose} />)
    expect(container.innerHTML).toBe('')
  })
})
