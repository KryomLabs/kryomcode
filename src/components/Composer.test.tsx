// Unified composer tests: limits, validation, keyboard contract,
// send/stop gating, mode-aware controls.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Composer, type ComposerProps } from './Composer'

function baseProps(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    mode: 'chat',
    value: '',
    onChange: vi.fn(),
    placeholder: 'Ask anything about your code...',
    maxLength: 12000,
    model: 'muse-spark-1.3',
    modelOptions: [{ id: 'muse-spark-1.3', label: 'Muse Spark 1.3' }],
    onModelChange: vi.fn(),
    approvalRequired: true,
    onToggleApproval: vi.fn(),
    attachments: [],
    onAttach: vi.fn(),
    onRemoveAttachment: vi.fn(),
    attaching: false,
    attachError: '',
    running: false,
    onSubmit: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  }
}

describe('Composer', () => {
  it('edits multiline text and shows the mode placeholder', () => {
    const onChange = vi.fn()

    render(
      <Composer
        {...baseProps({ onChange, placeholder: 'What should we investigate?' })}
      />
    )

    const area = screen.getByPlaceholderText('What should we investigate?')

    fireEvent.change(area, { target: { value: 'line one\nline two' } })
    expect(onChange).toHaveBeenCalledWith('line one\nline two')
  })

  it('submits on Ctrl+Enter but never on plain Enter', () => {
    const onSubmit = vi.fn()

    render(<Composer {...baseProps({ value: 'hello', onSubmit })} />)

    const area = screen.getByLabelText('Chat prompt')

    fireEvent.keyDown(area, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()

    fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('blocks empty and over-limit submits with honest feedback', () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <Composer {...baseProps({ value: '   ', onSubmit, maxLength: 10 })} />
    )

    expect(
      (screen.getByRole('button', { name: 'Send prompt' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)

    rerender(
      <Composer
        {...baseProps({ value: '01234567890', onSubmit, maxLength: 10 })}
      />
    )

    expect(screen.getByRole('alert').textContent).toContain('Over the')
    expect(
      (screen.getByRole('button', { name: 'Send prompt' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts input at exactly the limit', () => {
    const onSubmit = vi.fn()

    render(
      <Composer
        {...baseProps({ value: '0123456789', onSubmit, maxLength: 10 })}
      />
    )

    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows Stop while running and prevents duplicate submits', () => {
    const onSubmit = vi.fn()
    const onStop = vi.fn()

    render(
      <Composer
        {...baseProps({ value: 'hello', running: true, onSubmit, onStop })}
      />
    )

    expect(screen.queryByRole('button', { name: 'Send prompt' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Stop request' }))
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows attach only in chat mode', () => {
    const { rerender } = render(<Composer {...baseProps({ mode: 'chat' })} />)
    expect(
      screen.getByRole('button', { name: 'Attach files' })
    ).not.toBeNull()

    rerender(<Composer {...baseProps({ mode: 'research' })} />)
    expect(screen.queryByRole('button', { name: 'Attach files' })).toBeNull()

    rerender(<Composer {...baseProps({ mode: 'agent' })} />)
    expect(screen.queryByRole('button', { name: 'Attach files' })).toBeNull()
  })

  it('toggles approval and switches models through real handlers', () => {
    const onToggleApproval = vi.fn()
    const onModelChange = vi.fn()

    render(
      <Composer
        {...baseProps({
          approvalRequired: false,
          onToggleApproval,
          onModelChange,
          modelOptions: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          model: 'a',
        })}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Toggle approval requirement' })
    )
    expect(onToggleApproval).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'b' } })
    expect(onModelChange).toHaveBeenCalledWith('b')
  })

  it('renders attachment chips with removal', () => {
    const onRemoveAttachment = vi.fn()

    render(
      <Composer
        {...baseProps({
          attachments: [
            {
              path: 'C:/p/main.ts',
              name: 'main.ts',
              chars: 120,
              truncated: false,
              excerpt: 'const x = 1',
            },
          ],
          onRemoveAttachment,
        })}
      />
    )

    expect(screen.getByText('main.ts')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove main.ts' }))
    expect(onRemoveAttachment).toHaveBeenCalledWith('C:/p/main.ts')
  })
})
