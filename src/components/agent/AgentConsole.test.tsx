// Agent console component tests (Phase C): shared hunk diff,
// bounded long lists, and checkpoint restore against a mocked
// bridge + dialog queue.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DiffView } from './DiffView'
import { useBoundedList } from './BoundedList'
import { CheckpointRestore } from './CheckpointRestore'

const mockConfirm = vi.fn(async (..._args: unknown[]): Promise<boolean> => true)

vi.mock('../dialogs', () => ({
  useDialogs: () => ({ confirm: (...args: unknown[]) => mockConfirm(...args) }),
}))

function setBridge(overrides: Record<string, unknown> = {}) {
  Object.defineProperty(window, 'kryom', {
    configurable: true,
    writable: true,
    value: { undoCheckpoint: vi.fn(), ...overrides },
  })
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'kryom')
  vi.restoreAllMocks()
  mockConfirm.mockReset()
  mockConfirm.mockResolvedValue(true)
})

describe('DiffView', () => {
  it('renders hunk headers with ranges and the changed lines', () => {
    render(<DiffView oldText={'a\nb\nc'} newText={'a\nB\nc'} />)

    expect(screen.getByText(/@@ -1,3 \+1,3 @@/)).not.toBeNull()
    expect(screen.getByText('B')).not.toBeNull()
    expect(screen.getByText('b')).not.toBeNull()
  })

  it('renders one header per hunk for distant changes', () => {
    const oldText = Array.from({ length: 20 }, (_, i) => `${i + 1}`).join('\n')
    const newText = Array.from({ length: 20 }, (_, i) =>
      i === 4 ? '5x' : i === 17 ? '18x' : `${i + 1}`
    ).join('\n')
    const { container } = render(<DiffView oldText={oldText} newText={newText} />)

    expect(container.querySelectorAll('.diff-hunk-header')).toHaveLength(2)
    expect(screen.getByText('5x')).not.toBeNull()
    expect(screen.getByText('18x')).not.toBeNull()
  })

  it('reports identical content instead of an empty diff', () => {
    render(<DiffView oldText={'a\nb'} newText={'a\nb'} />)

    expect(screen.getByText('No differences.')).not.toBeNull()
  })

  it('truncates oversized diffs with an honest marker', () => {
    const oldText = Array.from({ length: 400 }, () => 'x').join('\n')
    const newText = Array.from({ length: 400 }, () => 'y').join('\n')
    const { container } = render(<DiffView oldText={oldText} newText={newText} />)

    expect(screen.getByText('Diff truncated for display.')).not.toBeNull()
    expect(container.querySelectorAll('.diff-line').length).toBeLessThanOrEqual(300)
  })
})

function WindowProbe({
  count,
  options,
}: {
  count: number
  options?: { threshold?: number; page?: number; expandAll?: boolean }
}) {
  const windowed = useBoundedList(
    Array.from({ length: count }, (_, i) => `item-${i}`),
    options
  )

  return (
    <div>
      <ul>
        {windowed.visible.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {windowed.footer}
    </div>
  )
}

describe('useBoundedList', () => {
  it('renders small lists in full with no paging controls', () => {
    render(<WindowProbe count={10} />)

    expect(screen.getByText('item-9')).not.toBeNull()
    expect(screen.queryByText(/Show more/)).toBeNull()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it('pages large lists through Show more and Show all', () => {
    render(<WindowProbe count={60} />)

    expect(screen.getByText('item-49')).not.toBeNull()
    expect(screen.queryByText('item-50')).toBeNull()

    fireEvent.click(screen.getByText('Show more (10 remaining)'))
    expect(screen.getByText('item-59')).not.toBeNull()
    expect(screen.queryByText(/Show more/)).toBeNull()
  })

  it('shows everything at once through Show all', () => {
    render(<WindowProbe count={120} />)

    fireEvent.click(screen.getByText('Show all'))
    expect(screen.getByText('item-119')).not.toBeNull()
    expect(screen.queryByText('Show all')).toBeNull()
  })

  it('expands fully when expandAll is set', () => {
    render(<WindowProbe count={120} options={{ expandAll: true }} />)

    expect(screen.getByText('item-119')).not.toBeNull()
    expect(screen.queryByText(/Show more/)).toBeNull()
  })

  it('honors a custom threshold', () => {
    render(<WindowProbe count={10} options={{ threshold: 4, page: 3 }} />)

    expect(screen.queryByText('item-4')).toBeNull()
    fireEvent.click(screen.getByText('Show more (6 remaining)'))
    expect(screen.getByText('item-6')).not.toBeNull()
  })
})

describe('CheckpointRestore', () => {
  function baseProps() {
    return {
      checkpointId: 'ckpt-0123456789abcdef',
      contextLabel: 'Fix the add function',
      onFilesChanged: vi.fn(),
      onStatus: vi.fn(),
    }
  }

  it('confirms, restores, and reports restored/skipped/failed counts', async () => {
    const undoCheckpoint = vi.fn(async () => ({
      id: 'ckpt-0123456789abcdef',
      completed: true,
      restored: ['/proj/src/calc.js'],
      skipped: [{ path: '/proj/src/edited.js', reason: 'modified' }],
      failures: [],
    }))
    setBridge({ undoCheckpoint })

    const props = baseProps()
    render(<CheckpointRestore {...props} />)

    expect(screen.getByText(/checkpoint ckpt-012…cdef/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    expect(mockConfirm.mock.calls[0][0]).toMatchObject({
      title: 'Undo this apply?',
      danger: true,
    })

    expect(await screen.findByText(/Restored 1, skipped 1, failed 0\./)).not.toBeNull()
    expect(undoCheckpoint).toHaveBeenCalledWith('ckpt-0123456789abcdef')
    expect(props.onFilesChanged).toHaveBeenCalledWith(['/proj/src/calc.js'])
    expect(props.onStatus).toHaveBeenCalledWith('Undo: 1 restored, 1 skipped, 0 failed')
  })

  it('does nothing when the dialog is declined', async () => {
    mockConfirm.mockResolvedValue(false)
    const undoCheckpoint = vi.fn()
    setBridge({ undoCheckpoint })

    render(<CheckpointRestore {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1))
    expect(undoCheckpoint).not.toHaveBeenCalled()
  })

  it('surfaces restore failures without crashing', async () => {
    setBridge({
      undoCheckpoint: vi.fn(async () => {
        throw new Error('checkpoint missing')
      }),
    })

    render(<CheckpointRestore {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))

    expect(await screen.findByText(/checkpoint missing/)).not.toBeNull()
  })
})
