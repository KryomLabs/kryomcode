import { useEffect, useRef, useState } from 'react'
import { kryom, errorMessage, isCancelError } from '../api/kryom'
import { saveAgentDraft, loadAgentDraft } from '../utils/session-restore'
import { DiffView } from './agent/DiffView'
import { baseName } from '../utils/paths'
import { copyText } from '../utils/clipboard'
import { useDialogs } from './dialogs'
import { AiKeyNotice } from './AiKeyNotice'

export interface AgentPanelProps {
  workspaceRoot: string | null
  defaultModel: string
  defaultIncludeContext: boolean
  activeFile: string | null
  activeFileDirty: boolean
  onFilesChanged: (changedPaths: string[]) => void
  onStatus: (status: string) => void
  pendingTask?: { text: string; nonce: number; researchSessionId?: string } | null
  onOpenConnections?: () => void
  onOpenFile?: (path: string) => void
  // Meta AI session embedding (Level 3C): scopes the recovered draft
  // to one session instead of the whole project, and reports the
  // tracked plan + applied files so the session timeline and
  // changed-file manifest stay backed by real events.
  draftKey?: string | null
  onPlanTracked?: (planId: string | null) => void
  onApplyCompleted?: (
    applied: Array<{ path: string; action: string }>,
    checkpointId: string | null
  ) => void
  // User-selected history resolved to bounded text by the embedding
  // session. Appended to the planned task as a delimited block so the
  // planner grounds on prior sessions; the visible draft is unchanged
  // and server-derived titles (from the task start) stay clean.
  historyContext?: string | null
}

const MODELS = ['muse-spark-1.3', 'muse-wonder-1.0'] as const

const MAX_FILE_RESULTS = 8
const MAX_SCRIPTS = 8
const MAX_OUTPUT_CHARS = 8000

// Delimits user-selected history appended to a planned task. The
// review view splits on it so the task reads cleanly while the
// attached history stays disclosed (never silently bundled).
const HISTORY_BLOCK_MARKER =
  'Relevant selected history (prior sessions, may be stale):'

function splitHistoryBlock(task: string): {
  head: string
  historyChars: number
} {
  const marker = `\n\n${HISTORY_BLOCK_MARKER}\n`
  const at = task.indexOf(marker)

  if (at === -1) {
    return { head: task, historyChars: 0 }
  }

  return {
    head: task.slice(0, at),
    historyChars: task.length - at - marker.length,
  }
}

type AgentStatus =
  | 'idle'
  | 'inspecting'
  | 'gathering'
  | 'planning'
  | 'review'
  | 'applying'
  | 'verifyApproval'
  | 'verifying'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: '',
  inspecting: 'Inspecting project…',
  gathering: 'Gathering source context…',
  planning: 'Planning…',
  review: 'Awaiting review',
  applying: 'Applying changes…',
  verifyApproval: 'Awaiting verification approval',
  verifying: 'Verifying…',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  return `${(bytes / 1024).toFixed(1)} KB`
}

function isStaleError(error: unknown): boolean {
  return error instanceof Error && /changed since the plan/i.test(error.message)
}

// Orders approved edits by the change-set manifest. Members missing
// from the order (defensive; the backend always returns a full
// permutation) keep plan order at the end.
function orderEditsByManifest(
  edits: KryomAgentEdit[],
  order: number[]
): KryomAgentEdit[] {
  const byIndex = new Map(edits.map((edit) => [edit.index ?? 0, edit]))
  const ordered = order
    .map((index) => byIndex.get(index))
    .filter((edit): edit is KryomAgentEdit => edit !== undefined)
  const missing = edits.filter((edit) => !order.includes(edit.index ?? 0))

  return [...ordered, ...missing]
}

const REPAIR_TERMINAL_STATES: KryomRepairState[] = [
  'passed',
  'exhausted',
  'expired',
  'cancelled',
  'approval-denied',
  'stale',
  'checkpoint-failed',
  'error',
]

function isRepairTerminal(state: KryomRepairState): boolean {
  return REPAIR_TERMINAL_STATES.includes(state)
}

function formatRepairMs(valueMs: number): string {
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/* Phase C: EditDiff was consolidated into the shared hunk-grouped
   DiffView in ./agent/DiffView (used here and by AgentWorkspace).
   The original implementation is preserved below for reference.
function EditDiffRetired({ oldText, newText }: { oldText: string; newText: string }) {
  const { lines, truncated } = diffLines(oldText, newText)
  const shown = lines.slice(0, 300)

  return (
    <div className="diff-view">
      {shown.map((line, index) => (
        <div key={index} className={`diff-line diff-${line.type}`}>
          <span className="diff-gutter">
            {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
          </span>
          <span className="diff-text">{line.text || ' '}</span>
        </div>
      ))}
      {(truncated || lines.length > shown.length) && (
        <div className="muted padded">Diff truncated for display.</div>
      )}
    </div>
  )
}

End of retired EditDiff reference. */
// Provenance-labelled view of the exact context snapshot sent with
// a planning request. `live` snapshots (from the tracked plan) carry
// re-checked freshness; proposal snapshots show recorded values.
function ContextSnapshotView(props: {
  snapshot: KryomContextSnapshot | null | undefined
  live: boolean
}) {
  const snapshot = props.snapshot

  if (!snapshot) {
    return (
      <p className="muted padded">
        Context snapshot not recorded (plan predates tracking).
      </p>
    )
  }

  const staleFiles = snapshot.files.filter(
    (file) => file.status === 'stale' || file.status === 'missing'
  )
  const researchStale =
    snapshot.research != null &&
    (snapshot.research.freshness === 'stale' ||
      snapshot.research.freshness === 'missing')

  return (
    <div className="plan-context">
      <strong>Attached context</strong>
      <p className="muted">
        Recorded {new Date(snapshot.at).toLocaleString()} for project{' '}
        {snapshot.projectName}
        {props.live ? '' : ' (proposal values; freshness unknown)'}
      </p>

      {(staleFiles.length > 0 || researchStale) && (
        <p className="plan-context-warning" role="status">
          Context changed since planning: please re-check before applying.
        </p>
      )}

      {snapshot.research && snapshot.research.status !== 'completed' && (
        <p className="plan-context-warning" role="status">
          Research session {snapshot.research.sessionId} is{' '}
          {snapshot.research.status}; findings may be incomplete.
        </p>
      )}

      <ul className="plan-context-list">
        {snapshot.files.map((file) => (
          <li key={file.relativePath}>
            <span className="context-kind">file</span> {file.relativePath}{' '}
            <span className="muted">
              ({formatBytes(file.bytes)} · {file.digest.slice(0, 12)}
              {file.status ? ` · ${file.status}` : ''}
              {file.reason ? ` — ${file.reason}` : ''})
            </span>
          </li>
        ))}
        {snapshot.research && (
          <li>
            <span className="context-kind">research</span>{' '}
            {snapshot.research.sessionId}{' '}
            <span className="muted">
              (brief v{snapshot.research.briefVersion} ·{' '}
              {snapshot.research.objective.slice(0, 80)} · status{' '}
              {snapshot.research.status}
              {snapshot.research.freshness
                ? ` · ${snapshot.research.freshness}`
                : ''}
              {snapshot.research.freshnessReason
                ? ` — ${snapshot.research.freshnessReason}`
                : ''}
              )
            </span>
          </li>
        )}
        {snapshot.chat && (
          <li>
            <span className="context-kind">chat</span>{' '}
            {snapshot.chat.messageCount} message(s){' '}
            <span className="muted">
              ({formatBytes(snapshot.chat.chars)}
              {snapshot.chat.truncated ? ', truncated' : ''} · point-in-time
              excerpt)
            </span>
          </li>
        )}
        {snapshot.workspace && (
          <li>
            <span className="context-kind">workspace</span>{' '}
            {snapshot.workspace.projectName}{' '}
            <span className="muted">(project brief reference)</span>
          </li>
        )}
        {snapshot.files.length === 0 &&
          !snapshot.research &&
          !snapshot.chat && (
            <li>
              <span className="muted">
                No files, research, or chat attached (task only).
              </span>
            </li>
          )}
      </ul>
      <p className="muted">
        Context informs the plan; only verification reports prove execution.
      </p>
    </div>
  )
}

export function AgentPanel(props: AgentPanelProps) {
  const dialogs = useDialogs()
  const [model, setModel] = useState(props.defaultModel)
  const [task, setTask] = useState('')
  const [researchSessionId, setResearchSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [plan, setPlan] = useState<KryomAgentPlan | null>(null)
  const [approved, setApproved] = useState<Set<number>>(new Set())
  const [oldContents, setOldContents] = useState<Record<number, string>>({})
  const [planning, setPlanning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<KryomAgentApplyResult | null>(null)
  // Dependency-aware change set (3B.6): read-only manifest over the
  // approved edits. Blockers disable Apply; analysis failures fall
  // back to plan order since the apply path guards remain.
  const [changeSet, setChangeSet] = useState<KryomChangeSetManifest | null>(null)
  const [changeSetError, setChangeSetError] = useState('')
  const [changeSetLoading, setChangeSetLoading] = useState(false)
  const changeSetGenerationRef = useRef(0)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const [keyMissing, setKeyMissing] = useState(false)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState<number | null>(null)

  // Source context selection. Only explicitly chosen files are read,
  // in the main process, after validation.
  const [includeActive, setIncludeActive] = useState(props.defaultIncludeContext)
  const [includeChat, setIncludeChat] = useState(false)
  const [chatExcerpt, setChatExcerpt] = useState<KryomChatExcerpt | null>(null)
  const [chatExcerptError, setChatExcerptError] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [fileQuery, setFileQuery] = useState('')
  const [fileResults, setFileResults] = useState<KryomSearchMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [contextPreview, setContextPreview] =
    useState<KryomAgentContextPreview | null>(null)
  const [contextOpen, setContextOpen] = useState(true)

  // Verification handoff. Nothing runs without an explicit click.
  const [verifyOptions, setVerifyOptions] = useState<string[]>([])
  const [verifyCommand, setVerifyCommand] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] =
    useState<KryomDiagnosticsResult | null>(null)
  const [verifyError, setVerifyError] = useState('')
  // Backend repair cycle (3B.4): the backend owns attempt counts,
  // deadlines, and state; the renderer only displays and advances.
  const [repairCycle, setRepairCycle] = useState<KryomRepairCycle | null>(null)
  const [repairBusy, setRepairBusy] = useState(false)
  const [repairError, setRepairError] = useState('')
  const [checkpoints, setCheckpoints] = useState<KryomCheckpoint[]>([])
  const [undoing, setUndoing] = useState(false)
  const [undoResult, setUndoResult] = useState<KryomUndoResult | null>(null)
  const [undoError, setUndoError] = useState('')
  // Tracked execution plan (3A.3). Progress calls are evidence, never
  // gates: a tracking failure is reported but never blocks review,
  // apply, or verification.
  const [trackedPlan, setTrackedPlan] = useState<KryomTrackedPlan | null>(null)
  const [progressError, setProgressError] = useState('')
  // Operation generation: Stop invalidates the in-flight plan or
  // apply so late responses can never overwrite cancelled state.
  const opGenerationRef = useRef(0)

  // Draft scope defaults to the project root; embedded Meta AI
  // sessions pass their own key so drafts never mix between tabs.
  const draftScope = props.draftKey ?? props.workspaceRoot

  useEffect(() => {
    setModel(props.defaultModel)
  }, [props.defaultModel])

  useEffect(() => {
    setIncludeActive(props.defaultIncludeContext)
  }, [props.defaultIncludeContext])

  // Rebuilds the change-set manifest whenever the plan or the
  // approved subset changes. Repair attempts skip analysis: they
  // apply through the repair cycle's own verified path.
  useEffect(() => {
    if (!plan || approved.size === 0 || repairAttemptId() !== null) {
      setChangeSet(null)
      setChangeSetError('')
      setChangeSetLoading(false)
      return
    }

    const generation = changeSetGenerationRef.current + 1
    changeSetGenerationRef.current = generation
    setChangeSetLoading(true)
    setChangeSetError('')

    const edits = plan.edits.filter((edit) => approved.has(edit.index ?? 0))

    kryom()
      .buildAgentChangeSet({ edits })
      .then((manifest) => {
        if (generation !== changeSetGenerationRef.current) {
          return
        }

        setChangeSet(manifest)
        setChangeSetLoading(false)
      })
      .catch((e: unknown) => {
        if (generation !== changeSetGenerationRef.current) {
          return
        }

        setChangeSet(null)
        setChangeSetError(errorMessage(e))
        setChangeSetLoading(false)
      })
  }, [plan, approved, repairCycle])

  const consumedTaskNonce = useRef<number | null>(null)

  useEffect(() => {
    const pending = props.pendingTask

    if (!pending || pending.text.trim() === '') {
      return
    }

    if (consumedTaskNonce.current === pending.nonce) {
      return
    }

    consumedTaskNonce.current = pending.nonce
    setTask(pending.text)
    setResearchSessionId(pending.researchSessionId ?? null)

    if (!props.workspaceRoot || planning) {
      return
    }

    void requestPlanFor(pending.text, pending.researchSessionId ?? null)
    // Consumes one welcome submit per nonce; planning/model come from
    // this render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingTask, props.workspaceRoot])

  // Agent draft recovery (Level 2B.2): task inputs and the
  // awaiting-review plan persist per project. Restore applies only
  // to a pristine panel; an explicit pending task always wins.
  const restoredDraftForRef = useRef<string | null>(null)

  useEffect(() => {
    const root = draftScope

    if (!root || restoredDraftForRef.current === root) {
      return
    }

    restoredDraftForRef.current = root

    if (task !== '' || plan !== null || planning || status !== 'idle') {
      return
    }

    const draft = loadAgentDraft(root)

    if (!draft) {
      return
    }

    setTask(draft.task)
    setSelectedFiles(draft.selectedFiles)
    setIncludeActive(draft.includeActive)
    setIncludeChat(draft.includeChat)
    setResearchSessionId(draft.researchSessionId)

    if (draft.plan) {
      const restored = draft.plan
      setPlan(restored)
      setApproved(new Set(restored.edits.map((edit) => edit.index ?? 0)))
      setStatus('review')
      props.onStatus(
        `Agent plan restored: ${restored.edits.length} edit(s) awaiting review`
      )
      void loadOldContents(restored)

      if (draft.planId) {
        kryom()
          .getAgentPlan({ id: draft.planId })
          .then(setTrackedPlan)
          .catch((e: unknown) => setProgressError(errorMessage(e)))
      } else {
        // Legacy v1 draft: track once so progress persists going forward.
        void trackProposal(restored)
      }
    }

    // Repair cycles are durable backend-side; only the id needs
    // restoring, and a failed fetch simply drops the reference.
    if (draft.repairCycleId) {
      kryom()
        .getRepairCycle({ cycleId: draft.repairCycleId })
        .then((fetched) => setRepairCycle(fetched.cycle))
        .catch(() => undefined)
    }
    // Pristine check uses this render's closure intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftScope])

  useEffect(() => {
    const root = draftScope

    if (!root) {
      return
    }

    const timer = setTimeout(() => {
      saveAgentDraft(root, {
        task,
        selectedFiles,
        includeActive,
        includeChat,
        researchSessionId,
        // Consumed plans are not re-offered after reload.
        plan: applyResult?.completed ? null : plan,
        planId: applyResult?.completed ? null : (trackedPlan?.id ?? null),
        repairCycleId: repairCycle?.id ?? null,
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [
    draftScope,
    task,
    selectedFiles,
    includeActive,
    includeChat,
    researchSessionId,
    plan,
    applyResult,
    trackedPlan,
    repairCycle,
  ])

  // Reports the tracked plan id to embedding Meta AI sessions so the
  // session timeline can query real plan steps by id.
  const trackedPlanId = trackedPlan?.id ?? null

  useEffect(() => {
    props.onPlanTracked?.(trackedPlanId)
    // The callback identity is the parent's concern; the id drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedPlanId])

  // Durable checkpoints (Level 2B.3): every apply persists its
  // pre-apply bytes, so earlier batches stay undoable across
  // sessions. Undo always confirms and never overwrites files the
  // user touched since the apply.
  async function refreshCheckpoints() {
    if (!props.workspaceRoot) {
      setCheckpoints([])
      return
    }

    try {
      const result = await kryom().listCheckpoints()
      setCheckpoints(result.checkpoints)
    } catch {
      setCheckpoints([])
    }
  }

  useEffect(() => {
    void refreshCheckpoints()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workspaceRoot])

  function displayUndoPath(absolute: string): string {
    const root = props.workspaceRoot

    if (root && absolute.startsWith(root)) {
      const relative = absolute.slice(root.length).replace(/^[/\\]+/, '')

      if (relative) {
        return relative
      }
    }

    return absolute
  }

  async function undoApply(checkpointId: string) {
    if (undoing) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Undo this apply?',
      message:
        'Files changed since the apply are kept; only untouched files ' +
        'are restored to their pre-apply contents.',
      confirmLabel: 'Undo apply',
      danger: true,
    })

    if (!confirmed) {
      return
    }

    setUndoing(true)
    setUndoError('')

    try {
      const result = await kryom().undoCheckpoint(checkpointId)
      setUndoResult(result)
      props.onFilesChanged(result.restored)
      props.onStatus(
        `Undo: ${result.restored.length} restored, ` +
          `${result.skipped.length} skipped, ${result.failures.length} failed`
      )
      void refreshCheckpoints()
    } catch (e) {
      setUndoError(errorMessage(e))
    } finally {
      setUndoing(false)
    }
  }

  function effectiveContextPaths(): string[] {
    const paths =
      includeActive && props.activeFile
        ? [props.activeFile, ...selectedFiles]
        : [...selectedFiles]

    return [...new Set(paths)]
  }

  async function searchProjectFiles(event?: React.FormEvent) {
    event?.preventDefault()

    const query = fileQuery.trim()

    if (!query || searching) {
      return
    }

    setSearching(true)
    setSearchError('')

    try {
      const result = await kryom().searchFiles({ query, mode: 'name' })
      const chosen = new Set(effectiveContextPaths())

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

  function addSelectedFile(path: string) {
    setSelectedFiles((previous) =>
      previous.includes(path) ? previous : [...previous, path]
    )
    setFileResults((previous) =>
      previous.filter((match) => match.path !== path)
    )
  }

  function removeSelectedFile(path: string) {
    setSelectedFiles((previous) =>
      previous.filter((entry) => entry !== path)
    )
  }

  async function trackProposal(next: KryomAgentPlan): Promise<void> {
    try {
      const tracked = await kryom().trackAgentPlan({ proposal: next })

      setTrackedPlan(tracked)
      setProgressError('')

      try {
        setTrackedPlan(
          await kryom().setAgentPlanStep({
            id: tracked.id,
            stepId: 'review',
            state: 'in_progress',
          })
        )
      } catch (e) {
        setProgressError(errorMessage(e))
      }
    } catch (e) {
      setProgressError(errorMessage(e))
      props.onStatus('Plan ready (progress tracking unavailable)')
    }
  }

  async function moveTrackedStep(
    stepId: string,
    state: KryomPlanStepState,
    detail?: string
  ): Promise<void> {
    if (!trackedPlan || trackedPlan.status !== 'active') {
      return
    }

    try {
      setTrackedPlan(
        await kryom().setAgentPlanStep({
          id: trackedPlan.id,
          stepId,
          state,
          ...(detail === undefined ? {} : { detail }),
        })
      )
    } catch (e) {
      setProgressError(errorMessage(e))
    }
  }

  async function cancelTrackedPlan(reason: string): Promise<void> {
    if (!trackedPlan || trackedPlan.status !== 'active') {
      return
    }

    try {
      setTrackedPlan(
        await kryom().cancelAgentPlanRecord({ id: trackedPlan.id, reason })
      )
    } catch (e) {
      setProgressError(errorMessage(e))
    }
  }

  function clearRound() {
    // A fresh plan supersedes any active repair cycle.
    if (repairCycle && !isRepairTerminal(repairCycle.state)) {
      kryom()
        .cancelRepairCycle({ cycleId: repairCycle.id })
        .catch(() => undefined)
    }

    setPlan(null)
    setTrackedPlan(null)
    setProgressError('')
    setApproved(new Set())
    setApplyResult(null)
    setStale(false)
    setOldContents({})
    setExpanded(new Set())
    setContextPreview(null)
    setVerifyOptions([])
    setVerifyCommand('')
    setVerifyResult(null)
    setVerifyError('')
    setRepairCycle(null)
    setRepairError('')
  }

  async function loadOldContents(next: KryomAgentPlan) {
    const loaded: Record<number, string> = {}

    for (const edit of next.edits) {
      if (edit.action !== 'modify') {
        continue
      }

      try {
        const meta = await kryom().readFileMeta(edit.path)
        loaded[edit.index ?? 0] = meta.content
      } catch {
        // Preview falls back to new content only; apply still validates.
      }
    }

    setOldContents(loaded)
  }

  async function requestPlan() {
    await requestPlanFor(task, researchSessionId)
  }

  async function requestPlanFor(taskText: string, researchId: string | null) {
    const trimmed = taskText.trim()

    if (!trimmed || planning || !props.workspaceRoot) {
      return
    }

    setStatus('inspecting')

    try {
      const aiStatus = await kryom().getAIStatus()

      if (!aiStatus.modelKeyConfigured) {
        setKeyMissing(true)
        setStatus('idle')
        props.onStatus('AI model is not configured')
        return
      }
    } catch {
      // Fall through to the planning path.
    }

    setPlanning(true)
    setError('')
    setKeyMissing(false)
    clearRound()

    const generation = opGenerationRef.current + 1
    opGenerationRef.current = generation
    const contextPaths = effectiveContextPaths()

    try {
      // Gather first so the user sees exactly which files would
      // reach the model before anything is transmitted.
      if (contextPaths.length > 0) {
        setStatus('gathering')

        const preview = await kryom().getAgentContext({
          paths: contextPaths,
        })

        if (generation !== opGenerationRef.current) {
          return
        }

        setContextPreview(preview)
      }

      setStatus('planning')

      const historyBlock =
        props.historyContext && props.historyContext.trim() !== ''
          ? `\n\n${HISTORY_BLOCK_MARKER}\n${props.historyContext}`
          : ''

      const next = await kryom().planAgentTask({
        task: `${trimmed}${historyBlock}`,
        model,
        ...(contextPaths.length > 0 ? { contextPaths } : {}),
        ...(researchId ? { researchSessionId: researchId } : {}),
        ...(includeChat ? { includeChat: true } : {}),
      })

      if (generation !== opGenerationRef.current) {
        return
      }

      setPlan(next)
      setApproved(new Set(next.edits.map((edit) => edit.index ?? 0)))
      setStatus('review')
      props.onStatus(
        `Agent plan ready: ${next.edits.length} edit(s), ${next.commands.length} command(s)`
      )

      await trackProposal(next)
      await loadOldContents(next)
    } catch (e) {
      if (generation !== opGenerationRef.current) {
        return
      }

      if (isCancelError(e)) {
        setStatus('cancelled')
        props.onStatus('Planning cancelled')
      } else {
        setStatus('failed')
        setError(errorMessage(e))
      }
    } finally {
      if (generation === opGenerationRef.current) {
        setPlanning(false)
      }
    }
  }

  // Agent verification runs carry the 'agent' origin, so Stop uses
  // the scoped agent cancel channel. The run then resolves
  // cancelled and records a cancelled report normally.
  function stopVerification() {
    if (!verifying) {
      return
    }

    kryom().cancelAgentVerification().catch(() => undefined)
  }

  function stopPlanning() {
    opGenerationRef.current += 1
    setPlanning(false)
    setStatus('cancelled')
    props.onStatus('Planning cancelled')
    kryom().cancelAgentPlan().catch(() => undefined)
  }

  function toggleApproval(index: number) {
    setApproved((previous) => {
      const next = new Set(previous)

      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }

      return next
    })
  }

  function toggleExpanded(index: number) {
    setExpanded((previous) => {
      const next = new Set(previous)

      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }

      return next
    })
  }

  async function applyApproved() {
    if (!plan || applying || approved.size === 0) {
      return
    }

    const edits = plan.edits.filter((edit) => approved.has(edit.index ?? 0))
    const pendingAttempt = repairAttemptId()
    const cycleForApply = repairCycle

    // Fresh change-set validation at apply time: dependencies may
    // have changed while the user reviewed. Blockers abort before
    // the confirm dialog; analysis failures fall back to plan
    // order since the apply path guards remain. Repair attempts
    // keep their verified path untouched.
    let ordered = edits
    let orderNote = ''

    if (!pendingAttempt && !cycleForApply) {
      try {
        const fresh = await kryom().buildAgentChangeSet({
          edits,
          baseline: changeSet,
        })

        setChangeSet(fresh)
        setChangeSetError('')

        if (!fresh.validation.ok) {
          setError(
            `Apply blocked by the change-set check: ${fresh.validation.blockers[0].reason}`
          )
          return
        }

        orderNote = ` ${fresh.orderReason}`
        ordered = orderEditsByManifest(edits, fresh.order)
      } catch (e: unknown) {
        setChangeSet(null)
        setChangeSetError(errorMessage(e))
      }
    }

    const confirmed = await dialogs.confirm({
      title: 'Apply agent edits?',
      message:
        `This writes ${approved.size} approved file change(s) to your ` +
        `project.${orderNote} The batch rolls back automatically if any edit fails.`,
      confirmLabel: 'Apply changes',
    })

    if (!confirmed) {
      return
    }

    setApplying(true)
    setError('')
    setStale(false)
    setStatus('applying')

    const generation = opGenerationRef.current + 1
    opGenerationRef.current = generation

    // Approval exits review and starts the apply step (evidence only).
    await moveTrackedStep('review', 'completed', 'User approved the plan.')
    await moveTrackedStep('apply', 'in_progress')

    try {
      let result: KryomAgentApplyResult

      if (pendingAttempt && cycleForApply) {
        const repaired = await kryom().applyRepairCycle({
          cycleId: cycleForApply.id,
          attemptId: pendingAttempt,
          edits,
          task,
        })

        if (generation !== opGenerationRef.current) {
          return
        }

        setRepairCycle(repaired.cycle)
        result = repaired.apply
      } else {
        result = await kryom().applyAgentEdits({ edits: ordered, task })
      }

      if (generation !== opGenerationRef.current) {
        return
      }

      setApplyResult(result)
      props.onFilesChanged(result.applied.map((entry) => entry.path))
      props.onApplyCompleted?.(
        result.applied.map((entry) => ({
          path: entry.path,
          action: entry.action,
        })),
        result.checkpoint && 'id' in result.checkpoint
          ? result.checkpoint.id
          : null
      )
      void refreshCheckpoints()

      if (result.completed) {
        setStatus('verifyApproval')
        props.onStatus(`Agent applied ${result.applied.length} edit(s)`)
        await loadVerifyOptions(plan)

        // A repair re-verifies the cycle's own check, not the
        // proposal's suggested commands.
        if (pendingAttempt && cycleForApply) {
          setVerifyCommand(cycleForApply.check)
        }

        if (trackedPlan && result.checkpoint && 'id' in result.checkpoint) {
          try {
            setTrackedPlan(
              await kryom().attachAgentPlanEvidence({
                id: trackedPlan.id,
                stepId: 'apply',
                evidence: {
                  kind: 'checkpoint',
                  ref: result.checkpoint.id,
                  summary: `${result.applied.length} edit(s) applied.`,
                },
              })
            )
          } catch (e) {
            setProgressError(errorMessage(e))
          }
        }

        // Change-set linkage (3B.6): the applied order joins the
        // apply-step evidence so later verification cites what ran
        // in which order. Evidence only, never a gate.
        if (trackedPlan && !pendingAttempt && orderNote) {
          try {
            setTrackedPlan(
              await kryom().attachAgentPlanEvidence({
                id: trackedPlan.id,
                stepId: 'apply',
                evidence: {
                  kind: 'note',
                  ref: `change-set@${new Date().toISOString()}`,
                  summary: (
                    `Change set: ${ordered.length} edit(s) applied in ` +
                    `dependency order (${ordered.map((edit) => baseName(edit.path)).join(', ')}).` +
                    orderNote
                  ).slice(0, 500),
                },
              })
            )
          } catch (e) {
            setProgressError(errorMessage(e))
          }
        }

        await moveTrackedStep(
          'apply',
          'completed',
          `${result.applied.length} edit(s) applied.`
        )
      } else if (result.cancelled) {
        setStatus('cancelled')
        props.onStatus(
          `Agent apply cancelled after ${result.applied.length} edit(s)` +
            (result.checkpoint && 'id' in result.checkpoint
              ? ' (checkpoint saved)'
              : '')
        )
        await cancelTrackedPlan('Apply cancelled by user.')
      } else if (result.failed) {
        setStatus('failed')

        // The pre-apply gate reports structured findings; message
        // sniffing stays only as a backstop for the per-edit race
        // check, which still throws the legacy wording.
        const gateBlocked = (result.stale ?? []).length > 0

        if (gateBlocked || /changed since the plan/i.test(result.failed.message)) {
          setStale(true)
          props.onStatus('Agent plan is stale; request a fresh plan')
          await moveTrackedStep(
            'apply',
            'blocked',
            (result.stale ?? [])
              .map((entry) => `${entry.path} (${entry.reason})`)
              .join('; ')
              .slice(0, 500) || result.failed.message
          )
        } else {
          props.onStatus('Agent apply failed and rolled back')
          await moveTrackedStep('apply', 'failed', result.failed.message)
        }
      }
    } catch (e) {
      if (generation !== opGenerationRef.current) {
        return
      }

      setStatus('failed')

      if (isStaleError(e)) {
        setStale(true)
      }

      setError(errorMessage(e))
    } finally {
      if (generation === opGenerationRef.current) {
        setApplying(false)
      }
    }
  }

  function stopApplying() {
    opGenerationRef.current += 1
    setApplying(false)
    setStatus('cancelled')
    props.onStatus('Agent apply cancelled')
    kryom().cancelAgentPlan().catch(() => undefined)
    void cancelTrackedPlan('Apply stopped by user.')
  }

  async function loadVerifyOptions(current: KryomAgentPlan) {
    const options = [...new Set(current.commands)]

    try {
      const summary = await kryom().getWorkspaceSummary()
      const scripts = Object.keys(summary.scripts)
        .slice(0, MAX_SCRIPTS)
        .map((name) => `npm run ${name}`)

      for (const script of scripts) {
        if (!options.includes(script)) {
          options.push(script)
        }
      }
    } catch {
      // Script suggestions are a convenience; plan commands and a
      // custom command still work without them.
    }

    setVerifyOptions(options)
    setVerifyCommand(options[0] ?? '')
  }

  async function runVerification() {
    const command = verifyCommand.trim()

    if (!command || verifying || !props.workspaceRoot) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Run project check?',
      message:
        `This executes exactly:\n${command}\n\n` +
        `Working directory:\n${props.workspaceRoot}`,
      confirmLabel: 'Run check',
    })

    if (!confirmed) {
      return
    }

    setVerifying(true)
    setVerifyError('')
    setVerifyResult(null)
    setStatus('verifying')
    props.onStatus('Verification running…')
    await moveTrackedStep('verify', 'in_progress')

    try {
      const result = await kryom().runDiagnostics({ command, source: 'agent' })

      setVerifyResult(result)

      const recordId = repairRecordId()
      const cycleForRecord = repairCycle

      if (recordId && cycleForRecord && trackedPlan) {
        let cycle: KryomRepairCycle = cycleForRecord

        try {
          const recorded = await kryom().recordRepairCycle({
            cycleId: cycleForRecord.id,
            attemptId: recordId,
            executionRunId: result.diagnosis.runId,
          })

          cycle = recorded.cycle

          setRepairCycle(recorded.cycle)
          setTrackedPlan(recorded.plan)

          // Steps move only on terminal cycle states: failed→verified
          // is an illegal transition, so a mid-cycle failure must not
          // mark the step failed while attempt two is still open.
          if (isRepairTerminal(recorded.cycle.state)) {
            await moveTrackedStep(
              'verify',
              recorded.cycle.state === 'passed' ? 'verified' : 'failed',
              `Repair cycle ${recorded.cycle.state}: ${recorded.cycle.detail}`
            )
          }
        } catch (e) {
          setProgressError(errorMessage(e))
        }

        if (cycle.state === 'passed') {
          setStatus('succeeded')
          props.onStatus(`Repair passed (exit ${result.exitCode})`)

          try {
            setTrackedPlan(
              await kryom().completeAgentPlan({ id: trackedPlan.id })
            )
          } catch {
            // Stays active; the progress section offers completion.
          }
        } else if (cycle.state === 'awaiting-proposal') {
          setStatus('failed')
          props.onStatus(
            `Check failed (exit ${result.exitCode}); repair attempt ` +
              `${cycle.attempts.length + 1} of 2 available`
          )
        } else {
          setStatus('failed')
          props.onStatus(`Repair ${cycle.state}: ${cycle.detail}`)
        }

        return
      }

      if (trackedPlan) {
        try {
          const recorded = await kryom().recordAgentVerification({
            planId: trackedPlan.id,
            stepId: 'verify',
            check: command,
            result: result.success ? 'pass' : result.timedOut || result.cancelled ? 'error' : 'fail',
            executionRunId: result.diagnosis.runId,
            markStep: result.success ? 'verified' : 'failed',
          })

          setTrackedPlan(recorded.plan)
        } catch (e) {
          setProgressError(errorMessage(e))
        }
      }

      if (result.success) {
        setStatus('succeeded')
        props.onStatus(`Check passed (exit ${result.exitCode})`)

        if (trackedPlan) {
          // Best-effort completion: open task steps keep the plan
          // active until the user finishes them explicitly.
          try {
            setTrackedPlan(
              await kryom().completeAgentPlan({ id: trackedPlan.id })
            )
          } catch {
            // Stays active; the progress section offers completion.
          }
        }
      } else {
        setStatus('failed')
        props.onStatus(
          result.timedOut
            ? 'Check timed out'
            : result.cancelled
              ? 'Check cancelled'
              : `Check failed (exit ${result.exitCode})`
        )
      }
    } catch (e) {
      setStatus('failed')
      setVerifyError(errorMessage(e))

      if (trackedPlan) {
        try {
          // The check never executed: record the blockage with its
          // reason instead of manufacturing an outcome.
          const recorded = await kryom().recordAgentVerification({
            planId: trackedPlan.id,
            stepId: 'verify',
            check: command,
            result: 'error',
            output: errorMessage(e),
            markStep: 'blocked',
          })

          setTrackedPlan(recorded.plan)
        } catch (progress) {
          setProgressError(errorMessage(progress))
        }
      }
    } finally {
      setVerifying(false)
    }
  }

  async function skipVerification(): Promise<void> {
    const command = verifyCommand.trim()

    if (!command || !trackedPlan || busy) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Skip this check?',
      message:
        `No command runs. The plan records "${command}" as skipped, ` +
        `which never counts as verification.`,
      confirmLabel: 'Skip check',
    })

    if (!confirmed) {
      return
    }

    try {
      const recorded = await kryom().recordAgentVerification({
        planId: trackedPlan.id,
        stepId: 'verify',
        check: command,
        result: 'skip',
        output: 'Skipped by the user without running.',
      })

      setTrackedPlan(recorded.plan)
      props.onStatus('Check skipped (not verified)')
    } catch (e) {
      setProgressError(errorMessage(e))
    }
  }

  function repairAttemptId(): string | null {
    if (repairCycle?.state !== 'awaiting-approval') {
      return null
    }

    const last = repairCycle.attempts[repairCycle.attempts.length - 1]

    return last ? last.attemptId : null
  }

  function repairRecordId(): string | null {
    if (repairCycle?.state !== 'awaiting-verification') {
      return null
    }

    const last = repairCycle.attempts[repairCycle.attempts.length - 1]

    return last ? last.attemptId : null
  }

  async function showRepairProposal(
    cycle: KryomRepairCycle,
    proposal: KryomAgentPlan,
    generation: number
  ): Promise<void> {
    if (generation !== opGenerationRef.current) {
      return
    }

    setRepairCycle(cycle)
    setPlan(proposal)
    setApproved(new Set(proposal.edits.map((edit) => edit.index ?? 0)))
    setApplyResult(null)
    setStale(false)
    setStatus('review')
    props.onStatus(
      `Repair proposal ready: ${proposal.edits.length} edit(s) awaiting review`
    )

    await loadOldContents(proposal)
  }

  async function runProposal(cycleId: string, generation: number): Promise<void> {
    try {
      const { cycle, proposal } = await kryom().proposeRepairCycle({ cycleId })

      await showRepairProposal(cycle, proposal, generation)
    } catch (e) {
      if (generation !== opGenerationRef.current) {
        return
      }

      setRepairError(errorMessage(e))

      try {
        const { cycle } = await kryom().getRepairCycle({ cycleId })

        setRepairCycle(cycle)
      } catch {
        // The cycle read is best-effort; the error above stands.
      }
    }
  }

  async function requestRepairProposal(cycleId: string): Promise<void> {
    if (repairBusy) {
      return
    }

    setRepairBusy(true)
    setRepairError('')

    const generation = opGenerationRef.current + 1
    opGenerationRef.current = generation

    try {
      await runProposal(cycleId, generation)
    } finally {
      if (generation === opGenerationRef.current) {
        setRepairBusy(false)
      }
    }
  }

  async function startRepair(): Promise<void> {
    const command = verifyCommand.trim()

    if (
      !trackedPlan ||
      !verifyResult ||
      verifyResult.success ||
      !command ||
      repairBusy ||
      (repairCycle && !isRepairTerminal(repairCycle.state))
    ) {
      return
    }

    setRepairBusy(true)
    setRepairError('')

    const generation = opGenerationRef.current + 1
    opGenerationRef.current = generation

    try {
      const { cycle } = await kryom().startRepairCycle({
        planId: trackedPlan.id,
        check: command,
        diagnosis: verifyResult.diagnosis,
      })

      if (generation !== opGenerationRef.current) {
        return
      }

      setRepairCycle(cycle)

      // Chain straight into the first proposal: one user gesture,
      // with the cap and deadline still enforced server-side.
      await runProposal(cycle.id, generation)
    } catch (e) {
      if (generation !== opGenerationRef.current) {
        return
      }

      setRepairError(errorMessage(e))
    } finally {
      if (generation === opGenerationRef.current) {
        setRepairBusy(false)
      }
    }
  }

  async function denyRepair(): Promise<void> {
    if (!repairCycle || repairBusy) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Deny this repair?',
      message:
        'The repair cycle stops with reason approval-denied. ' +
        'No further attempts will be proposed.',
      confirmLabel: 'Deny repair',
      danger: true,
    })

    if (!confirmed) {
      return
    }

    setRepairBusy(true)
    setRepairError('')

    try {
      const { cycle } = await kryom().cancelRepairCycle({
        cycleId: repairCycle.id,
        reason: 'approval-denied',
      })

      setRepairCycle(cycle)
      props.onStatus('Repair denied by user')
    } catch (e) {
      setRepairError(errorMessage(e))
    } finally {
      setRepairBusy(false)
    }
  }

  async function cancelRepairUi(): Promise<void> {
    if (!repairCycle || repairBusy) {
      return
    }

    setRepairBusy(true)
    setRepairError('')

    try {
      const { cycle } = await kryom().cancelRepairCycle({
        cycleId: repairCycle.id,
      })

      setRepairCycle(cycle)
      props.onStatus('Repair cycle cancelled')
    } catch (e) {
      setRepairError(errorMessage(e))
    } finally {
      setRepairBusy(false)
    }
  }

  function reset() {
    // A reset abandons the panel, so an active backend cycle is
    // cancelled best-effort rather than left idling to expiry.
    if (repairCycle && !isRepairTerminal(repairCycle.state)) {
      kryom()
        .cancelRepairCycle({ cycleId: repairCycle.id })
        .catch(() => undefined)
    }

    setPlan(null)
    setApproved(new Set())
    setApplyResult(null)
    setStale(false)
    setError('')
    setOldContents({})
    setExpanded(new Set())
    setResearchSessionId(null)
    setContextPreview(null)
    setVerifyOptions([])
    setVerifyCommand('')
    setVerifyResult(null)
    setVerifyError('')
    setRepairCycle(null)
    setRepairError('')
    setStatus('idle')
  }

  async function copyCommand(command: string, index: number) {
    try {
      if (!(await copyText(command))) throw new Error('clipboard write failed')
      setCopied(index)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setError('Copy is unavailable in this context.')
    }
  }

  const busy = planning || applying || verifying || repairBusy
  const contextCount =
    (includeActive && props.activeFile ? 1 : 0) + selectedFiles.length
  const planTaskSplit = plan ? splitHistoryBlock(plan.task) : null

  return (
    <section className="agent-panel agent-docked">
      <div className="ai-heading">
        <div>
          <strong>Coding agent</strong>
          <div className="muted">Plans only · you approve every change</div>
        </div>
        {plan && (
          <button onClick={reset} disabled={busy}>
            New task
          </button>
        )}
      </div>

      {status !== 'idle' && (
        <p className="muted padded" role="status">
          Status: {STATUS_LABELS[status]}
          {status === 'review' &&
          repairCycle?.state === 'awaiting-approval'
            ? ` (repair attempt ${repairCycle.attempts.length} of 2)`
            : ''}
        </p>
      )}

      {!props.workspaceRoot ? (
        <p className="muted padded">Open a project to plan coding tasks.</p>
      ) : (
        <>
          <div className="agent-toolbar">
            <label className="agent-model">
              Model
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                disabled={busy}
                aria-label="Agent model"
              >
                {MODELS.map((id) => (
                  <option key={id} value={id}>
                    {id === 'muse-spark-1.3' ? 'Muse Spark 1.3' : 'Muse Wonder 1.0'}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen((open) => !open)}
              title="Show or hide the project context picker"
            >
              {contextOpen ? '▾' : '▸'} Context · {contextCount} selected
            </button>
          </div>

          <div className="agent-scroll">
            {contextOpen && (
              <div className="agent-context">
          <label
            className="context-toggle"
            title="Reads the active file in the main process and sends its contents with the task"
          >
            <input
              type="checkbox"
              checked={includeActive}
              onChange={(event) => setIncludeActive(event.target.checked)}
              disabled={busy || !props.activeFile}
            />
            Include active file
          </label>

          <label
            className="context-toggle"
            title="Reads recent chat history in the main process and sends an excerpt with the task"
          >
            <input
              type="checkbox"
              checked={includeChat}
              onChange={(event) => {
                const checked = event.target.checked

                setIncludeChat(checked)
                setChatExcerpt(null)
                setChatExcerptError('')

                if (checked) {
                  kryom()
                    .getAgentChatExcerpt()
                    .then(setChatExcerpt)
                    .catch((e: unknown) => {
                      setChatExcerptError(errorMessage(e))
                      setIncludeChat(false)
                    })
                }
              }}
              disabled={busy}
            />
            Include recent chat
          </label>

          {includeChat && chatExcerpt && !plan && (
            <div className="context-file">
              <p>
                Chat context: {chatExcerpt.messageCount} message(s),{' '}
                {formatBytes(chatExcerpt.chars)}
                {chatExcerpt.truncated ? ' (truncated)' : ''}
              </p>
            </div>
          )}

          {chatExcerptError && !plan && (
            <p className="muted padded" role="alert">
              {chatExcerptError}
            </p>
          )}

          <div className="context-file">
            {props.activeFile
              ? `Active: ${baseName(props.activeFile)}`
              : 'No active file.'}
            {includeActive && props.activeFile && props.activeFileDirty
              ? ' Unsaved edits are NOT included — save first to ground on them.'
              : ''}
          </div>

          <form
            className="agent-composer"
            onSubmit={(event) => void searchProjectFiles(event)}
          >
            <input
              aria-label="Find project files to include"
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="Find project files to include, e.g. login…"
              maxLength={200}
              disabled={busy}
            />
            <div className="composer-footer">
              <span className="muted">{contextCount} file(s) selected</span>
              <button type="submit" disabled={busy || !fileQuery.trim()}>
                {searching ? 'Searching…' : 'Search'}
              </button>
            </div>
          </form>

          {searchError && (
            <p className="muted padded" role="alert">
              Search failed: {searchError}
            </p>
          )}

          {fileResults.length > 0 && (
            <div className="plan-commands">
              <strong>Matching files</strong>
              {fileResults.map((match) => (
                <div key={match.path} className="command-row">
                  <code title={match.path}>{match.relativePath}</code>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => addSelectedFile(match.path)}
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="plan-commands">
              <strong>Selected files</strong>
              {selectedFiles.map((file) => (
                <div key={file} className="command-row">
                  <code title={file}>{baseName(file)}</code>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => removeSelectedFile(file)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

              </div>
            )}

          {error && (
            <div className="ai-error" role="alert">
              <strong>Agent request failed</strong>
              <p>{error}</p>
              <button onClick={() => setError('')} className="secondary-button">
                Dismiss
              </button>
            </div>
          )}

          {keyMissing && !planning && (
            <AiKeyNotice onOpenConnections={props.onOpenConnections} />
          )}

          {researchSessionId && !plan && (
            <p className="muted padded">
              Research brief attached: {researchSessionId}
            </p>
          )}

          {props.historyContext && !plan && (
            <p className="muted padded">
              Selected history attached: {props.historyContext.length}{' '}
              chars will ground the plan.
            </p>
          )}

          {contextPreview && !plan && (
            <div className="context-file">
              <p>
                Model context: {contextPreview.files.length} file(s),{' '}
                {formatBytes(contextPreview.totalBytes)}
                {contextPreview.files.length > 0
                  ? `: ${contextPreview.files
                      .map((file) => file.relativePath)
                      .join(', ')}`
                  : ''}
              </p>
              {contextPreview.excluded.map((entry) => (
                <p key={entry.path} className="muted">
                  Excluded {baseName(entry.path)}: {entry.reason}
                </p>
              ))}
            </div>
          )}

          {plan && (
            <div className="plan-view">
              <p className="plan-task">
                <span className="muted">Task: </span>
                {planTaskSplit?.head ?? plan.task}
                {planTaskSplit && planTaskSplit.historyChars > 0 && (
                  <span className="muted">
                    {' '}
                    (plus {planTaskSplit.historyChars} chars of selected
                    history)
                  </span>
                )}
              </p>
              <p className="muted padded">
                Model: {plan.model} · {plan.edits.length} proposed edit(s)
                {plan.researchSessionId
                  ? ` · research ${plan.researchSessionId}`
                  : ''}
              </p>

              <p className="muted padded">
                Grounded in {plan.contextFiles.length} file(s)
                {plan.contextFiles.length > 0
                  ? `: ${plan.contextFiles
                      .map((file) => file.relativePath)
                      .join(', ')}`
                  : ' (project summary only)'}
                {plan.contextExcluded.length > 0
                  ? ` · ${plan.contextExcluded.length} excluded`
                  : ''}
              </p>

              <ContextSnapshotView
                snapshot={trackedPlan?.context ?? plan.contextSnapshot ?? null}
                live={trackedPlan?.context != null}
              />

              {plan.notes && <p className="plan-notes">{plan.notes}</p>}

              {plan.expectedOutcome && (
                <p className="plan-notes">
                  <strong>Expected outcome:</strong> {plan.expectedOutcome}
                </p>
              )}

              {(plan.risks ?? []).length > 0 && (
                <div className="plan-risks">
                  <strong>Risks</strong>
                  <ul>
                    {(plan.risks ?? []).map((risk, index) => (
                      <li key={index}>
                        <span className={`risk-severity risk-${risk.severity}`}>
                          {risk.severity}
                        </span>{' '}
                        {risk.explanation}{' '}
                        <span className="muted">
                          Mitigation: {risk.mitigation}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.edits.length === 0 && (
                <p className="muted padded">The plan proposes no file edits.</p>
              )}

              {plan.edits.map((edit) => {
                const key = edit.index ?? 0
                const checked = approved.has(key)
                const fullPreview = edit.preview ?? edit.content ?? ''
                const showAll = expanded.has(key)

                return (
                  <div key={key} className="plan-edit">
                    <label className="plan-edit-head">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleApproval(key)}
                        disabled={applying}
                        aria-label={`Approve ${edit.action} ${edit.path}`}
                      />
                      <span className={`action-badge action-${edit.action}`}>
                        {edit.action.toUpperCase()}
                      </span>
                      <span className="plan-path" title={edit.path}>
                        {baseName(edit.path)}
                      </span>
                      {edit.originalDigest && (
                        <span
                          className="muted"
                          title="Snapshot of the original file; apply rejects stale plans"
                        >
                          @{edit.originalDigest.slice(0, 8)}
                        </span>
                      )}
                      {edit.action !== 'create' && props.onOpenFile && (
                        <button
                          type="button"
                          className="mini-btn"
                          title="Open the current file in the editor"
                          onClick={(event) => {
                            // The head is a label: stop the click from
                            // toggling approval.
                            event.preventDefault()
                            event.stopPropagation()
                            props.onOpenFile?.(edit.path)
                          }}
                        >
                          Open
                        </button>
                      )}
                    </label>

                    {edit.reason && (
                      <p className="plan-notes">Why: {edit.reason}</p>
                    )}

                    {edit.action === 'delete' ? (
                      <p className="delete-warning">
                        This file will be deleted if you approve this edit.
                      </p>
                    ) : edit.action === 'modify' && oldContents[key] !== undefined ? (
                      <DiffView
                        oldText={oldContents[key]}
                        newText={edit.content ?? ''}
                      />
                    ) : (
                      <>
                        <pre className="plan-preview">
                          {showAll
                            ? fullPreview.slice(0, 20000)
                            : fullPreview.slice(0, 2000)}
                        </pre>
                        {fullPreview.length > 2000 && (
                          <button
                            type="button"
                            className="mini-btn"
                            onClick={() => toggleExpanded(key)}
                          >
                            {showAll
                              ? 'Show less'
                              : `Show full preview (${fullPreview.length} chars)`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              })}

              {approved.size > 0 && !applyResult?.completed && (
                <div className="plan-commands">
                  <strong>Change set (dependency analysis)</strong>
                  {changeSetLoading && (
                    <p className="muted">Analyzing dependencies…</p>
                  )}
                  {changeSetError && (
                    <p className="muted">
                      Change-set analysis unavailable: {changeSetError}{' '}
                      Applying in plan order; approval and safety checks
                      still apply.
                    </p>
                  )}
                  {changeSet && (
                    <>
                      <p className="muted">{changeSet.orderReason}</p>
                      {changeSet.validation.blockers.map((blocker, index) => (
                        <p key={index} role="alert">
                          Blocked: {blocker.reason}
                        </p>
                      ))}
                      {changeSet.order.length > 1 && (
                        <p className="muted">
                          Apply order:{' '}
                          {changeSet.order
                            .map((index) => {
                              const target = changeSet.targets.find(
                                (entry) => entry.index === index
                              )

                              return target ? baseName(target.path) : `#${index}`
                            })
                            .join(' → ')}
                        </p>
                      )}
                      {changeSet.reviewGroups.map((group, index) => (
                        <p key={index} className="muted">
                          Review together:{' '}
                          {group.files.map(baseName).join(', ')}
                        </p>
                      ))}
                      {changeSet.cycles.length > 0 && (
                        <p className="muted">
                          {changeSet.cycles.length} import cycle(s);
                          cyclic members keep plan order.
                        </p>
                      )}
                      {(changeSet.totalUnresolved > 0 ||
                        changeSet.totalUnknown > 0) && (
                        <p className="muted">
                          {changeSet.totalUnresolved} unresolved,{' '}
                          {changeSet.totalUnknown} unknown,{' '}
                          {changeSet.totalExternals} external import(s)
                          — plan order kept where facts are missing.
                        </p>
                      )}
                      {changeSet.validation.warnings
                        .slice(0, 5)
                        .map((warning, index) => (
                          <p key={index} className="muted">
                            Note: {warning.reason}
                          </p>
                        ))}
                    </>
                  )}
                </div>
              )}

              <div className="plan-commands">
                <strong>Proposed commands (never executed automatically)</strong>

                {plan.commands.length === 0 ? (
                  <p className="muted">No commands proposed.</p>
                ) : (
                  plan.commands.map((command, index) => (
                    <div key={index} className="command-row">
                      <code>{command}</code>
                      <button
                        className="secondary-button"
                        onClick={() => void copyCommand(command, index)}
                      >
                        {copied === index ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="composer-footer padded">
                <span className="muted">
                  {approved.size} of {plan.edits.length} approved
                </span>
                <button
                  className="primary-button"
                  onClick={() => void applyApproved()}
                  disabled={
                    applying ||
                    approved.size === 0 ||
                    (changeSet !== null && !changeSet.validation.ok)
                  }
                  title={
                    changeSet !== null && !changeSet.validation.ok
                      ? 'Resolve change-set blockers first (deselect a conflicting edit).'
                      : undefined
                  }
                >
                  {applying ? 'Applying…' : 'Apply approved edits'}
                </button>
                {applying && (
                  <button type="button" onClick={stopApplying}>
                    Stop
                  </button>
                )}
                {repairAttemptId() && !applying && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy || repairBusy}
                    onClick={() => void denyRepair()}
                  >
                    Deny repair
                  </button>
                )}
              </div>

              {applyResult && (
                <div className="apply-result" role="status">
                  {applyResult.completed ? (
                    <>
                      <p>Applied {applyResult.applied.length} edit(s).</p>

                      {applyResult.checkpoint && 'id' in applyResult.checkpoint && (
                        <p className="muted">
                          Checkpoint saved ({applyResult.checkpoint.files}{' '}
                          file(s)).
                        </p>
                      )}
                    </>
                  ) : applyResult.cancelled ? (
                    <>
                      <p>
                        <strong>
                          Apply cancelled after {applyResult.applied.length}{' '}
                          edit(s).
                        </strong>
                      </p>
                      <p className="muted">
                        Applied edits were kept
                        {applyResult.checkpoint &&
                        'id' in applyResult.checkpoint
                          ? ' and checkpointed; undo them from Checkpoints.'
                          : '.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>Apply did not complete.</strong>
                      </p>
                      {applyResult.failed && <p>{applyResult.failed.message}</p>}
                      {(applyResult.stale ?? []).length > 0 && (
                        <ul>
                          {(applyResult.stale ?? []).map((entry) => (
                            <li key={`${entry.index}-${entry.path}`}>
                              <strong>{entry.path}</strong> — {entry.status}:{' '}
                              {entry.reason}
                            </li>
                          ))}
                        </ul>
                      )}
                      {(applyResult.conflicts ?? []).length > 0 && (
                        <ul>
                          {(applyResult.conflicts ?? []).map((entry) => (
                            <li key={entry.path}>
                              <strong>{entry.path}</strong> — conflicting
                              edits {entry.indexes.join(', ')}; approve
                              only one.
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="muted">
                        {(applyResult.stale ?? []).length > 0 ||
                        (applyResult.conflicts ?? []).length > 0
                          ? 'Nothing was written; the plan and its evidence are preserved.'
                          : applyResult.rolledBack
                            ? 'All changes were rolled back.'
                            : 'No changes were rolled back.'}
                      </p>
                      {stale && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={busy}
                          onClick={() => void requestPlanFor(task, researchSessionId)}
                        >
                          Plan again with current files
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {checkpoints.length > 0 && (
                <div className="plan-commands">
                  <strong>Checkpoints (undo previous applies)</strong>

                  {checkpoints.map((entry) => (
                    <div key={entry.id} className="composer-footer">
                      <span className="muted">
                        {entry.files} file(s)
                        {entry.task ? ` — ${entry.task.slice(0, 80)}` : ''}{' '}
                        ({new Date(entry.createdAt).toLocaleString()})
                      </span>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={undoing}
                        onClick={() => void undoApply(entry.id)}
                      >
                        {undoing ? 'Undoing…' : 'Undo'}
                      </button>
                    </div>
                  ))}

                  {undoError !== '' && <p>{undoError}</p>}

                  {undoResult && (
                    <div role="status">
                      <p>
                        Restored {undoResult.restored.length}, skipped{' '}
                        {undoResult.skipped.length}, failed{' '}
                        {undoResult.failures.length}.
                      </p>

                      {undoResult.skipped.map((entry) => (
                        <p key={entry.path} className="muted">
                          Kept {displayUndoPath(entry.path)}: {entry.reason}.
                        </p>
                      ))}

                      {undoResult.failures.map((entry) => (
                        <p key={entry.path}>
                          {displayUndoPath(entry.path)}: {entry.reason}.
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {trackedPlan && (
                <div className="plan-progress">
                  <strong>
                    Plan progress · {trackedPlan.status} · verification:{' '}
                    {trackedPlan.verification}
                  </strong>

                  {progressError && (
                    <p role="alert">Progress update failed: {progressError}</p>
                  )}

                  <ul className="plan-steps">
                    {trackedPlan.steps.map((step) => (
                      <li key={step.id} className={`plan-step plan-step-${step.state}`}>
                        <span className="plan-step-head">
                          <span>{step.label}</span>{' '}
                          <span className="muted">({step.state.replace('_', ' ')})</span>
                          {step.interrupted && (
                            <span className="plan-interrupted">
                              interrupted — work stopped here
                            </span>
                          )}
                        </span>
                        {step.detail && <p className="muted">{step.detail}</p>}
                        {step.evidence.length > 0 && (
                          <p className="muted">
                            Evidence:{' '}
                            {step.evidence
                              .map((item) => `${item.kind}:${item.ref.slice(0, 12)}`)
                              .join(', ')}
                          </p>
                        )}
                        {trackedPlan.status === 'active' && (
                          <span className="plan-step-actions">
                            {step.interrupted && (
                              <>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => {
                                    kryom()
                                      .resumeAgentPlan({ id: trackedPlan.id })
                                      .then(setTrackedPlan)
                                      .catch((e: unknown) =>
                                        setProgressError(errorMessage(e))
                                      )
                                  }}
                                >
                                  Resume
                                </button>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() =>
                                    void moveTrackedStep(
                                      step.id,
                                      'blocked',
                                      'Interrupted; awaiting review.'
                                    )
                                  }
                                >
                                  Mark blocked
                                </button>
                              </>
                            )}
                            {!step.interrupted && step.kind === 'task' && step.state === 'pending' && (
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => void moveTrackedStep(step.id, 'in_progress')}
                              >
                                Start
                              </button>
                            )}
                            {!step.interrupted &&
                              step.kind === 'task' &&
                              step.state === 'in_progress' && (
                                <>
                                  <button
                                    type="button"
                                    className="mini-btn"
                                    onClick={() => void moveTrackedStep(step.id, 'completed')}
                                  >
                                    Complete
                                  </button>
                                  <button
                                    type="button"
                                    className="mini-btn"
                                    onClick={() => void moveTrackedStep(step.id, 'blocked')}
                                  >
                                    Block
                                  </button>
                                </>
                              )}
                            {!step.interrupted && step.state === 'blocked' && (
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => void moveTrackedStep(step.id, 'in_progress')}
                              >
                                Resume
                              </button>
                            )}
                            {!step.interrupted && step.state === 'failed' && step.kind === 'task' && (
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => void moveTrackedStep(step.id, 'in_progress')}
                              >
                                Retry
                              </button>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {trackedPlan.reports.length > 0 && (
                    <>
                      <strong>Verification reports</strong>
                      <ul className="plan-reports">
                        {trackedPlan.reports.map((report) => (
                          <li key={report.id}>
                            <span>
                              <strong>{report.check}</strong>: Status{' '}
                              <strong>{report.conclusion}</strong>
                            </span>{' '}
                            <span className="muted">
                              {new Date(report.at).toLocaleString()}
                            </span>
                            {report.execution ? (
                              <p className="muted">
                                Executed: {report.execution.command} · exit{' '}
                                {report.execution.exitCode}
                                {report.execution.timedOut
                                  ? ' · timed out'
                                  : ''}
                                {report.execution.cancelled
                                  ? ' · cancelled'
                                  : ''}{' '}
                                · {(report.execution.durationMs / 1000).toFixed(1)}s
                                {' · '}run {report.execution.runId}
                              </p>
                            ) : (
                              <p className="muted">
                                Not executed — {report.conclusion}
                                {report.legacyProvenance
                                  ? ' (unverified claim: recorded before execution tracking; provenance unverified)'
                                  : ` (stated reason: ${report.outputSummary.slice(0, 200)})`}
                              </p>
                            )}
                            {report.outputSummary &&
                              report.execution !== null && (
                                <pre className="plan-preview">
                                  {report.outputSummary.slice(0, 1000)}
                                  {report.outputSummary.length > 1000
                                    ? '… (truncated)'
                                    : ''}
                                </pre>
                              )}
                            {report.diagnosis && (
                              <p className="muted">
                                Observed evidence — diagnosis:{' '}
                                {report.diagnosis.summary} (
                                {report.diagnosis.findings.length} finding(s),
                                run {report.diagnosis.runId})
                              </p>
                            )}
                            {report.diagnosis?.findings.map((finding) => (
                              <p key={finding.id} className="muted">
                                <strong>{finding.category}</strong> (
                                {finding.confidence} confidence):{' '}
                                {finding.summary}
                              </p>
                            ))}
                            {report.modelExplanation ? (
                              <p className="muted">
                                Model explanation (AI-generated, not
                                evidence): {report.modelExplanation.summary}
                                {report.modelExplanation.failureAnalysis
                                  ? ` Analysis: ${report.modelExplanation.failureAnalysis}`
                                  : ''}
                                {report.modelExplanation.suggestedNextSteps
                                  ? ` Next: ${report.modelExplanation.suggestedNextSteps}`
                                  : ''}
                              </p>
                            ) : (
                              <p className="muted">
                                No model explanation recorded.
                              </p>
                            )}
                            {report.repair && (
                              <p className="muted">
                                Repair attempt {report.repair.attempt} of
                                cycle {report.repair.cycleId}
                                {report.repair.checkpointId
                                  ? ` · checkpoint ${report.repair.checkpointId}`
                                  : ''}
                                {report.repair.appliedFiles.length > 0
                                  ? ` · changed: ${report.repair.appliedFiles.join(', ')}`
                                  : ''}
                              </p>
                            )}
                            <p className="muted">
                              Shell check (no live AI verification)
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {trackedPlan.status === 'active' && (
                    <div className="composer-footer">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          kryom()
                            .completeAgentPlan({ id: trackedPlan.id })
                            .then(setTrackedPlan)
                            .catch((e: unknown) =>
                              setProgressError(errorMessage(e))
                            )
                        }}
                      >
                        Complete plan
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          void dialogs
                            .confirm({
                              title: 'Cancel plan?',
                              message:
                                'This marks every open step cancelled. Applied edits stay on disk.',
                              confirmLabel: 'Cancel plan',
                              danger: true,
                            })
                            .then((confirmed) => {
                              if (confirmed) {
                                void cancelTrackedPlan('Cancelled by user.')
                              }
                            })
                        }}
                      >
                        Cancel plan
                      </button>
                    </div>
                  )}
                </div>
              )}

              {applyResult?.completed && (
                <div className="plan-commands">
                  <strong>Verification (never runs automatically)</strong>
                  <p className="muted">
                    Working directory: {props.workspaceRoot}
                  </p>

                  {verifyOptions.map((option) => (
                    <label key={option} className="command-row">
                      <input
                        type="radio"
                        name="verify-command"
                        checked={verifyCommand === option}
                        disabled={verifying}
                        onChange={() => setVerifyCommand(option)}
                      />
                      <code>{option}</code>
                    </label>
                  ))}

                  <input
                    aria-label="Custom verification command"
                    value={verifyCommand}
                    onChange={(event) => setVerifyCommand(event.target.value)}
                    placeholder="Custom command, e.g. npm test…"
                    maxLength={2000}
                    disabled={verifying}
                  />

                  <div className="composer-footer">
                    <span className="muted">
                      {verifyCommand.trim()
                        ? `Will run: ${verifyCommand.trim()}`
                        : 'Pick or type a check first.'}
                    </span>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={verifying || !verifyCommand.trim()}
                      onClick={() => void runVerification()}
                    >
                      {verifying ? 'Running…' : 'Run check'}
                    </button>
                    {verifying && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void stopVerification()}
                        title="Stops the running check (same shared cancel as the terminal panel)."
                      >
                        Stop
                      </button>
                    )}
                    {trackedPlan && !verifying && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void skipVerification()}
                      >
                        Skip check
                      </button>
                    )}
                  </div>

                  {verifyError && (
                    <p role="alert">Verification failed: {verifyError}</p>
                  )}

                  {verifyResult && (
                    <div className="apply-result" role="status">
                      <p>
                        <strong>
                          {verifyResult.success
                            ? 'Check passed.'
                            : verifyResult.timedOut
                              ? 'Check timed out.'
                              : verifyResult.cancelled
                                ? 'Check cancelled.'
                                : 'Check failed.'}
                        </strong>{' '}
                        Exit code: {verifyResult.exitCode}
                        {verifyResult.timedOut ? ' (timed out)' : ''}
                        {verifyResult.cancelled ? ' (cancelled)' : ''}
                        {verifyResult.outputLimited ? ' · output truncated' : ''}
                        {' · '}
                        {verifyResult.diagnostics.length} problem(s)
                      </p>
                      <p className="muted">
                        {verifyResult.diagnosis.summary} Runner:{' '}
                        {verifyResult.diagnosis.runner} ·{' '}
                        {(verifyResult.durationMs / 1000).toFixed(1)}s ·{' '}
                        {verifyResult.diagnosis.provenance === 'executed'
                          ? 'actually executed'
                          : 'mocked result'}
                      </p>
                      {verifyResult.diagnosis.findings.map((finding) => (
                        <p key={finding.id} className="muted">
                          <strong>{finding.category}</strong> (
                          {finding.confidence} confidence)
                          {finding.test ? ` — ${finding.test}` : ''}
                          {finding.file
                            ? ` — ${finding.file}:${finding.line ?? '?'}`
                            : ''}
                          : {finding.summary}
                        </p>
                      ))}
                      {verifyResult.warnings.map((warning) => (
                        <p key={warning} className="muted">
                          Warning: {warning}
                        </p>
                      ))}
                      <pre className="plan-preview">
                        {verifyResult.output.slice(0, MAX_OUTPUT_CHARS)}
                      </pre>
                      {verifyResult.diagnostics.slice(0, 10).map((diagnostic, index) => (
                        <p key={index} className="muted">
                          {diagnostic.file}:{diagnostic.line} {diagnostic.severity}:{' '}
                          {diagnostic.message}
                        </p>
                      ))}
                      {!verifyResult.success && trackedPlan && (
                        <>
                          {repairError !== '' && (
                            <p role="alert">Repair failed: {repairError}</p>
                          )}

                          {repairCycle && (
                            <p className="muted">
                              Repair cycle {repairCycle.state}
                              {repairCycle.interrupted
                                ? ' (interrupted — cancel it or start a new cycle)'
                                : ''}
                              {' · '}attempt {repairCycle.attempts.length} of
                              2 · {repairCycle.remainingAttempts} remaining
                              {' · '}elapsed{' '}
                              {formatRepairMs(repairCycle.elapsedMs)} of{' '}
                              {formatRepairMs(repairCycle.budgetMs)}
                              {isRepairTerminal(repairCycle.state) &&
                              repairCycle.detail !== ''
                                ? ` · ${repairCycle.detail}`
                                : ''}
                            </p>
                          )}

                          {repairCycle?.attempts.map(
                            (attempt) =>
                              attempt.appliedFiles.length > 0 && (
                                <p
                                  key={attempt.attemptId}
                                  className="muted"
                                >
                                  Attempt {attempt.n} changed:{' '}
                                  {attempt.appliedFiles.join(', ')}
                                  {attempt.reportId
                                    ? ' · verification recorded'
                                    : ''}
                                </p>
                              )
                          )}

                          {(!repairCycle ||
                            isRepairTerminal(repairCycle.state)) && (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={busy || repairBusy}
                              onClick={() => void startRepair()}
                            >
                              {repairBusy
                                ? 'Starting repair…'
                                : 'Start repair cycle'}
                            </button>
                          )}

                          {repairCycle?.state === 'awaiting-proposal' &&
                            repairCycle.attempts.length > 0 && (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={busy || repairBusy}
                                onClick={() =>
                                  void requestRepairProposal(repairCycle.id)
                                }
                              >
                                {repairBusy
                                  ? 'Generating…'
                                  : `Generate repair attempt ${
                                      repairCycle.attempts.length + 1
                                    } of 2`}
                              </button>
                            )}

                          {repairCycle &&
                            !isRepairTerminal(repairCycle.state) && (
                              <button
                                type="button"
                                className="secondary-button"
                                disabled={busy || repairBusy}
                                onClick={() => void cancelRepairUi()}
                              >
                                Cancel repair
                              </button>
                            )}

                          {repairCycle?.state === 'exhausted' && (
                            <p className="muted">
                              Repair attempts exhausted. Adjust the task or
                              files and plan again.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!plan && !error && !keyMissing && !contextPreview && (
            <p className="muted padded">
              No plan yet. Describe a task below — the plan appears here
              for review before anything is applied.
            </p>
          )}
          </div>

          <div className="agent-dock">
            <form
              className="agent-composer"
              onSubmit={(event) => {
                event.preventDefault()
                void requestPlan()
              }}
            >
              <textarea
                aria-label="Coding task"
                value={task}
                onChange={(event) => setTask(event.target.value)}
                placeholder="Describe the change, e.g. add input validation to the signup form…"
                rows={3}
                maxLength={4000}
                disabled={busy}
              />
              <div className="composer-footer">
                <span className="muted">{task.length}/4000</span>
                {planning ? (
                  <button type="button" onClick={stopPlanning}>
                    Stop
                  </button>
                ) : (
                  <button type="submit" disabled={applying || verifying || !task.trim()}>
                    Plan task
                  </button>
                )}
              </div>
            </form>
          </div>
        </>
      )}
    </section>
  )
}
