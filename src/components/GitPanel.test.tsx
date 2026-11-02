// GitPanel tests (Phase D1): staged/unstaged/untracked states,
// stage/unstage/discard/commit flows through the existing git
// bridge, and workbench navigation from diffs to editor files.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GitPanel } from './GitPanel'

const mockConfirm = vi.fn(async (..._args: unknown[]): Promise<boolean> => true)

vi.mock('./dialogs', () => ({
  useDialogs: () => ({ confirm: (...args: unknown[]) => mockConfirm(...args) }),
}))

function gitStatus(overrides: Record<string, unknown> = {}) {
  return {
    branch: 'main',
    upstream: 'origin/main',
    toplevel: 'C:/repo',
    staged: ['staged.ts'],
    unstaged: ['dirty.ts'],
    untracked: ['new.ts'],
    clean: false,
    ...overrides,
  }
}

function setBridge(overrides: Record<string, unknown> = {}) {
  const bridge = {
    gitStatus: vi.fn(async () => gitStatus()),
    gitDiff: vi.fn(async () => ({ diff: '@@ -1 +1 @@\n-old\n+new', truncated: false })),
    gitStage: vi.fn(async () => ({ success: true, staged: 1 })),
    gitUnstage: vi.fn(async () => ({ success: true, staged: 0 })),
    gitDiscard: vi.fn(async () => ({ success: true, discarded: 1 })),
    gitCommit: vi.fn(async () => ({ success: true })),
    gitPush: vi.fn(async () => ({ branch: 'main', remote: 'origin' })),
    gitPull: vi.fn(async () => ({ branch: 'main', remote: 'origin' })),
    cancelGit: vi.fn(async () => ({ killed: 0 })),
    ...overrides,
  }

  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: bridge,
  })

  return bridge
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  vi.restoreAllMocks()
  mockConfirm.mockReset()
  mockConfirm.mockResolvedValue(true)
})

describe('GitPanel', () => {
  it('renders staged, unstaged, untracked groups with branch state', async () => {
    setBridge()

    render(
      <GitPanel workspaceRoot="C:/repo" onStatus={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('Staged (1)')).not.toBeNull()
    })

    expect(screen.getByText(/main → origin\/main · changes/)).not.toBeNull()
    expect(screen.getByText('staged.ts')).not.toBeNull()
    expect(screen.getByText('dirty.ts')).not.toBeNull()
    expect(screen.getByText('new.ts')).not.toBeNull()
  })

  it('stages and unstages selected files through the bridge', async () => {
    const bridge = setBridge()
    const onStatus = vi.fn()

    render(<GitPanel workspaceRoot="C:/repo" onStatus={onStatus} />)

    await waitFor(() => {
      expect(screen.getByText('Staged (1)')).not.toBeNull()
    })

    fireEvent.click(screen.getByLabelText('Select dirty.ts'))
    fireEvent.click(screen.getByRole('button', { name: /Stage selected \(1\)/ }))

    await waitFor(() => {
      expect(bridge.gitStage).toHaveBeenCalledWith(['C:/repo/dirty.ts'])
    })
    expect(onStatus).toHaveBeenCalledWith('Git changes staged')

    fireEvent.click(screen.getByLabelText('Select staged staged.ts'))
    fireEvent.click(
      screen.getByRole('button', { name: /Unstage selected \(1\)/ })
    )

    await waitFor(() => {
      expect(bridge.gitUnstage).toHaveBeenCalledWith(['C:/repo/staged.ts'])
    })
    expect(onStatus).toHaveBeenCalledWith('Git changes unstaged')
  })

  it('discards only tracked modifications after confirmation', async () => {
    const bridge = setBridge()

    render(<GitPanel workspaceRoot="C:/repo" onStatus={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Staged (1)')).not.toBeNull()
    })

    // Untracked-only selection refuses with guidance, no bridge call.
    fireEvent.click(screen.getByLabelText('Select new.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard tracked' }))

    expect(bridge.gitDiscard).not.toHaveBeenCalled()
    expect(screen.getByText(/Only tracked modifications/)).not.toBeNull()

    fireEvent.click(screen.getByLabelText('Select dirty.ts'))
    fireEvent.click(screen.getByRole('button', { name: 'Discard tracked' }))

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled()
      expect(bridge.gitDiscard).toHaveBeenCalledWith(['C:/repo/dirty.ts'])
    })
  })

  it('commits with a message after confirmation', async () => {
    const bridge = setBridge()
    const onStatus = vi.fn()

    render(<GitPanel workspaceRoot="C:/repo" onStatus={onStatus} />)

    await waitFor(() => {
      expect(screen.getByText('Staged (1)')).not.toBeNull()
    })

    const commit = screen.getByRole('button', { name: 'Commit staged' })
    expect((commit as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Commit message'), {
      target: { value: 'Ship it' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Commit staged' }))

    await waitFor(() => {
      expect(bridge.gitCommit).toHaveBeenCalledWith({ message: 'Ship it' })
    })
    expect(onStatus).toHaveBeenCalledWith('Git commit created')
  })

  it('opens diffed files in the editor when the host routes it', async () => {
    setBridge()
    const onOpenFile = vi.fn()

    const { rerender } = render(
      <GitPanel workspaceRoot="C:/repo" onStatus={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.getByText('Staged (1)')).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'dirty.ts' }))

    await waitFor(() => {
      expect(screen.getByText('dirty.ts', { selector: 'strong' })).not.toBeNull()
    })

    // No host routing: no Open action is rendered.
    expect(
      screen.queryByRole('button', { name: 'Open file' })
    ).toBeNull()

    rerender(
      <GitPanel
        workspaceRoot="C:/repo"
        onStatus={vi.fn()}
        onOpenFile={onOpenFile}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))
    expect(onOpenFile).toHaveBeenCalledWith('C:/repo/dirty.ts')
  })
})
