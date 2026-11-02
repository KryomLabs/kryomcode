import { useEffect, useState } from 'react'
import { kryom, errorMessage, isCancelError } from '../api/kryom'
import { useDialogs } from './dialogs'

export interface GitPanelProps {
  workspaceRoot: string | null
  onStatus: (status: string) => void
  // Opens a diffed file in the editor (Phase D1 workbench
  // coordination). Absent = no Open action.
  onOpenFile?: (path: string) => void
}

interface DiffView {
  title: string
  diff: string
  truncated: boolean
  path: string | null
}

// Single-column source-control view sized for the 260px sidebar:
// staged, changes, then commit. Staged entries can be unstaged;
// tracked modifications can be discarded after confirmation.
// Untracked files are staged or deleted from the Explorer, never
// silently discarded here.
export function GitPanel(props: GitPanelProps) {
  const dialogs = useDialogs()
  const [status, setStatus] = useState<KryomGitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [stagedSelected, setStagedSelected] = useState<Set<string>>(new Set())
  const [diff, setDiff] = useState<DiffView | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [showStaged, setShowStaged] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [operating, setOperating] = useState<string | null>(null)

  async function loadStatus() {
    if (!props.workspaceRoot) {
      setStatus(null)
      return
    }

    setLoading(true)
    setError('')

    try {
      setStatus(await kryom().gitStatus())
    } catch (e) {
      setStatus(null)
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setDiff(null)
    setSelected(new Set())
    setStagedSelected(new Set())
    setCommitMessage('')

    if (props.workspaceRoot) {
      void loadStatus()
    } else {
      setStatus(null)
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceRoot])

  function toggleSelected(file: string) {
    setSelected((previous) => {
      const next = new Set(previous)

      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }

      return next
    })
  }

  function toggleStagedSelected(file: string) {
    setStagedSelected((previous) => {
      const next = new Set(previous)

      if (next.has(file)) {
        next.delete(file)
      } else {
        next.add(file)
      }

      return next
    })
  }

  async function loadDiff(title: string, staged: boolean, path?: string) {
    setDiffLoading(true)
    setError('')

    try {
      const result = await kryom().gitDiff({ staged, path })
      setDiff({ title, diff: result.diff, truncated: result.truncated, path: path ?? null })
    } catch (e) {
      setDiff(null)
      setError(errorMessage(e))
    } finally {
      setDiffLoading(false)
    }
  }

  const pathBase = status?.toplevel || props.workspaceRoot || ''
  const absoluteOf = (file: string) => `${pathBase}/${file}`

  async function stageSelected() {
    if (selected.size === 0 || operating || !pathBase) {
      return
    }

    setOperating('stage')
    setError('')

    try {
      await kryom().gitStage([...selected].map(absoluteOf))
      setSelected(new Set())
      await loadStatus()
      props.onStatus('Git changes staged')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setOperating(null)
    }
  }

  async function unstageSelected() {
    if (stagedSelected.size === 0 || operating || !pathBase) {
      return
    }

    setOperating('unstage')
    setError('')

    try {
      await kryom().gitUnstage([...stagedSelected].map(absoluteOf))
      setStagedSelected(new Set())
      await loadStatus()
      props.onStatus('Git changes unstaged')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setOperating(null)
    }
  }

  async function discardSelected() {
    if (!status || selected.size === 0 || operating || !pathBase) {
      return
    }

    const tracked = [...selected].filter((file) =>
      status.unstaged.includes(file)
    )
    const skipped = selected.size - tracked.length

    if (tracked.length === 0) {
      setError(
        'Only tracked modifications can be discarded here. Delete untracked files from the Explorer.'
      )
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Discard changes?',
      message:
        `${tracked.length} file(s) will be restored to their committed ` +
        `contents. This cannot be undone.` +
        (skipped > 0 ? ` ${skipped} untracked file(s) are left alone.` : ''),
      confirmLabel: 'Discard changes',
      danger: true,
    })

    if (!confirmed) {
      return
    }

    setOperating('discard')
    setError('')

    try {
      await kryom().gitDiscard(tracked.map(absoluteOf))
      setSelected(new Set())
      await loadStatus()
      props.onStatus('Git changes discarded')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setOperating(null)
    }
  }

  async function commit() {
    const message = commitMessage.trim()

    if (!message || operating) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Create commit?',
      message: `This creates a commit with message: "${message.slice(0, 120)}"`,
      confirmLabel: 'Commit',
    })

    if (!confirmed) {
      return
    }

    setOperating('commit')
    setError('')

    try {
      await kryom().gitCommit({ message })
      setCommitMessage('')
      await loadStatus()
      props.onStatus('Git commit created')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setOperating(null)
    }
  }

  async function push() {
    if (operating) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Push to remote?',
      message:
        'This pushes the current branch to its remote. ' +
        'KryomCode never handles your credentials; git uses your ambient login.',
      confirmLabel: 'Push',
    })

    if (!confirmed) {
      return
    }

    setOperating('push')
    setError('')

    try {
      const result = await kryom().gitPush({})
      await loadStatus()
      props.onStatus(`Pushed ${result.branch} to ${result.remote}`)
    } catch (e) {
      if (isCancelError(e)) {
        props.onStatus('Git push cancelled')
      } else {
        setError(errorMessage(e))
      }
    } finally {
      setOperating(null)
    }
  }

  async function pull() {
    if (operating) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Pull from remote?',
      message:
        'This fast-forwards the current branch from its remote. ' +
        'Local commits that have diverged are left untouched with an error.',
      confirmLabel: 'Pull',
    })

    if (!confirmed) {
      return
    }

    setOperating('pull')
    setError('')

    try {
      const result = await kryom().gitPull({})
      await loadStatus()
      props.onStatus(`Pulled ${result.branch} from ${result.remote}`)
    } catch (e) {
      if (isCancelError(e)) {
        props.onStatus('Git pull cancelled')
      } else {
        setError(errorMessage(e))
      }
    } finally {
      setOperating(null)
    }
  }

  function cancelOperation() {
    if (!operating) {
      return
    }

    kryom().cancelGit().catch(() => undefined)
  }

  const busy = loading || operating !== null || diffLoading

  return (
    <section className="git-panel bottom-tab-panel">
      {!props.workspaceRoot ? (
        <p className="muted padded">Open a project to use Git.</p>
      ) : (
        <>
          <div className="git-toolbar">
            <button onClick={() => void loadStatus()} disabled={busy}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>

            <button
              onClick={() => void loadDiff('Full diff (unstaged)', false)}
              disabled={busy || !status || status.clean}
            >
              View full diff
            </button>

            <label className="staged-toggle">
              <input
                type="checkbox"
                checked={showStaged}
                onChange={(event) => setShowStaged(event.target.checked)}
              />
              Show staged diffs
            </label>

            {status && (
              <span className="muted">
                {status.branch ?? '(no branch)'}
                {status.upstream ? ` → ${status.upstream}` : ''}
                {status.clean ? ' · clean' : ' · changes'}
              </span>
            )}
          </div>

          {error && <p className="inline-error padded">{error}</p>}

          {status && (
            <div className="git-stack">
              <div className="git-list">
                <strong>Staged ({status.staged.length})</strong>
                {status.staged.length === 0 && (
                  <p className="muted">Nothing staged.</p>
                )}
                {status.staged.map((file) => (
                  <label key={`s-${file}`} className="git-file-check">
                    <input
                      type="checkbox"
                      checked={stagedSelected.has(file)}
                      onChange={() => toggleStagedSelected(file)}
                      aria-label={`Select staged ${file}`}
                    />
                    <button
                      type="button"
                      className="git-file link-button"
                      onClick={() => void loadDiff(file, true, absoluteOf(file))}
                      title="View staged diff"
                    >
                      {file}
                    </button>
                  </label>
                ))}

                <div className="git-actions">
                  <button
                    onClick={() => void unstageSelected()}
                    disabled={stagedSelected.size === 0 || busy}
                  >
                    {operating === 'unstage'
                      ? 'Unstaging…'
                      : `Unstage selected (${stagedSelected.size})`}
                  </button>
                </div>
              </div>

              <div className="git-list">
                <strong>
                  Changes · unstaged ({status.unstaged.length}) · untracked (
                  {status.untracked.length})
                </strong>
                {status.unstaged.length === 0 &&
                  status.untracked.length === 0 && <p className="muted">Clean.</p>}
                {[...status.unstaged, ...status.untracked].map((file) => (
                  <label key={`u-${file}`} className="git-file-check">
                    <input
                      type="checkbox"
                      checked={selected.has(file)}
                      onChange={() => toggleSelected(file)}
                      aria-label={`Select ${file}`}
                    />
                    <button
                      type="button"
                      className="git-file link-button"
                      onClick={() =>
                        void loadDiff(file, showStaged, absoluteOf(file))
                      }
                      title="View diff"
                    >
                      {file}
                    </button>
                  </label>
                ))}

                <div className="git-actions">
                  <button
                    onClick={() => void stageSelected()}
                    disabled={selected.size === 0 || busy}
                  >
                    {operating === 'stage'
                      ? 'Staging…'
                      : `Stage selected (${selected.size})`}
                  </button>
                  <button
                    onClick={() => void discardSelected()}
                    disabled={selected.size === 0 || busy}
                  >
                    {operating === 'discard'
                      ? 'Discarding…'
                      : 'Discard tracked'}
                  </button>
                </div>
              </div>

              <div className="git-list">
                <strong>Commit</strong>
                <textarea
                  aria-label="Commit message"
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  placeholder="Commit message…"
                  rows={3}
                  maxLength={2000}
                />
                <div className="git-actions">
                  <button
                    onClick={() => void commit()}
                    disabled={!commitMessage.trim() || busy}
                  >
                    {operating === 'commit' ? 'Committing…' : 'Commit staged'}
                  </button>
                  <button onClick={() => void push()} disabled={busy}>
                    {operating === 'push' ? 'Pushing…' : 'Push'}
                  </button>
                  <button onClick={() => void pull()} disabled={busy}>
                    {operating === 'pull' ? 'Pulling…' : 'Pull'}
                  </button>
                  {(operating === 'push' || operating === 'pull') && (
                    <button onClick={cancelOperation}>Cancel</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {diffLoading && <p className="muted padded">Loading diff…</p>}

          {diff && (
            <div className="git-diff">
              <strong>{diff.title}</strong>
              {diff.path && props.onOpenFile && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => props.onOpenFile?.(diff.path as string)}
                  title={`Open ${diff.path} in the editor`}
                >
                  Open file
                </button>
              )}
              {diff.truncated && (
                <p className="muted">Diff truncated for display.</p>
              )}
              <pre className="terminal-output">
                {diff.diff || '(No differences.)'}
              </pre>
            </div>
          )}
        </>
      )}
    </section>
  )
}
