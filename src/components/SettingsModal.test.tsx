// SettingsModal terminal rows (Phase D2): the terminal font
// stepper (11–16) and the xterm/<pre> renderer switch render only
// when the shell provides them, and call back with stepped values.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsModal } from './SettingsModal'

function modalProps(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    initial: {
      defaultModel: 'muse-spark-1.3',
      aiContextEnabled: true,
      confirmAllCommands: false,
      panelLeftWidth: 260,
      panelRightWidth: 360,
      panelBottomHeight: 264,
    },
    onClose: vi.fn(),
    onSaved: vi.fn(),
    onStatus: vi.fn(),
    fontSize: 14,
    onFontSizeChange: vi.fn(),
    theme: 'dark' as const,
    onThemeChange: vi.fn(),
    autoSave: false,
    onToggleAutoSave: vi.fn(),
    panelLeftWidth: 260,
    panelBottomHeight: 264,
    onResetPanels: vi.fn(),
    ...overrides,
  }
}

describe('SettingsModal terminal rows', () => {
  it('hides the terminal rows without the optional props', () => {
    render(<SettingsModal {...modalProps()} />)

    expect(screen.queryByText('Terminal font size')).toBeNull()
    expect(screen.queryByText('Terminal output')).toBeNull()
  })

  it('steps the terminal font size within 11–16', () => {
    const onTerminalFontSizeChange = vi.fn()
    const { rerender } = render(
      <SettingsModal
        {...modalProps({ terminalFontSize: 13, onTerminalFontSizeChange })}
      />
    )

    fireEvent.click(screen.getByLabelText('Increase terminal font size'))
    expect(onTerminalFontSizeChange).toHaveBeenCalledWith(14)

    fireEvent.click(screen.getByLabelText('Decrease terminal font size'))
    expect(onTerminalFontSizeChange).toHaveBeenCalledWith(12)

    rerender(
      <SettingsModal
        {...modalProps({ terminalFontSize: 11, onTerminalFontSizeChange })}
      />
    )
    expect(
      (screen.getByLabelText('Decrease terminal font size') as HTMLButtonElement)
        .disabled
    ).toBe(true)

    rerender(
      <SettingsModal
        {...modalProps({ terminalFontSize: 16, onTerminalFontSizeChange })}
      />
    )
    expect(
      (screen.getByLabelText('Increase terminal font size') as HTMLButtonElement)
        .disabled
    ).toBe(true)
  })

  it('switches the terminal renderer with pressed states', () => {
    const onTerminalRendererChange = vi.fn()

    render(
      <SettingsModal
        {...modalProps({
          terminalRenderer: 'xterm',
          onTerminalRendererChange,
        })}
      />
    )

    const terminal = screen.getByRole('button', { name: 'Terminal' })
    const plain = screen.getByRole('button', { name: 'Plain text' })

    expect(terminal.getAttribute('aria-pressed')).toBe('true')
    expect(plain.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(plain)
    expect(onTerminalRendererChange).toHaveBeenCalledWith('pre')
  })
})
