// TitleBar tests (Phase C): single brand identity, workbench
// file navigation with honest enabled states, layout controls.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TitleBar, type TitleBarProps } from './Chrome'

function baseProps(overrides: Partial<TitleBarProps> = {}): TitleBarProps {
  return {
    workspaceRoot: 'C:/demo/my-project',
    activeLabel: 'theme.ts',
    dirty: false,
    sidebarVisible: true,
    bottomOpen: true,
    asideOpen: false,
    canGoBack: false,
    canGoForward: false,
    onToggleSidebar: vi.fn(),
    onToggleBottom: vi.fn(),
    onToggleAside: vi.fn(),
    onOpenPalette: vi.fn(),
    onGoBack: vi.fn(),
    onGoForward: vi.fn(),
    ...overrides,
  }
}

describe('TitleBar', () => {
  it('shows the brand icon exactly once with no wordmark text', () => {
    const { container } = render(<TitleBar {...baseProps()} />)

    const logos = container.querySelectorAll('img.title-logo')
    expect(logos).toHaveLength(1)
    expect(screen.queryByText('KryomCode')).toBeNull()
    // Project context stays visible without repeating the brand.
    expect(screen.getByText(/my-project/)).not.toBeNull()
  })

  it('disables navigation when history has nowhere to go', () => {
    render(<TitleBar {...baseProps()} />)

    expect(
      (screen.getByRole('button', { name: 'Go back' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Go forward' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it('routes navigation through real handlers when enabled', () => {
    const props = baseProps({ canGoBack: true, canGoForward: true })

    render(<TitleBar {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(props.onGoBack).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Go forward' }))
    expect(props.onGoForward).toHaveBeenCalledTimes(1)
  })

  it('keeps the command center and layout toggles working', () => {
    const props = baseProps()

    render(<TitleBar {...props} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Open command palette' })
    )
    expect(props.onOpenPalette).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(props.onToggleSidebar).toHaveBeenCalledTimes(1)
  })
})
