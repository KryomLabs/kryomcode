// Agent-run controller hook (Milestone 3). Owns the selected run,
// the run list, polling while a run is active, and every run action.
// All state renders from backend records; nothing here invents
// progress — the timeline, plan, checks, and summary all come from
// getAgentRun polls.
import { useCallback, useEffect, useRef, useState } from 'react'
import { kryom, errorMessage } from '../api/kryom'

const POLL_MS = 1500

export function isRunActive(run: KryomAgentRun | null): boolean {
  return (
    !!run &&
    run.state !== 'completed' &&
    run.state !== 'failed' &&
    run.state !== 'cancelled'
  )
}

export interface StartRunInput {
  task: string
  model?: string
  contextPaths?: string[]
  researchMode?: KryomAgentResearchMode
  includeChat?: boolean
}

export function useAgentRun(workspaceRoot: string | null) {
  const [runs, setRuns] = useState<KryomAgentRunListItem[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [run, setRun] = useState<KryomAgentRun | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<number | null>(null)
  const generationRef = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshList = useCallback(async () => {
    if (!workspaceRoot) {
      setRuns([])
      return
    }

    try {
      const listed = await kryom().listAgentRuns()
      setRuns(listed.runs)
    } catch {
      // The list is auxiliary; the run view reports its own errors.
    }
  }, [workspaceRoot])

  const loadRun = useCallback(async (id: string) => {
    const loaded = await kryom().getAgentRun({ runId: id })
    setRun(loaded)
    return loaded
  }, [])

  // Ref mirrors so the poll loop never resets on parent renders.
  const loadRunRef = useRef(loadRun)
  loadRunRef.current = loadRun
  const refreshListRef = useRef(refreshList)
  refreshListRef.current = refreshList

  const selectRun = useCallback(
    (id: string | null) => {
      generationRef.current += 1
      setSelectedRunId(id)
      setRun(null)
      setError('')

      if (!id) {
        return
      }

      setLoading(true)
      const generation = generationRef.current

      loadRun(id).then(
        () => {
          if (generation === generationRef.current) {
            setLoading(false)
          }
        },
        (failure: unknown) => {
          if (generation === generationRef.current) {
            setError(errorMessage(failure))
            setLoading(false)
          }
        }
      )
    },
    [loadRun]
  )

  // Initial list load per workspace.
  useEffect(() => {
    generationRef.current += 1
    setRuns([])
    setRun(null)
    setSelectedRunId(null)
    setError('')
    stopPolling()
    void refreshList()
  }, [workspaceRoot, refreshList, stopPolling])

  // Poll the selected run while it is active (including approval
  // gates and pause); terminal runs load once and rest.
  useEffect(() => {
    stopPolling()

    if (!selectedRunId || !run || !isRunActive(run)) {
      if (run && !isRunActive(run)) {
        void refreshListRef.current()
      }

      return
    }

    pollRef.current = window.setInterval(() => {
      const id = selectedRunId

      loadRunRef
        .current(id)
        .then((loaded) => {
          if (!isRunActive(loaded)) {
            stopPolling()
            void refreshListRef.current()
          }
        })
        .catch(() => {
          // Transient poll failures keep the last record; the next
          // tick retries. Persistent failure surfaces on actions.
        })
    }, POLL_MS)

    return stopPolling
  }, [selectedRunId, run, stopPolling])

  const act = useCallback(
    async <T,>(label: string, action: () => Promise<T>): Promise<T | null> => {
      setActing(true)
      setError('')

      try {
        return await action()
      } catch (failure) {
        setError(`${label}: ${errorMessage(failure)}`)
        return null
      } finally {
        setActing(false)
      }
    },
    []
  )

  const start = useCallback(
    async (input: StartRunInput): Promise<KryomAgentRun | null> => {
      const created = await act('Start failed', () =>
        kryom().startAgentRun({
          task: input.task,
          model: input.model || undefined,
          contextPaths: input.contextPaths,
          researchMode: input.researchMode,
          includeChat: input.includeChat,
        })
      )

      if (created) {
        setSelectedRunId(created.id)
        setRun(created)
        void refreshList()
      }

      return created
    },
    [act, refreshList]
  )

  const cancel = useCallback(async () => {
    if (!selectedRunId) {
      return
    }

    const updated = await act('Cancel failed', () =>
      kryom().cancelAgentRun({ runId: selectedRunId })
    )

    if (updated) {
      setRun(updated)
      void refreshList()
    }
  }, [act, selectedRunId, refreshList])

  const pause = useCallback(async () => {
    if (!selectedRunId) {
      return
    }

    const updated = await act('Pause failed', () =>
      kryom().pauseAgentRun({ runId: selectedRunId })
    )

    if (updated) {
      setRun(updated)
    }
  }, [act, selectedRunId])

  const resume = useCallback(async () => {
    if (!selectedRunId) {
      return
    }

    const updated = await act('Resume failed', () =>
      kryom().resumeAgentRun({ runId: selectedRunId })
    )

    if (updated) {
      setRun(updated)
    }
  }, [act, selectedRunId])

  const approve = useCallback(
    async (approvalId: string) => {
      if (!selectedRunId) {
        return
      }

      const updated = await act('Approval failed', () =>
        kryom().approveAgentRun({ runId: selectedRunId, approvalId })
      )

      if (updated) {
        setRun(updated)
        void refreshList()
      }
    },
    [act, selectedRunId, refreshList]
  )

  const reject = useCallback(
    async (approvalId: string, reason?: string, revise?: boolean) => {
      if (!selectedRunId) {
        return
      }

      const updated = await act('Rejection failed', () =>
        kryom().rejectAgentRun({
          runId: selectedRunId,
          approvalId,
          reason: reason || undefined,
          revise,
        })
      )

      if (updated) {
        setRun(updated)
        void refreshList()
      }
    },
    [act, selectedRunId, refreshList]
  )

  const proposalCache = useRef(new Map<string, KryomAgentRunProposal>())
  const oldContentCache = useRef(new Map<string, string | null>())

  const loadProposal = useCallback(
    async (subtask: number): Promise<KryomAgentRunProposal> => {
      if (!selectedRunId) {
        throw new Error('No run is selected.')
      }

      const key = `${selectedRunId}:${subtask}`
      const cached = proposalCache.current.get(key)

      if (cached) {
        return cached
      }

      const result = await kryom().getAgentRunProposal({
        runId: selectedRunId,
        subtask,
      })

      proposalCache.current.set(key, result.proposal)

      return result.proposal
    },
    [selectedRunId]
  )

  const loadOldContent = useCallback(
    async (filePath: string): Promise<string | null> => {
      const cached = oldContentCache.current.get(filePath)

      if (cached !== undefined) {
        return cached
      }

      try {
        const meta = await kryom().readFileMeta(filePath)
        oldContentCache.current.set(filePath, meta.content)
        return meta.content
      } catch {
        // Deleted files and read errors show new content only; the
        // backend still validates every apply.
        oldContentCache.current.set(filePath, null)
        return null
      }
    },
    []
  )

  return {
    runs,
    run,
    selectedRunId,
    loading,
    acting,
    error,
    clearError: () => setError(''),
    selectRun,
    refreshList,
    start,
    cancel,
    pause,
    resume,
    approve,
    reject,
    loadProposal,
    loadOldContent,
  }
}
