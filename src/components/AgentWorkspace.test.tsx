// AgentWorkspace tests: composer, approvals, timeline, changes,
// verification, and result rendering against a mocked bridge. The
// backend owns behavior; these assert the UI shows backend records
// truthfully and cites server-issued approval ids.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AgentWorkspace } from './AgentWorkspace'

const CATALOG_MODELS = [
  {
    providerId: 'meta',
    providerName: 'Meta AI',
    modelId: 'muse-spark-1.3',
    displayName: 'Muse Spark 1.3',
    capabilities: { text: true, streaming: false, vision: false, tools: false },
    contextWindow: null,
    tokenUsage: false,
    isDefault: true,
  },
]

function makeRun(overrides: Record<string, unknown> = {}): KryomAgentRun {
  return {
    version: 1,
    id: 'ar-test-run',
    task: 'Fix the add function.',
    model: 'muse-spark-1.3',
    researchMode: 'auto',
    includeChat: false,
    contextPaths: [],
    state: 'waiting_for_approval',
    prevState: null,
    createdAt: '2026-10-31T00:00:00.000Z',
    updatedAt: '2026-10-31T00:01:00.000Z',
    startedAt: '2026-10-31T00:00:00.000Z',
    finishedAt: null,
    deadline: Date.now() + 100000,
    cancelRequested: false,
    pauseRequested: false,
    understanding: null,
    analysis: null,
    researchSessionId: null,
    research: null,
    planId: 'plan-1',
    planIds: ['plan-1'],
    revisions: 0,
    decomposition: {
      objective: 'Fix calc.',
      expectedOutcome: 'Calc adds correctly.',
      risks: [
        { severity: 'low', explanation: 'Tiny change.', mitigation: 'Run tests.' },
      ],
      assumptions: [],
      subtasks: [
        {
          index: 0,
          title: 'Fix the add function',
          description: 'Correct the arithmetic.',
          files: [{ path: 'src/calc.js', exists: true }],
          dependsOn: [],
          verification: 'npm test',
          completion: 'add() returns the sum.',
        },
      ],
    },
    executionOrder: [0],
    proposals: {
      0: {
        subtask: 0,
        title: 'Fix the add function',
        editCount: 1,
        droppedOutOfScope: 0,
        files: [
          { path: '/proj/src/calc.js', action: 'modify', contentLength: 60 },
        ],
        commands: [],
        notes: 'swap the operator',
        proposedAt: '2026-10-31T00:01:00.000Z',
      },
    },
    proposalFiles: ['/proj/src/calc.js'],
    changeSet: null,
    pendingApproval: {
      id: 'ap-plan-1',
      kind: 'plan',
      createdAt: '2026-10-31T00:01:00.000Z',
      payload: {
        planId: 'plan-1',
        objective: 'Fix calc.',
        expectedOutcome: 'Calc adds correctly.',
        risks: [
          { severity: 'low', explanation: 'Tiny change.', mitigation: 'Run tests.' },
        ],
        subtasks: [
          {
            index: 0,
            title: 'Fix the add function',
            files: [{ path: 'src/calc.js', exists: true }],
            dependsOn: [],
            verification: 'npm test',
            completion: 'add() returns the sum.',
            editCount: 1,
          },
        ],
        editCount: 1,
        files: [{ path: '/proj/src/calc.js', action: 'modify' }],
        verification: [
          {
            subtask: 0,
            title: 'Fix the add function',
            stated: 'npm test',
            command: 'npm test',
            review: { verdict: 'run', reason: 'Project script execution.', warnings: [] },
          },
        ],
        changeSet: null,
      },
    },
    approvedCommands: [],
    repair: null,
    subtasks: [
      {
        index: 0,
        title: 'Fix the add function',
        state: 'pending',
        files: [{ path: 'src/calc.js', exists: true }],
        verification: 'npm test',
        verificationNote: '',
        check: null,
        conclusion: null,
        runId: null,
        checkpointId: null,
        error: '',
        attempts: 0,
      },
    ],
    appliedFiles: [],
    checks: [],
    events: [
      { seq: 1, at: '2026-10-31T00:00:00.000Z', kind: 'run-started', phase: 'analyzing', message: 'Agent run started.', data: null },
      { seq: 2, at: '2026-10-31T00:01:00.000Z', kind: 'approval-requested', phase: 'waiting_for_approval', message: 'Plan proposed: 1 edit(s). Awaiting approval.', data: null },
    ],
    summary: null,
    memoryId: null,
    error: null,
    live: false,
    interrupted: false,
    ...overrides,
  } as KryomAgentRun
}

function mockBridge() {
  const bridge = {
    listProviderModels: vi.fn(async () => ({ models: CATALOG_MODELS })),
    listAgentRuns: vi.fn(
      async (): Promise<{ runs: KryomAgentRunListItem[]; corrupt: string[] }> => ({
        runs: [],
        corrupt: [],
      })
    ),
    getAgentRun: vi.fn(async (): Promise<KryomAgentRun> => makeRun()),
    startAgentRun: vi.fn(
      async (input: { task: string }): Promise<KryomAgentRun> =>
        makeRun({ state: 'analyzing', task: input.task, pendingApproval: null })
    ),
    cancelAgentRun: vi.fn(async (): Promise<KryomAgentRun> => makeRun({ state: 'cancelled' })),
    pauseAgentRun: vi.fn(async (): Promise<KryomAgentRun> => makeRun({ state: 'paused' })),
    resumeAgentRun: vi.fn(async (): Promise<KryomAgentRun> => makeRun({ state: 'executing' })),
    approveAgentRun: vi.fn(async (): Promise<KryomAgentRun> =>
      makeRun({ state: 'executing', pendingApproval: null })
    ),
    rejectAgentRun: vi.fn(async (): Promise<KryomAgentRun> => makeRun({ state: 'cancelled' })),
    getAgentRunProposal: vi.fn(async (): Promise<{
      runId: string
      subtask: number
      proposal: KryomAgentRunProposal
    }> => ({
      runId: 'ar-test-run',
      subtask: 0,
      proposal: {
        subtask: 0,
        title: 'Fix the add function',
        edits: [
          {
            index: 0,
            path: '/proj/src/calc.js',
            action: 'modify',
            content: 'function add(a, b) { return a + b }\n',
            contentLength: 38,
            preview: 'function add',
            reason: 'Fix subtraction.',
          },
        ],
        droppedOutOfScope: [],
        commands: [],
        notes: 'swap the operator',
        expectedOutcome: 'fixed',
        risks: [],
        model: 'muse-spark-1.3',
        proposedAt: '2026-10-31T00:01:00.000Z',
      },
    })),
    readFileMeta: vi.fn(async (filePath: string) => ({
      path: filePath,
      content: 'function add(a, b) { return a - b }\n',
      digest: 'x',
      bytes: 38,
    })),
    searchFiles: vi.fn(async () => ({ matches: [] })),
  }

  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: bridge,
  })

  return bridge
}

function baseProps() {
  return {
    workspaceRoot: '/proj' as string | null,
    defaultModel: 'muse-spark-1.3',
    activeFile: null as string | null,
    onStatus: vi.fn(),
    onOpenFile: vi.fn(),
    onFilesChanged: vi.fn(),
  }
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('AgentWorkspace', () => {
  it('renders the composer and an empty timeline when no runs exist', async () => {
    mockBridge()
    render(<AgentWorkspace {...baseProps()} />)

    expect(screen.getByLabelText('Task')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeNull()
    expect(
      await screen.findByText('No runs yet. Describe a task to start the agent.')
    ).not.toBeNull()
  })

  it('starts a run from the composer and clears the task', async () => {
    const bridge = mockBridge()
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(screen.getByLabelText('Task'), {
      target: { value: 'Fix the add function.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(bridge.startAgentRun).toHaveBeenCalledTimes(1))
    expect(bridge.startAgentRun).toHaveBeenCalledWith({
      task: 'Fix the add function.',
      model: 'muse-spark-1.3',
      contextPaths: [],
      researchMode: 'auto',
      includeChat: false,
    })
    expect((screen.queryByLabelText('Task') as HTMLTextAreaElement | null)?.value ?? '').toBe('')
  })

  it('sends with Ctrl+Enter', async () => {
    const bridge = mockBridge()
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(screen.getByLabelText('Task'), {
      target: { value: 'Fix it.' },
    })
    fireEvent.keyDown(screen.getByLabelText('Task'), {
      key: 'Enter',
      ctrlKey: true,
    })

    await waitFor(() => expect(bridge.startAgentRun).toHaveBeenCalledTimes(1))
  })

  it('shows the plan approval with steps and cites the approval id', async () => {
    const bridge = mockBridge()
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'waiting_for_approval',
          live: false,
          interrupted: false,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:01:00.000Z',
          finishedAt: null,
          subtasks: [{ index: 0, title: 'Fix the add function', state: 'pending' }],
          checkCounts: { passed: 0, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 2,
          error: null,
        },
      ],
      corrupt: [],
    })
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    expect(await screen.findByText('Plan approval requested')).not.toBeNull()
    expect(screen.getByText('Fix the add function')).not.toBeNull()
    expect(screen.getByText(/1 edit\(s\) across 1 file\(s\)/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(bridge.approveAgentRun).toHaveBeenCalledTimes(1))
    expect(bridge.approveAgentRun).toHaveBeenCalledWith({
      runId: 'ar-test-run',
      approvalId: 'ap-plan-1',
    })
  })

  it('requests plan changes with a reason and rejects on cancel', async () => {
    const bridge = mockBridge()
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'waiting_for_approval',
          live: false,
          interrupted: false,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:01:00.000Z',
          finishedAt: null,
          subtasks: [],
          checkCounts: { passed: 0, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 2,
          error: null,
        },
      ],
      corrupt: [],
    })
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    expect(await screen.findByText('Plan approval requested')).not.toBeNull()

    // Request-changes stays disabled until a note names the revision.
    expect(
      (screen.getByRole('button', { name: 'Request changes' }) as HTMLButtonElement)
        .disabled
    ).toBe(true)

    fireEvent.change(screen.getByLabelText(/Note/), {
      target: { value: 'Split into two steps.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))

    await waitFor(() => expect(bridge.rejectAgentRun).toHaveBeenCalledTimes(1))
    expect(bridge.rejectAgentRun).toHaveBeenCalledWith({
      runId: 'ar-test-run',
      approvalId: 'ap-plan-1',
      reason: 'Split into two steps.',
      revise: true,
    })
  })

  it('renders command approvals with policy and declines with a note', async () => {
    const bridge = mockBridge()
    const commandRun = makeRun({
      state: 'waiting_for_approval',
      pendingApproval: {
        id: 'ap-cmd-1',
        kind: 'command',
        createdAt: '2026-10-31T00:02:00.000Z',
        payload: {
          subtask: 0,
          title: 'Fix the add function',
          check: 'node scripts/verify.js',
          command: 'node scripts/verify.js',
          purpose: 'Run `node scripts/verify.js` to verify.',
          review: {
            verdict: 'approve',
            reason: '`node <file>` executes a script directly; it needs explicit approval.',
            warnings: [],
          },
        },
      },
      events: [
        { seq: 1, at: '2026-10-31T00:00:00.000Z', kind: 'run-started', phase: 'analyzing', message: 'Agent run started.', data: null },
        { seq: 2, at: '2026-10-31T00:02:00.000Z', kind: 'approval-requested', phase: 'waiting_for_approval', message: 'Subtask 1 needs approval to run: node scripts/verify.js', data: null },
      ],
    })
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'waiting_for_approval',
          live: false,
          interrupted: false,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:02:00.000Z',
          finishedAt: null,
          subtasks: [],
          checkCounts: { passed: 0, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 2,
          error: null,
        },
      ],
      corrupt: [],
    })
    bridge.getAgentRun.mockResolvedValue(commandRun)
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    expect(await screen.findByText('Command approval requested')).not.toBeNull()
    expect(screen.getByText('node scripts/verify.js')).not.toBeNull()
    expect(screen.getByText(/needs explicit approval/)).not.toBeNull()

    fireEvent.change(screen.getByLabelText(/Note/), {
      target: { value: 'I will run it myself.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))

    await waitFor(() => expect(bridge.rejectAgentRun).toHaveBeenCalledTimes(1))
    expect(bridge.rejectAgentRun).toHaveBeenCalledWith({
      runId: 'ar-test-run',
      approvalId: 'ap-cmd-1',
      reason: 'I will run it myself.',
      revise: false,
    })
  })

  it('renders the timeline, checks with output, and the final result', async () => {
    const bridge = mockBridge()
    const doneRun = makeRun({
      state: 'completed',
      finishedAt: '2026-10-31T00:05:00.000Z',
      pendingApproval: null,
      appliedFiles: [{ path: '/proj/src/calc.js', action: 'modify', subtask: 0 }],
      checks: [
        {
          subtask: 0,
          check: 'npm test',
          conclusion: 'passed',
          exitCode: 0,
          timedOut: false,
          runId: 'diag-1',
          reason: '',
          reportId: 'vr-1',
          output: 'ok 1 - adds\n',
          outputLimited: false,
          problems: 0,
          problemsTruncated: false,
          at: '2026-10-31T00:04:00.000Z',
        },
      ],
      events: [
        { seq: 1, at: '2026-10-31T00:00:00.000Z', kind: 'run-started', phase: 'analyzing', message: 'Agent run started.', data: null },
        { seq: 2, at: '2026-10-31T00:03:00.000Z', kind: 'edit-applied', phase: 'executing', message: 'modify /proj/src/calc.js (subtask 1).', data: null },
        { seq: 3, at: '2026-10-31T00:05:00.000Z', kind: 'completed', phase: 'completed', message: 'Run completed. See the final summary.', data: null },
      ],
      summary: {
        version: 1,
        runId: 'ar-test-run',
        task: 'Fix the add function.',
        state: 'completed',
        workComplete: true,
        verification: 'verified',
        whatChanged: [{ path: '/proj/src/calc.js', action: 'modify', label: '/proj/src/calc.js (modified)', subtask: 0 }],
        whyChanged: 'Fix the add function.',
        filesAffected: 1,
        checks: { passed: [], failed: [], skipped: [], notExecuted: [], manualPending: [] },
        checkCounts: { passed: 1, failed: 0, skipped: 0, notExecuted: 0, manualPending: 0 },
        remainingIssues: [],
        suggestedNext: 'All checks passed. Review the diffs, then continue with your workflow.',
        repairs: 0,
        approvals: 1,
        startedAt: '2026-10-31T00:00:00.000Z',
        finishedAt: '2026-10-31T00:05:00.000Z',
      },
    })
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'completed',
          live: false,
          interrupted: false,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:05:00.000Z',
          finishedAt: '2026-10-31T00:05:00.000Z',
          subtasks: [],
          checkCounts: { passed: 1, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 3,
          error: null,
        },
      ],
      corrupt: [],
    })
    bridge.getAgentRun.mockResolvedValue(doneRun)
    const props = baseProps()
    render(<AgentWorkspace {...props} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    expect(await screen.findByText('Run completed. See the final summary.')).not.toBeNull()
    expect(screen.getByText('modify /proj/src/calc.js (subtask 1).')).not.toBeNull()

    fireEvent.click(screen.getByText('npm test'))
    expect(await screen.findByText('ok 1 - adds')).not.toBeNull()

    expect(screen.getByText('All checks passed. Review the diffs, then continue with your workflow.')).not.toBeNull()
    expect(props.onFilesChanged).toHaveBeenCalledWith(['/proj/src/calc.js'])
  })

  it('expands a proposed change and shows the diff', async () => {
    const bridge = mockBridge()
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'waiting_for_approval',
          live: false,
          interrupted: false,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:01:00.000Z',
          finishedAt: null,
          subtasks: [],
          checkCounts: { passed: 0, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 2,
          error: null,
        },
      ],
      corrupt: [],
    })
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    expect(await screen.findByText('Plan approval requested')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /\/proj\/src\/calc\.js/ }))

    expect(bridge.getAgentRunProposal).toHaveBeenCalledWith({
      runId: 'ar-test-run',
      subtask: 0,
    })
    expect(await screen.findByText(/return a \+ b/)).not.toBeNull()
    expect(screen.getByText(/return a - b/)).not.toBeNull()
  })

  it('stops an active run from the header', async () => {
    const bridge = mockBridge()
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'executing',
          live: true,
          interrupted: false,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:02:00.000Z',
          finishedAt: null,
          subtasks: [],
          checkCounts: { passed: 0, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 2,
          error: null,
        },
      ],
      corrupt: [],
    })
    bridge.getAgentRun.mockResolvedValue(
      makeRun({ state: 'executing', pendingApproval: null })
    )
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }))

    await waitFor(() => expect(bridge.cancelAgentRun).toHaveBeenCalledTimes(1))
    expect(bridge.cancelAgentRun).toHaveBeenCalledWith({ runId: 'ar-test-run' })
  })

  it('shows failures and interruptions honestly', async () => {
    const bridge = mockBridge()
    bridge.listAgentRuns.mockResolvedValueOnce({
      runs: [
        {
          id: 'ar-test-run',
          task: 'Fix the add function.',
          state: 'failed',
          live: false,
          interrupted: true,
          createdAt: '2026-10-31T00:00:00.000Z',
          updatedAt: '2026-10-31T00:02:00.000Z',
          finishedAt: null,
          subtasks: [],
          checkCounts: { passed: 0, failed: 0, skipped: 0, notExecuted: 0 },
          eventCount: 1,
          error: null,
        },
      ],
      corrupt: [],
    })
    bridge.getAgentRun.mockResolvedValue(
      makeRun({
        state: 'failed',
        pendingApproval: null,
        interrupted: true,
        error: { phase: 'execute', message: 'Subtask 1 failed to apply.', at: '2026-10-31T00:02:00.000Z' },
      })
    )
    render(<AgentWorkspace {...baseProps()} />)

    fireEvent.change(await screen.findByLabelText('Run history'), {
      target: { value: 'ar-test-run' },
    })

    expect(await screen.findByText(/was interrupted/)).not.toBeNull()
    expect(screen.getByText(/Subtask 1 failed to apply/)).not.toBeNull()
  })
})
