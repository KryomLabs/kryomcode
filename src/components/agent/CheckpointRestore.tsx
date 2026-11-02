// Per-subtask checkpoint restore for the Agent Console. Reuses
// the existing checkpoint backend (undoCheckpoint) and the shared
// confirm dialog: same safety copy as the plan panel — files
// changed since the apply are kept, only untouched files restore.
import { useState } from 'react'
import { kryom, errorMessage } from '../../api/kryom'
import { useDialogs } from '../dialogs'

function shortCheckpoint(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function CheckpointRestore(props: {
  checkpointId: string
  contextLabel: string
  onFilesChanged: (paths: string[]) => void
  onStatus: (status: string) => void
}) {
  const dialogs = useDialogs()
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  async function restore() {
    if (restoring) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Undo this apply?',
      message:
        `Restore step “${props.contextLabel}” to checkpoint ` +
        `${shortCheckpoint(props.checkpointId)}? Files changed since the ` +
        'apply are kept; only untouched files are restored to their ' +
        'pre-apply contents.',
      confirmLabel: 'Undo apply',
      danger: true,
    })

    if (!confirmed) {
      return
    }

    setRestoring(true)
    setError('')
    setSummary('')

    try {
      const result = await kryom().undoCheckpoint(props.checkpointId)

      setSummary(
        `Restored ${result.restored.length}, skipped ${result.skipped.length}, ` +
          `failed ${result.failures.length}.`
      )
      props.onFilesChanged(result.restored)
      props.onStatus(
        `Undo: ${result.restored.length} restored, ` +
          `${result.skipped.length} skipped, ${result.failures.length} failed`
      )
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="muted small agent-checkpoint-row">
      <span title={`Checkpoint ${props.checkpointId}`}>
        checkpoint {shortCheckpoint(props.checkpointId)}
      </span>{' '}
      <button
        type="button"
        className="link-btn"
        disabled={restoring}
        onClick={() => void restore()}
      >
        {restoring ? 'Restoring…' : 'Restore'}
      </button>
      {summary && <span> · {summary}</span>}
      {error && <span className="error-text"> · {error}</span>}
    </div>
  )
}
