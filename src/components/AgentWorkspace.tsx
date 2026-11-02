// Professional Agent workspace (Milestone 3): the autonomous
// coding agent's home. Header (identity, model, status, history,
// controls), task composer, execution plan with approvals, live
// event timeline, proposed/applied changes with diffs, verification
// with real command output, and the deterministic final result.
//
// Every row renders backend records: nothing here simulates
// progress, invents checks, or previews unproposed edits. Approvals
// cite server-issued ids; the main process re-validates them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kryom, errorMessage } from '../api/kryom'
import { useProviderModels } from '../hooks/useProviderModels'
import { useAgentRun, isRunActive } from '../hooks/useAgentRun'
import { modelDisplayName } from '../utils/models'
import { saveAgentRunUI, loadAgentRunUI } from '../utils/session-restore'
import { DiffView } from './agent/DiffView'
import { useBoundedList } from './agent/BoundedList'
import { CheckpointRestore } from './agent/CheckpointRestore'

export interface AgentWorkspaceProps {
  workspaceRoot: string | null
  defaultModel: string
  activeFile: string | null
  onStatus: (status: string) => void
  onOpenFile: (path: string, line?: number) => void
  onFilesChanged: (paths: string[]) => void
}

const MAX_FILE_RESULTS = 8
const STATE_LABELS: Record<KryomAgentRunState, string> = {
  analyzing: 'Analyzing',
  researching: 'Researching',
  planning: 'Planning',
  proposing: 'Proposing edits',
  waiting_for_approval: 'Awaiting approval',
  executing: 'Executing',
  verifying: 'Verifying',
  repairing: 'Repairing',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const SUBTASK_ICONS: Record<KryomAgentRunSubtaskState, string> = {
  pending: '○',
  ready: '◎',
  applying: '…',
  applied: '●',
  'check-pending': '○',
  'check-running': '…',
  passed: '✓',
  failed: '✕',
  repairing: '…',
  repaired: '✓',
  skipped: '–',
}

function eventIcon(kind: string): string {
  switch (kind) {
    case 'run-started':
      return '▶'
    case 'phase':
      return '◆'
    case 'analysis':
      return '◈'
    case 'research':
      return '❋'
    case 'plan':
      return '☰'
    case 'proposal':
      return '✎'
    case 'approval-requested':
      return '⚠'
    case 'approval-resolved':
      return '✓'
    case 'edit-applying':
      return '…'
    case 'edit-applied':
      return '✎'
    case 'command':
      return '›'
    case 'check':
      return '✓'
    case 'repair':
      return '⟳'
    case 'completed':
      return '✓'
    case 'cancelled':
    case 'cancel-requested':
      return '✕'
    case 'paused':
    case 'pause-requested':
      return '❚❚'
    case 'resumed':
      return '▶'
    case 'error':
      return '✕'
    default:
      return '·'
  }
}

function eventTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function eventDateTime(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return 'unknown time'
  }

  return date.toLocaleString()
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function baseNameOf(filePath: string): string {
  const parts = filePath.split(/[/\\]/)

  return parts[parts.length - 1] || filePath
}

function StatusPill({ run }: { run: KryomAgentRun | null }) {
  if (!run) {
    return <span className="agent-run-status idle">Idle</span>
  }

  const tone =
    run.state === 'completed'
      ? 'done'
      : run.state === 'failed'
        ? 'bad'
        : run.state === 'cancelled'
          ? 'muted'
          : run.state === 'waiting_for_approval'
            ? 'attention'
            : run.state === 'paused'
              ? 'muted'
              : 'active'

  return (
    <span className={`agent-run-status ${tone}`}>
      {STATE_LABELS[run.state] ?? run.state}
      {run.interrupted ? ' (interrupted)' : ''}
    </span>
  )
}

interface ComposerProps {
  workspaceRoot: string | null
  activeFile: string | null
  task: string
  model: string
  researchMode: KryomAgentResearchMode
  includeChat: boolean
  selectedFiles: string[]
  includeActive: boolean
  sending: boolean
  onTask: (value: string) => void
  onResearchMode: (mode: KryomAgentResearchMode) => void
  onIncludeChat: (value: boolean) => void
  onSelectedFiles: (files: string[]) => void
  onIncludeActive: (value: boolean) => void
  onSend: () => void
}

function TaskComposer(props: ComposerProps) {
  const [fileQuery, setFileQuery] = useState('')
  const [fileResults, setFileResults] = useState<KryomSearchMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-resize: the composer grows with the task, up to a cap.
  useEffect(() => {
    const area = areaRef.current

    if (!area) {
      return
    }

    area.style.height = 'auto'
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`
  }, [props.task])

  const chosen = useMemo(
    () => new Set(props.selectedFiles),
    [props.selectedFiles]
  )

  async function searchFiles(event?: React.FormEvent) {
    event?.preventDefault()

    const query = fileQuery.trim()

    if (!query || searching) {
      return
    }

    setSearching(true)
    setSearchError('')

    try {
      const result = await kryom().searchFiles({ query, mode: 'name' })

      setFileResults(
        result.matches
          .filter((match) => !chosen.has(match.path))
          .slice(0, MAX_FILE_RESULTS)
      )
    } catch (e) {
      setSearchError(errorMessage(e))
    } finally {
      setSearching(false)
    }
  }

  function addFile(filePath: string) {
    if (!chosen.has(filePath)) {
      props.onSelectedFiles([...props.selectedFiles, filePath])
    }

    setFileResults((previous) =>
      previous.filter((match) => match.path !== filePath)
    )
  }

  function removeFile(filePath: string) {
    props.onSelectedFiles(
      props.selectedFiles.filter((entry) => entry !== filePath)
    )
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      props.onSend()
    }
  }

  return (
    <div className="agent-run-composer">
      <label className="field-label" htmlFor="agent-run-task">
        Task
      </label>
      <textarea
        id="agent-run-task"
        ref={areaRef}
        className="text-input agent-run-task-input"
        rows={3}
        value={props.task}
        placeholder="Describe the coding task: what to build, fix, or change. The agent plans first and waits for your approval."
        onChange={(event) => props.onTask(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={props.sending || !props.workspaceRoot}
      />
      <div className="agent-run-composer-row">
        <label className="check-line">
          <input
            type="checkbox"
            checked={props.includeActive}
            onChange={(event) => props.onIncludeActive(event.target.checked)}
            disabled={!props.activeFile}
          />
          <span>
            Include active file
            {props.activeFile ? ` (${baseNameOf(props.activeFile)})` : ''}
          </span>
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={props.includeChat}
            onChange={(event) => props.onIncludeChat(event.target.checked)}
          />
          <span>Include recent chat</span>
        </label>
        <label className="agent-run-research">
          <span className="muted">Research</span>
          <select
            aria-label="Research mode"
            className="text-input"
            value={props.researchMode}
            onChange={(event) =>
              props.onResearchMode(event.target.value as KryomAgentResearchMode)
            }
          >
            <option value="auto">Auto</option>
            <option value="off">Off</option>
            <option value="required">Required</option>
          </select>
        </label>
        <span className="spacer" />
        <button
          type="button"
          className="primary-btn"
          onClick={props.onSend}
          disabled={props.sending || !props.workspaceRoot || !props.task.trim()}
        >
          {props.sending ? 'Starting…' : 'Send'}
        </button>
      </div>
      <form className="agent-run-attach" onSubmit={searchFiles}>
        <input
          type="text"
          className="text-input"
          aria-label="Attach project files"
          placeholder="Attach project files by name…"
          value={fileQuery}
          onChange={(event) => setFileQuery(event.target.value)}
          disabled={!props.workspaceRoot}
        />
        <button
          type="submit"
          className="mini-btn"
          disabled={searching || !fileQuery.trim()}
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {searchError && <div className="error-text">{searchError}</div>}
      {fileResults.length > 0 && (
        <ul className="agent-run-file-results">
          {fileResults.map((match) => (
            <li key={match.path}>
              <button
                type="button"
                className="link-btn"
                onClick={() => addFile(match.path)}
              >
                {match.path}
              </button>
            </li>
          ))}
        </ul>
      )}
      {props.selectedFiles.length > 0 && (
        <div className="chip-row">
          {props.selectedFiles.map((filePath) => (
            <span key={filePath} className="chip">
              {baseNameOf(filePath)}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${filePath}`}
                onClick={() => removeFile(filePath)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="muted small">Ctrl+Enter sends.</div>
    </div>
  )
}

interface ApprovalProps {
  run: KryomAgentRun
  acting: boolean
  onApprove: (approvalId: string) => void
  onReject: (approvalId: string, reason?: string, revise?: boolean) => void
  onOpenFile: (path: string) => void
}

function ApprovalCard(props: ApprovalProps) {
  const approval = props.run.pendingApproval
  const [reason, setReason] = useState('')
  // Reset the note when a new approval arrives. This runs during render
  // (not in an effect) so a late-flushing mount effect can never wipe a
  // note the user already typed for the current approval.
  const [lastApprovalId, setLastApprovalId] = useState(approval?.id)

  if (approval?.id !== lastApprovalId) {
    setLastApprovalId(approval?.id)
    setReason('')
  }

  if (props.run.state !== 'waiting_for_approval' || !approval) {
    return null
  }

  const payload = approval.payload

  return (
    <div className="agent-run-approval" role="group" aria-label="Pending approval">
      <div className="agent-run-approval-head">
        <strong>
          {approval.kind === 'plan' && 'Plan approval requested'}
          {approval.kind === 'command' && 'Command approval requested'}
          {approval.kind === 'repair' && 'Repair approval requested'}
        </strong>
        <span className="muted small">{shortId(approval.id)}</span>
      </div>

      {approval.kind === 'plan' && (
        <div className="agent-run-approval-body">
          <div>
            {payload.editCount ?? 0} edit(s) across {(payload.files ?? []).length} file(s)
            in {(payload.subtasks ?? []).length} step(s).
          </div>
          {(payload.risks ?? []).length > 0 && (
            <ul className="agent-run-risk-list">
              {(payload.risks ?? []).map((risk, index) => (
                <li key={index}>
                  <span className={`risk-badge risk-${risk.severity}`}>
                    {risk.severity}
                  </span>{' '}
                  {risk.explanation}
                </li>
              ))}
            </ul>
          )}
          {payload.changeSet && !payload.changeSet.validation.ok && (
            <div className="error-text">
              Change-set blockers:{' '}
              {payload.changeSet.validation.blockers
                .map((blocker) => blocker.reason)
                .join(' | ')}
            </div>
          )}
          <div className="muted small">
            Approving runs the listed edits plus the plan&apos;s review-class
            checks. Anything else asks again.
          </div>
        </div>
      )}

      {approval.kind === 'command' && (
        <div className="agent-run-approval-body">
          <div className="agent-run-command">
            <code>{payload.command}</code>
          </div>
          {payload.purpose && <div>Why: {payload.purpose}</div>}
          {payload.review && (
            <div className="muted small">Policy: {payload.review.reason}</div>
          )}
        </div>
      )}

      {approval.kind === 'repair' && (
        <div className="agent-run-approval-body">
          <div>
            Attempt {payload.attempt} for <code>{payload.check}</code>:{' '}
            {(payload.edits ?? []).length} edit(s).
          </div>
          <ul className="agent-run-file-list">
            {(payload.edits ?? []).map((edit) => (
              <li key={edit.path}>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => props.onOpenFile(edit.path)}
                >
                  {edit.path}
                </button>{' '}
                <span className="muted">({edit.action})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="field-label" htmlFor="agent-run-reason">
        Note (optional{approval.kind === 'plan' ? '; required to request changes' : ''})
      </label>
      <input
        id="agent-run-reason"
        type="text"
        className="text-input"
        value={reason}
        placeholder={
          approval.kind === 'plan'
            ? 'What should change?'
            : 'Why are you declining?'
        }
        onChange={(event) => setReason(event.target.value)}
        disabled={props.acting}
      />
      <div className="agent-run-approval-actions">
        <button
          type="button"
          className="primary-btn"
          disabled={props.acting}
          onClick={() => props.onApprove(approval.id)}
        >
          Approve
        </button>
        {approval.kind === 'plan' ? (
          <>
            <button
              type="button"
              className="mini-btn"
              disabled={props.acting || !reason.trim()}
              title="Reject this plan and ask for a revision"
              onClick={() => props.onReject(approval.id, reason.trim(), true)}
            >
              Request changes
            </button>
            <button
              type="button"
              className="mini-btn danger"
              disabled={props.acting}
              onClick={() =>
                props.onReject(approval.id, reason.trim() || undefined, false)
              }
            >
              Reject &amp; cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="mini-btn danger"
            disabled={props.acting}
            onClick={() =>
              props.onReject(approval.id, reason.trim() || undefined, false)
            }
          >
            Decline
          </button>
        )}
      </div>
    </div>
  )
}

function PlanView(props: {
  run: KryomAgentRun
  onFilesChanged: (paths: string[]) => void
  onStatus: (status: string) => void
}) {
  const run = props.run
  const decomposition = run.decomposition

  if (!decomposition) {
    return (
      <div className="agent-run-section">
        <h3>Execution plan</h3>
        <div className="muted">
          {run.state === 'analyzing' || run.state === 'researching'
            ? 'The agent is still analyzing the task; the plan appears here.'
            : 'No plan was produced for this run.'}
        </div>
      </div>
    )
  }

  const states = new Map(run.subtasks.map((entry) => [entry.index, entry]))

  return (
    <div className="agent-run-section">
      <h3>
        Execution plan{' '}
        <span className="muted small">
          {run.planId ? shortId(run.planId) : ''} · {decomposition.subtasks.length} step(s)
        </span>
      </h3>
      {decomposition.objective && (
        <div className="agent-run-objective">{decomposition.objective}</div>
      )}
      <ol className="agent-run-steps">
        {decomposition.subtasks.map((subtask) => {
          const live = states.get(subtask.index)
          const meta = run.proposals[subtask.index]
          const state = live?.state ?? 'pending'

          return (
            <li key={subtask.index} className={`agent-run-step state-${state}`}>
              <div className="agent-run-step-head">
                <span className="agent-run-step-icon" aria-hidden="true">
                  {SUBTASK_ICONS[state] ?? '○'}
                </span>
                <span className="agent-run-step-title">{subtask.title}</span>
                <span className="muted small">{state}</span>
              </div>
              {subtask.description && (
                <div className="muted small">{subtask.description}</div>
              )}
              <div className="agent-run-step-meta muted small">
                {subtask.files.map((file) => file.path).join(', ') || 'no files'}
                {typeof meta?.editCount === 'number' && ` · ${meta.editCount} edit(s)`}
                {(meta?.droppedOutOfScope ?? 0) > 0 &&
                  ` · ${meta.droppedOutOfScope} out-of-scope dropped`}
              </div>
              {subtask.verification && (
                <div className="muted small">Verify: {subtask.verification}</div>
              )}
              {live?.verificationNote && (
                <div className="muted small">{live.verificationNote}</div>
              )}
              {live?.error && <div className="error-text">{live.error}</div>}
              {live?.checkpointId && (
                <CheckpointRestore
                  checkpointId={live.checkpointId}
                  contextLabel={subtask.title}
                  onFilesChanged={props.onFilesChanged}
                  onStatus={props.onStatus}
                />
              )}
            </li>
          )
        })}
      </ol>
      {decomposition.risks.length > 0 && (
        <details className="agent-run-details">
          <summary>Risks ({decomposition.risks.length})</summary>
          <ul className="agent-run-risk-list">
            {decomposition.risks.map((risk, index) => (
              <li key={index}>
                <span className={`risk-badge risk-${risk.severity}`}>
                  {risk.severity}
                </span>{' '}
                {risk.explanation}{' '}
                <span className="muted">Mitigation: {risk.mitigation}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {run.analysis && run.analysis.hintsDropped > 0 && (
        <div className="muted small">
          {run.analysis.hintsDropped} invented file path(s) were dropped from
          the analysis.
        </div>
      )}
    </div>
  )
}

function TimelineView({ run }: { run: KryomAgentRun }) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [follow, setFollow] = useState(true)
  const lastSeq = run.events.length > 0 ? run.events[run.events.length - 1].seq : 0
  // Follow mode keeps the live tail visible; unfollowed long runs
  // page through a bounded window instead.
  const windowed = useBoundedList(run.events, {
    threshold: 50,
    expandAll: follow,
  })

  useEffect(() => {
    if (follow && bottomRef.current) {
      bottomRef.current.scrollIntoView?.({ block: 'end' })
    }
  }, [lastSeq, follow])

  if (run.events.length === 0) {
    return (
      <div className="agent-run-section">
        <h3>Timeline</h3>
        <div className="muted">No events yet.</div>
      </div>
    )
  }

  return (
    <div className="agent-run-section">
      <h3>
        Timeline{' '}
        <label className="check-line inline muted small">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          <span>Follow</span>
        </label>
      </h3>
      <div className="agent-run-timeline" role="log" aria-label="Run timeline">
        {windowed.visible.map((event) => (
          <div key={event.seq} className="agent-run-event">
            <span className="agent-run-event-icon" aria-hidden="true">
              {eventIcon(event.kind)}
            </span>
            <span className="agent-run-event-body">
              <span className="agent-run-event-message">{event.message}</span>{' '}
              <span className="muted small">
                {event.phase} · {eventTime(event.at)}
              </span>
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {windowed.footer}
    </div>
  )
}

interface ChangesProps {
  run: KryomAgentRun
  loadProposal: (subtask: number) => Promise<KryomAgentRunProposal>
  loadOldContent: (filePath: string) => Promise<string | null>
  onOpenFile: (path: string) => void
}

function ChangesView(props: ChangesProps) {
  const { run } = props
  const [expanded, setExpanded] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<
    Record<string, { oldText: string | null; newText: string; loading: boolean; error: string }>
  >({})

  const proposed = useMemo(() => {
    const byPath = new Map<string, { subtask: number; action: string }>()

    for (const meta of Object.values(run.proposals)) {
      for (const file of meta.files) {
        if (!byPath.has(file.path)) {
          byPath.set(file.path, { subtask: meta.subtask, action: file.action })
        }
      }
    }

    return [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [run.proposals])

  const applied = useMemo(() => {
    const byPath = new Map<string, { subtask: number; action: string }>()

    for (const entry of run.appliedFiles) {
      byPath.set(entry.path, { subtask: entry.subtask, action: entry.action })
    }

    return [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [run.appliedFiles])

  const toggle = useCallback(
    async (filePath: string, subtask: number) => {
      if (expanded === filePath) {
        setExpanded(null)
        return
      }

      setExpanded(filePath)

      if (diffs[filePath]) {
        return
      }

      setDiffs((previous) => ({
        ...previous,
        [filePath]: { oldText: null, newText: '', loading: true, error: '' },
      }))

      try {
        const [proposal, oldText] = await Promise.all([
          props.loadProposal(subtask),
          props.loadOldContent(filePath),
        ])
        const edit = proposal.edits.find((entry) => entry.path === filePath)

        if (!edit) {
          throw new Error('The proposal no longer contains this file.')
        }

        setDiffs((previous) => ({
          ...previous,
          [filePath]: {
            oldText,
            newText: edit.action === 'delete' ? '' : (edit.content ?? ''),
            loading: false,
            error: '',
          },
        }))
      } catch (e) {
        setDiffs((previous) => ({
          ...previous,
          [filePath]: {
            oldText: null,
            newText: '',
            loading: false,
            error: errorMessage(e),
          },
        }))
      }
    },
    [expanded, diffs, props]
  )

  if (proposed.length === 0 && applied.length === 0) {
    return (
      <div className="agent-run-section">
        <h3>Changes</h3>
        <div className="muted">No file changes proposed yet.</div>
      </div>
    )
  }

  function renderList(
    title: string,
    entries: Array<[string, { subtask: number; action: string }]>
  ) {
    if (entries.length === 0) {
      return null
    }

    return (
      <div className="agent-run-change-group">
        <h4>
          {title} ({entries.length})
        </h4>
        <ul className="agent-run-file-list">
          {entries.map(([filePath, info]) => {
            const diff = diffs[filePath]
            const open = expanded === filePath

            return (
              <li key={filePath} className="agent-run-change-file">
                <div className="agent-run-change-head">
                  <button
                    type="button"
                    className="link-btn"
                    aria-expanded={open}
                    onClick={() => void toggle(filePath, info.subtask)}
                  >
                    {open ? '▾' : '▸'} {filePath}
                  </button>
                  <span className={`change-badge change-${info.action}`}>
                    {info.action}
                  </span>
                  <button
                    type="button"
                    className="link-btn muted small"
                    onClick={() => props.onOpenFile(filePath)}
                  >
                    Open
                  </button>
                </div>
                {open && (
                  <div className="agent-run-change-diff">
                    {!diff || diff.loading ? (
                      <div className="muted">Loading diff…</div>
                    ) : diff.error ? (
                      <div className="error-text">{diff.error}</div>
                    ) : diff.oldText === null ? (
                      <div>
                        <div className="muted small">
                          Previous content unavailable; showing new content.
                        </div>
                        <DiffView oldText="" newText={diff.newText} />
                      </div>
                    ) : (
                      <DiffView oldText={diff.oldText} newText={diff.newText} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="agent-run-section">
      <h3>Changes</h3>
      {renderList('Proposed', proposed)}
      {renderList('Applied', applied)}
    </div>
  )
}

function ChecksView({ run }: { run: KryomAgentRun }) {
  const [open, setOpen] = useState<number | null>(null)
  // Window indexes, not checks, so the expanded row survives paging.
  const windowed = useBoundedList(
    run.checks.map((_, index) => index),
    { threshold: 30 }
  )

  if (run.checks.length === 0) {
    const pending = run.subtasks.filter(
      (entry) => entry.state === 'skipped' && entry.verificationNote
    )

    return (
      <div className="agent-run-section">
        <h3>Verification</h3>
        {pending.length > 0 ? (
          <ul className="agent-run-file-list">
            {pending.map((entry) => (
              <li key={entry.index}>
                <span className="muted">
                  Step {entry.index + 1}: {entry.verificationNote}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="muted">No checks have run yet.</div>
        )}
      </div>
    )
  }

  return (
    <div className="agent-run-section">
      <h3>Verification</h3>
      <ul className="agent-run-check-list">
        {windowed.visible.map((index) => {
          const check = run.checks[index]
          const expanded = open === index

          return (
            <li key={index} className={`agent-run-check verdict-${check.conclusion}`}>
              <button
                type="button"
                className="agent-run-check-head"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : index)}
              >
                <span className="agent-run-check-icon" aria-hidden="true">
                  {check.conclusion === 'passed'
                    ? '✓'
                    : check.conclusion === 'failed' || check.conclusion === 'timed_out'
                      ? '✕'
                      : check.conclusion === 'skipped'
                        ? '–'
                        : '○'}
                </span>
                <code className="agent-run-check-name">{check.check}</code>
                <span className="muted small">
                  {check.conclusion}
                  {check.exitCode !== null && ` · exit ${check.exitCode}`}
                  {check.timedOut && ' · timed out'}
                  {check.problems > 0 && ` · ${check.problems} problem(s)`}
                </span>
              </button>
              {expanded && (
                <div className="agent-run-check-body">
                  {check.reason && <div className="muted">{check.reason}</div>}
                  {check.output ? (
                    <pre className="agent-run-output">{check.output}</pre>
                  ) : (
                    <div className="muted small">No output was captured.</div>
                  )}
                  {check.outputLimited && (
                    <div className="muted small">Output was truncated.</div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {windowed.footer}
    </div>
  )
}

function ResultView({ run }: { run: KryomAgentRun }) {
  const summary = run.summary

  if (!summary) {
    return null
  }

  return (
    <div className="agent-run-section">
      <h3>
        Result{' '}
        <span className={`agent-run-status ${summary.verification === 'verified' ? 'done' : 'attention'}`}>
          {summary.verification}
        </span>
      </h3>
      <div className="agent-run-result-grid">
        <div>
          <div className="field-label">What changed</div>
          {summary.whatChanged.length === 0 ? (
            <div className="muted">No files were changed.</div>
          ) : (
            <ul className="agent-run-file-list">
              {summary.whatChanged.map((change, index) => (
                <li key={`${change.path}-${index}`}>{change.label}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="field-label">Checks</div>
          <div className="muted">
            {summary.checkCounts.passed} passed · {summary.checkCounts.failed} failed ·{' '}
            {summary.checkCounts.skipped} skipped · {summary.checkCounts.notExecuted} not
            executed · {summary.checkCounts.manualPending} manual-pending
          </div>
        </div>
      </div>
      {summary.remainingIssues.length > 0 && (
        <div>
          <div className="field-label">Remaining issues</div>
          <ul className="agent-run-file-list">
            {summary.remainingIssues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="field-label">Suggested next step</div>
        <div>{summary.suggestedNext}</div>
      </div>
    </div>
  )
}

export function AgentWorkspace(props: AgentWorkspaceProps) {
  const controller = useAgentRun(props.workspaceRoot)
  const { models: catalogModels } = useProviderModels('meta')
  const [model, setModel] = useState(props.defaultModel)
  const [task, setTask] = useState('')
  const [researchMode, setResearchMode] =
    useState<KryomAgentResearchMode>('auto')
  const [includeChat, setIncludeChat] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [includeActive, setIncludeActive] = useState(true)
  const [sending, setSending] = useState(false)
  const restoredRoot = useRef<string | null>(null)
  const appliedCount = useRef(0)

  const { run, runs, acting } = controller
  const active = isRunActive(run)

  // Restore the per-project view (selected run + composer draft).
  useEffect(() => {
    const root = props.workspaceRoot

    if (!root || restoredRoot.current === root) {
      return
    }

    restoredRoot.current = root
    appliedCount.current = 0

    const saved = loadAgentRunUI(root)

    if (!saved) {
      return
    }

    setTask(saved.task)
    setSelectedFiles(saved.selectedFiles)
    setIncludeActive(saved.includeActive)
    setIncludeChat(saved.includeChat)

    if (
      saved.researchMode === 'off' ||
      saved.researchMode === 'auto' ||
      saved.researchMode === 'required'
    ) {
      setResearchMode(saved.researchMode)
    }

    if (saved.model) {
      setModel(saved.model)
    }

    if (saved.selectedRunId) {
      controller.selectRun(saved.selectedRunId)
    }
    // The controller identity is stable per root; selecting on every
    // controller render would reset the view while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceRoot])

  // Persist the view (debounced); the run itself is disk-backed.
  useEffect(() => {
    const root = props.workspaceRoot

    if (!root) {
      return
    }

    const timer = setTimeout(() => {
      saveAgentRunUI(root, {
        selectedRunId: controller.selectedRunId,
        task,
        selectedFiles,
        includeActive,
        includeChat,
        researchMode,
        model,
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [
    props.workspaceRoot,
    controller.selectedRunId,
    task,
    selectedFiles,
    includeActive,
    includeChat,
    researchMode,
    model,
  ])

  // Keep open editor tabs in sync with applied agent edits.
  useEffect(() => {
    if (!run) {
      appliedCount.current = 0
      return
    }

    if (run.appliedFiles.length > appliedCount.current) {
      const fresh = run.appliedFiles
        .slice(appliedCount.current)
        .map((entry) => entry.path)

      appliedCount.current = run.appliedFiles.length

      if (fresh.length > 0) {
        props.onFilesChanged(fresh)
      }
    }
    // onFilesChanged is a stable shell callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  useEffect(() => {
    if (run && !isRunActive(run)) {
      props.onStatus(`Agent run ${run.state}: ${run.task.slice(0, 80)}`)
    }
    // Status announcements fire on terminal transitions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.state])

  const modelOptions =
    catalogModels.length === 0
      ? [{ modelId: model, displayName: modelDisplayName(model) }]
      : catalogModels.some((entry) => entry.modelId === model)
        ? catalogModels
        : [
            { modelId: model, displayName: modelDisplayName(model) },
            ...catalogModels,
          ]

  function effectiveContextPaths(): string[] {
    const paths =
      includeActive && props.activeFile
        ? [props.activeFile, ...selectedFiles]
        : [...selectedFiles]

    return [...new Set(paths)]
  }

  async function send() {
    const trimmed = task.trim()

    if (!trimmed || sending || !props.workspaceRoot) {
      return
    }

    setSending(true)

    try {
      const created = await controller.start({
        task: trimmed,
        model,
        contextPaths: effectiveContextPaths(),
        researchMode,
        includeChat,
      })

      if (created) {
        setTask('')
        setSelectedFiles([])
        props.onStatus('Agent run started.')
      }
    } finally {
      setSending(false)
    }
  }

  function newTask() {
    controller.selectRun(null)
    setTask('')
    controller.clearError()
  }

  const showComposer = !run || !active

  return (
    <section className="agent-workspace" aria-label="Coding agent workspace">
      <header className="agent-run-header">
        <div className="agent-run-identity">
          <strong>Coding Agent</strong>
          <StatusPill run={run} />
        </div>
        <div className="agent-run-header-controls">
          <label className="agent-run-model">
            <span className="muted small">Model</span>
            <select
              aria-label="Agent model"
              className="text-input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              title="Model for the next task. The backend fixes the model at run start, so an active run keeps its model."
            >
              {modelOptions.map((entry) => (
                <option key={entry.modelId} value={entry.modelId}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </label>
          {active && run && model !== run.model && (
            <span className="muted small" role="status">
              Active run keeps {modelDisplayName(run.model)}
            </span>
          )}
          {runs.length > 0 && (
            <label className="agent-run-model">
              <span className="muted small">History</span>
              <select
                aria-label="Run history"
                className="text-input"
                value={controller.selectedRunId ?? ''}
                onChange={(event) =>
                  controller.selectRun(event.target.value || null)
                }
              >
                <option value="">Select a run…</option>
                {runs.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.task.slice(0, 60)} ({entry.state})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="mini-btn"
            onClick={newTask}
            title="Clear the view and compose a new task"
          >
            New task
          </button>
          {run?.state === 'paused' ? (
            <button
              type="button"
              className="mini-btn"
              disabled={acting}
              onClick={() => void controller.resume()}
            >
              Resume
            </button>
          ) : (
            active && (
              <button
                type="button"
                className="mini-btn"
                disabled={acting || run?.state === 'waiting_for_approval'}
                title={
                  run?.state === 'waiting_for_approval'
                    ? 'The run is parked on an approval; nothing to pause'
                    : 'Pause after the current step'
                }
                onClick={() => void controller.pause()}
              >
                Pause
              </button>
            )
          )}
          {active && (
            <button
              type="button"
              className="mini-btn danger"
              disabled={acting}
              onClick={() => void controller.cancel()}
            >
              Stop
            </button>
          )}
        </div>
      </header>

      {controller.error && (
        <div className="error-text agent-run-error" role="alert">
          {controller.error}
          <button
            type="button"
            className="link-btn"
            onClick={controller.clearError}
          >
            Dismiss
          </button>
        </div>
      )}

      {!props.workspaceRoot && (
        <div className="muted padded">
          Open a project folder to run the coding agent.
        </div>
      )}

      {run?.interrupted && (
        <div className="agent-run-interrupted" role="alert">
          This run was interrupted (restart or crash) mid-flight. Applied work
          and checkpoints were kept; the run can only be stopped now — start a
          new run to continue.
          <button
            type="button"
            className="mini-btn danger"
            disabled={acting}
            onClick={() => void controller.cancel()}
          >
            Stop run
          </button>
        </div>
      )}

      {run?.error && (
        <div className="error-text agent-run-error" role="alert">
          {run.error.phase}: {run.error.message}
        </div>
      )}

      <div className="agent-workspace-grid">
        <div className="agent-workspace-left">
          {showComposer ? (
            <div className="agent-run-section">
              <h3>{run ? 'New task' : 'Task'}</h3>
              <TaskComposer
                workspaceRoot={props.workspaceRoot}
                activeFile={props.activeFile}
                task={task}
                model={model}
                researchMode={researchMode}
                includeChat={includeChat}
                selectedFiles={selectedFiles}
                includeActive={includeActive}
                sending={sending}
                onTask={setTask}
                onResearchMode={setResearchMode}
                onIncludeChat={setIncludeChat}
                onSelectedFiles={setSelectedFiles}
                onIncludeActive={setIncludeActive}
                onSend={() => void send()}
              />
            </div>
          ) : (
            run && (
              <div className="agent-run-section">
                <h3>Task</h3>
                <div className="agent-run-task-text">{run.task}</div>
                <div className="muted small" title={`Run ${run.id}`}>
                  {shortId(run.id)} · {run.model} · research {run.researchMode}
                  {run.researchSessionId &&
                    ` · research ${shortId(run.researchSessionId)}`}
                </div>
                <div className="muted small">
                  Started {eventDateTime(run.createdAt)} · Updated{' '}
                  {eventDateTime(run.updatedAt)}
                </div>
              </div>
            )
          )}

          {controller.loading && <div className="muted padded">Loading run…</div>}

          {run && (
            <ApprovalCard
              run={run}
              acting={acting}
              onApprove={(id) => void controller.approve(id)}
              onReject={(id, reason, revise) =>
                void controller.reject(id, reason, revise)
              }
              onOpenFile={props.onOpenFile}
            />
          )}

          {run && (
            <PlanView
              run={run}
              onFilesChanged={props.onFilesChanged}
              onStatus={props.onStatus}
            />
          )}
          {run && run.summary && <ResultView run={run} />}
        </div>

        <div className="agent-workspace-right">
          {!run && !controller.loading && (
            <div className="agent-run-section">
              <h3>Timeline</h3>
              <div className="muted">
                {runs.length === 0
                  ? 'No runs yet. Describe a task to start the agent.'
                  : 'Select a run from History to review it.'}
              </div>
            </div>
          )}
          {run && <TimelineView key={`timeline-${run.id}`} run={run} />}
          {run && (
            <ChangesView
              run={run}
              loadProposal={controller.loadProposal}
              loadOldContent={controller.loadOldContent}
              onOpenFile={props.onOpenFile}
            />
          )}
          {run && <ChecksView key={`checks-${run.id}`} run={run} />}
        </div>
      </div>
    </section>
  )
}
