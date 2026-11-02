// MetaAIWorkspace scroll tests (Phase E): new agent output
// follows to the bottom while stuck, manual scroll-up preserves
// position across arrivals, a fresh session mount follows again,
// and long output with code blocks renders completely.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MetaAIWorkspace } from './MetaAIWorkspace'
import type { MetaSession } from '../state/meta-sessions'

vi.mock('./dialogs', () => ({
  useDialogs: () => ({ confirm: async () => true }),
}))

function sessionWith(messages: Array<{ role: 'user' | 'assistant'; content: string }>): MetaSession {
  return {
    version: 1,
    id: 'session-a',
    title: 'Agent session',
    root: 'C:/p',
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    messages: messages.map((message, index) => ({
      ...message,
      at: `2026-11-01T10:0${index}:00.000Z`,
    })),
    draft: '',
    model: 'muse-spark-1.3',
    providerId: 'meta',
    planId: null,
    researchSessionId: null,
    orchRunId: null,
    changedFiles: [],
    reviewState: 'none',
    statusNote: '',
    historyRefs: [],
  }
}

function workspaceProps(session: MetaSession) {
  return {
    session,
    siblings: [session],
    workspaceRoot: 'C:/p',
    activeFile: null,
    fileName: '',
    fileContent: '',
    fileDirty: false,
    contextEnabled: false,
    onStatus: vi.fn(),
    onUpdateSession: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenSession: vi.fn(),
    onFilesChanged: vi.fn(),
    onOpenProviderSettings: vi.fn(),
  }
}

function stubScrollTo() {
  const scrollTo = vi.fn()

  Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value: scrollTo,
  })

  return scrollTo
}

function messagesDiv(container: HTMLElement): HTMLElement {
  const element = container.querySelector('.meta-messages')

  if (!(element instanceof HTMLElement)) {
    throw new Error('expected a .meta-messages container')
  }

  return element
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  Reflect.deleteProperty(window.HTMLElement.prototype, 'scrollTo')
  vi.restoreAllMocks()
})

function setBridge() {
  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: {
      listProviderModels: vi.fn(async () => ({ models: [] })),
      getActiveResearch: vi.fn(async () => null),
      listResearch: vi.fn(async () => []),
      getAgentChatExcerpt: vi.fn(async () => ({ excerpt: '' })),
    },
  })
}

describe('MetaAIWorkspace scrolling', () => {
  it('follows new output to the bottom while stuck', () => {
    setBridge()
    const scrollTo = stubScrollTo()
    const first = sessionWith([{ role: 'user', content: 'Build it.' }])

    const { container, rerender } = render(
      <MetaAIWorkspace {...workspaceProps(first)} />
    )

    expect(messagesDiv(container)).not.toBeNull()
    scrollTo.mockClear()

    rerender(
      <MetaAIWorkspace
        {...workspaceProps(
          sessionWith([
            { role: 'user', content: 'Build it.' },
            { role: 'assistant', content: 'Done. See the plan.' },
          ])
        )}
      />
    )

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo.mock.calls[0][0]).toEqual({
      top: messagesDiv(container).scrollHeight,
    })
  })

  it('preserves manual scroll position across new arrivals', () => {
    setBridge()
    const scrollTo = stubScrollTo()
    const first = sessionWith([{ role: 'user', content: 'Build it.' }])

    const { container, rerender } = render(
      <MetaAIWorkspace {...workspaceProps(first)} />
    )
    const list = messagesDiv(container)

    // Simulate a scrolled-up reader: 1500px of room above the fold.
    Object.defineProperty(list, 'scrollHeight', {
      configurable: true,
      value: 2000,
    })
    Object.defineProperty(list, 'clientHeight', {
      configurable: true,
      value: 500,
    })
    Object.defineProperty(list, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 100,
    })
    fireEvent.scroll(list)
    scrollTo.mockClear()

    rerender(
      <MetaAIWorkspace
        {...workspaceProps(
          sessionWith([
            { role: 'user', content: 'Build it.' },
            { role: 'assistant', content: 'More output.' },
          ])
        )}
      />
    )

    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('follows again on a fresh session mount', () => {
    setBridge()
    const scrollTo = stubScrollTo()

    const { unmount } = render(
      <MetaAIWorkspace
        {...workspaceProps(sessionWith([{ role: 'user', content: 'A' }]))}
      />
    )

    unmount()
    scrollTo.mockClear()

    const { container } = render(
      <MetaAIWorkspace
        {...workspaceProps(
          sessionWith([
            { role: 'user', content: 'B' },
            { role: 'assistant', content: 'Fresh session output.' },
          ])
        )}
      />
    )

    expect(messagesDiv(container)).not.toBeNull()
    expect(scrollTo).toHaveBeenCalled()
  })

  it('renders long output with code blocks and copy actions', () => {
    setBridge()
    const longCode = `function example() {\n${'  console.log("line")\n'.repeat(60)}}`

    const { container } = render(
      <MetaAIWorkspace
        {...workspaceProps(
          sessionWith([
            { role: 'user', content: 'Show code.' },
            {
              role: 'assistant',
              content: `Here is the change:\n\n\`\`\`js\n${longCode}\n\`\`\``,
            },
          ])
        )}
      />
    )

    const codeblock = container.querySelector('.md-codeblock')

    expect(codeblock).not.toBeNull()

    const copyButton = codeblock?.querySelector(
      'button[title="Copy code to clipboard"]'
    )

    expect(copyButton?.textContent).toBe('Copy')
  })
})
