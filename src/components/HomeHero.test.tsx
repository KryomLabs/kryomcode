// Welcome hero tests: exactly one headline, no badge/brand/mode
// clutter, composer + toolbar wiring.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HomeHero, type HomeHeroProps } from './HomeHero'

function baseProps(overrides: Partial<HomeHeroProps> = {}): HomeHeroProps {
  return {
    mode: 'chat',
    draft: '',
    onDraftChange: vi.fn(),
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
    onSubmit: vi.fn(),
    projectName: null,
    onOpenProject: vi.fn(),
    activeFileName: '',
    onOpenActiveFile: null,
    onNewConversation: vi.fn(),
    ...overrides,
  }
}

describe('HomeHero', () => {
  it('renders exactly one headline and no brand clutter', () => {
    const { container } = render(<HomeHero {...baseProps()} />)

    expect(
      screen.getByText('What should we build & discover?')
    ).not.toBeNull()
    expect(container.querySelector('.hero-mark')).toBeNull()
    expect(container.querySelector('.hero-brand')).toBeNull()
    expect(container.querySelector('.hero-modes')).toBeNull()
    expect(screen.queryByText('KryomCode')).toBeNull()
  })

  it('shows the composer with mode placeholder and counter', () => {
    render(
      <HomeHero
        {...baseProps({
          mode: 'agent',
          placeholder: 'Describe what you want to build...',
          maxLength: 4000,
          draft: 'hello',
        })}
      />
    )

    expect(
      screen.getByPlaceholderText('Describe what you want to build...')
    ).not.toBeNull()
    expect(screen.getByText(/5 \/ 4,000/)).not.toBeNull()
  })

  it('routes toolbar actions through real handlers', () => {
    const props = baseProps({
      projectName: 'demo',
      activeFileName: 'main.ts',
      onOpenActiveFile: vi.fn(),
    })

    render(<HomeHero {...props} />)

    fireEvent.click(screen.getByRole('button', { name: /Project: demo/ }))
    expect(props.onOpenProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /File: main.ts/ }))
    expect(props.onOpenActiveFile).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    expect(props.onNewConversation).toHaveBeenCalledTimes(1)
  })

  it('offers Choose Project when none is open', () => {
    render(<HomeHero {...baseProps({ projectName: null })} />)

    expect(
      screen.getByRole('button', { name: 'Choose Project' })
    ).not.toBeNull()
    expect(screen.queryByText(/File:/)).toBeNull()
  })
})
