// WelcomePage routing tests: the hero collects the first prompt per
// mode and hands it to the real Chat / Research / Agent pipelines,
// which call the desktop bridge. The bridge is a mock installed via
// defineProperty (no casts); everything else is the production path.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DialogProvider } from './dialogs'
import { WelcomePage, type DiscoveryMode } from './WelcomePage'

function renderWelcome(props: Parameters<typeof WelcomePage>[0]) {
  return render(
    <DialogProvider>
      <WelcomePage {...props} />
    </DialogProvider>
  )
}

function mockBridge() {
  const bridge = {
    restoreChat: vi.fn(async () => ({ restored: false, messages: [] })),
    saveChat: vi.fn(async () => ({ saved: true })),
    getAIStatus: vi.fn(async () => ({ modelKeyConfigured: true })),
    listProviderModels: vi.fn(async () => ({ models: [] })),
    askAI: vi.fn(async (_args: unknown) => ({
      answer: 'mock reply',
      model: 'mock-model',
    })),
    cancelAI: vi.fn(async () => ({})),
    getActiveResearch: vi.fn(async () => null),
    listResearch: vi.fn(async () => []),
    startResearch: vi.fn(async (_args: unknown) => DONE_SESSION),
    getResearchStatus: vi.fn(async () => DONE_SESSION),
    planAgentTask: vi.fn(async (_args: unknown) => DONE_PLAN),
    cancelAgentPlan: vi.fn(async () => ({ cancelled: true })),
    trackAgentPlan: vi.fn(async () => DONE_TRACKED_PLAN),
    setAgentPlanStep: vi.fn(async () => DONE_TRACKED_PLAN),
    listAgentPlans: vi.fn(async () => ({ plans: [], corrupt: [] })),
    listChatSessions: vi.fn(async () => ({ sessions: [], activeId: 'general' })),
  }

  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: bridge,
  })

  return bridge
}

const DONE_SESSION: KryomResearchSession = {
  id: 'r1',
  version: 1,
  objective: 'test topic',
  questions: [],
  queries: [],
  steps: [],
  sources: [],
  evidence: [],
  findings: [],
  decisions: [],
  brief: { version: 1, markdown: '', generatedAt: null, via: 'test' },
  implementationTasks: [],
  verification: [],
  errors: [],
  status: 'completed',
  statusDetail: 'done',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const DONE_PLAN: KryomAgentPlan = {
  model: 'mock-model',
  task: 'do the thing',
  contextFiles: [],
  contextExcluded: [],
  totalContextBytes: 0,
  edits: [],
  commands: [],
  notes: 'mock notes',
}

const DONE_TRACKED_PLAN: KryomTrackedPlan = {
  id: 'plan-1',
  projectName: 'test',
  title: 'Mock plan',
  objective: 'do the thing',
  expectedOutcome: '',
  risks: [],
  steps: [],
  context: null,
  status: 'active',
  verification: 'unverified',
  reports: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function baseProps(mode: DiscoveryMode) {
  return {
    mode,
    onModeChange: vi.fn(),
    workspaceRoot: null as string | null,
    defaultModel: 'muse-spark-1.3',
    activeFile: null,
    fileName: '',
    fileContent: '',
    fileDirty: false,
    contextEnabled: false,
    chatResearchId: null,
    onDetachChatResearch: () => undefined,
    onOpenInAgent: () => undefined,
    onResearchImplement: () => undefined,
    onResearchAsk: () => undefined,
    onStatus: vi.fn(),
    onOpenProviderSettings: () => undefined,
    onFilesChanged: () => undefined,
    confirmAllCommands: true,
    onToggleConfirmAll: () => undefined,
    onOpenProject: () => undefined,
  }
}

afterEach(() => {
  // Unmount first while the bridge double is still installed: the
  // restore/save effects settle against live mocks, and only then
  // are the globals torn down. Deleting first races still-mounted
  // effects and throws bridge-unavailable flakes.
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  vi.restoreAllMocks()
})

describe('WelcomePage', () => {
  it('shows one mode selector with exactly three modes', () => {
    mockBridge()
    renderWelcome(baseProps('chat'))

    const groups = screen.getAllByRole('group', { name: 'AI Workspace mode' })
    expect(groups).toHaveLength(1)

    expect(screen.getByRole('button', { name: 'Chat' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Research' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Agent' })).not.toBeNull()
  })

  it('shows the hero before the first submit and calls nothing', () => {
    const bridge = mockBridge()
    renderWelcome(baseProps('chat'))
    expect(screen.getByText('What should we build & discover?')).not.toBeNull()
    expect(screen.getByLabelText('Chat prompt')).not.toBeNull()
    expect(bridge.askAI).not.toHaveBeenCalled()
  })

  it('routes a chat hero submit to the AI backend', async () => {
    const bridge = mockBridge()
    renderWelcome(baseProps('chat'))
    fireEvent.change(screen.getByLabelText('Chat prompt'), {
      target: { value: 'explain closures' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(await screen.findByText('mock reply')).not.toBeNull()
    expect(bridge.askAI).toHaveBeenCalledTimes(1)
    expect(bridge.askAI.mock.calls[0][0]).toMatchObject({
      prompt: 'explain closures',
    })
    // The hero hands off to the experience.
    expect(screen.queryByText('What should we build & discover?')).toBeNull()
  })

  it('keeps per-mode progress: research still shows its hero', async () => {
    mockBridge()
    const props = baseProps('chat')
    const view = renderWelcome(props)
    fireEvent.change(screen.getByLabelText('Chat prompt'), {
      target: { value: 'hello' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(await screen.findByText('mock reply')).not.toBeNull()
    view.rerender(
      <DialogProvider>
        <WelcomePage {...props} mode="research" />
      </DialogProvider>
    )
    expect(screen.getByLabelText('Research prompt')).not.toBeNull()
  })

  it('preserves unsent drafts across mode switches', () => {
    mockBridge()
    const props = baseProps('chat')
    const view = renderWelcome(props)
    fireEvent.change(screen.getByLabelText('Chat prompt'), {
      target: { value: 'unsent draft' },
    })
    view.rerender(
      <DialogProvider>
        <WelcomePage {...props} mode="research" />
      </DialogProvider>
    )
    view.rerender(
      <DialogProvider>
        <WelcomePage {...props} mode="chat" />
      </DialogProvider>
    )
    expect((screen.getByLabelText('Chat prompt') as HTMLTextAreaElement).value).toBe(
      'unsent draft'
    )
  })

  it('refuses a research hero submit without a workspace', () => {
    const bridge = mockBridge()
    const props = baseProps('research')
    renderWelcome(props)
    const input = screen.getByLabelText('Research prompt')
    fireEvent.change(input, {
      target: { value: 'test topic' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(props.onStatus).toHaveBeenCalledWith('Open a workspace to run research')
    expect(bridge.startResearch).not.toHaveBeenCalled()
    // The hero stays up with the typed text intact.
    expect(screen.getByLabelText('Research prompt')).not.toBeNull()
    expect((input as HTMLTextAreaElement).value).toBe('test topic')
  })

  it('routes a research hero submit to the research backend', async () => {
    const bridge = mockBridge()
    const props = { ...baseProps('research'), workspaceRoot: '/test' }
    renderWelcome(props)
    fireEvent.change(screen.getByLabelText('Research prompt'), {
      target: { value: 'test topic' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(await screen.findByText(/COMPLETED/)).not.toBeNull()
    expect(bridge.startResearch).toHaveBeenCalledTimes(1)
    expect(bridge.startResearch.mock.calls[0][0]).toMatchObject({
      objective: 'test topic',
    })
  })

  it('refuses an agent hero submit without a workspace', () => {
    const bridge = mockBridge()
    const props = baseProps('agent')
    renderWelcome(props)
    fireEvent.change(screen.getByLabelText('Agent prompt'), {
      target: { value: 'do the thing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    expect(props.onStatus).toHaveBeenCalledWith('Open a workspace to run the agent')
    expect(bridge.planAgentTask).not.toHaveBeenCalled()
  })

  it('routes an agent hero submit to the agent backend', async () => {
    const bridge = mockBridge()
    const props = { ...baseProps('agent'), workspaceRoot: '/test' }
    renderWelcome(props)
    fireEvent.change(screen.getByLabelText('Agent prompt'), {
      target: { value: 'do the thing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send prompt' }))
    // Planning awaits the key pre-flight first, so the call lands async.
    await waitFor(() =>
      expect(bridge.planAgentTask).toHaveBeenCalledTimes(1)
    )
    expect(bridge.planAgentTask.mock.calls[0][0]).toMatchObject({
      task: 'do the thing',
    })
    // The hero hands off to the agent experience.
    expect(screen.queryByText('What should we build & discover?')).toBeNull()
  })

  it('consumes an external prompt like a hero submit', async () => {
    const bridge = mockBridge()
    const onInitialPromptConsumed = vi.fn()
    renderWelcome({
      ...baseProps('chat'),
      initialPrompt: { text: 'Explain this error', nonce: 7 },
      onInitialPromptConsumed,
    })
    expect(await screen.findByText('mock reply')).not.toBeNull()
    expect(bridge.askAI).toHaveBeenCalledTimes(1)
    expect(bridge.askAI.mock.calls[0][0]).toMatchObject({
      prompt: 'Explain this error',
    })
    expect(onInitialPromptConsumed).toHaveBeenCalledTimes(1)
    // The hero hands off to the experience.
    expect(screen.queryByText('What should we build & discover?')).toBeNull()
  })
})
