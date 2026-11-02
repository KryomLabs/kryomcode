import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kryom, errorMessage } from '../api/kryom'
import { copyText as copyToClipboard } from '../utils/clipboard'
import { MarkdownLite } from './MarkdownLite'

export interface ResearchPanelProps {
  workspaceRoot: string | null
  onStatus: (status: string) => void
  onImplement: (session: KryomResearchSession) => void
  onAsk: (session: KryomResearchSession) => void
  pendingStart?: { objective: string; nonce: number } | null
  // Welcome-composer model: initial pick for fresh mounts; the
  // in-view picker stays authoritative afterwards.
  defaultModel?: string
  // Meta AI session embedding (Level 3C): reports the viewed research
  // session so the session timeline can query real research steps.
  onSessionChange?: (sessionId: string | null) => void
  // When embedded, restores this linked session instead of the global
  // active one, so tabs never steal each other's research view.
  sessionId?: string | null
}

type ResearchTab = 'overview' | 'plan' | 'sources' | 'evidence' | 'findings' | 'report'

const TABS: Array<{ id: ResearchTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'plan', label: 'Plan' },
  { id: 'sources', label: 'Sources' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'findings', label: 'Findings' },
  { id: 'report', label: 'Report' },
]

const EXAMPLE_PROMPTS = [
  'Compare approaches for reliable autonomous coding agents: tool use, context management, verification, failure recovery',
  'How do small language models perform at code generation and debugging versus large models?',
  'What causes hallucinations in retrieval-augmented generation, and how are they evaluated?',
]

function stepIcon(status: KryomResearchStep['status']): string {
  switch (status) {
    case 'done':
      return '✓'
    case 'running':
      return '…'
    case 'failed':
      return '✕'
    case 'skipped':
      return '–'
    default:
      return '○'
  }
}

function sessionTitle(session: { name?: string; objective: string }): string {
  return session.name && session.name.trim() ? session.name.trim() : session.objective
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export function ResearchPanel(props: ResearchPanelProps) {
  const [objective, setObjective] = useState('')
  const [depth, setDepth] = useState<KryomResearchDepth>('standard')
  const [model, setModel] = useState(props.defaultModel ?? '')
  const [models, setModels] = useState<KryomProviderModelSummary[]>([])
  const [session, setSession] = useState<KryomResearchSession | null>(null)
  const [sessions, setSessions] = useState<KryomResearchSummary[]>([])
  const [sessionQuery, setSessionQuery] = useState('')
  const [starting, setStarting] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<ResearchTab>('overview')
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportTemplate, setExportTemplate] = useState('report')
  const [typeFilter, setTypeFilter] = useState('all')
  const [accessFilter, setAccessFilter] = useState('all')
  const [sourceQuery, setSourceQuery] = useState('')
  const [selectedSource, setSelectedSource] = useState<number | null>(null)
  const pollRef = useRef<number | null>(null)

  const refreshList = useCallback(async () => {
    if (!props.workspaceRoot) {
      setSessions([])
      return
    }

    try {
      setSessions(await kryom().listResearch())
    } catch {
      // List is auxiliary; the session view reports its own errors.
    }
  }, [props.workspaceRoot])

  const loadSession = useCallback(async (id: string) => {
    const loaded = await kryom().getResearchStatus({ id })
    setSession(loaded)
    return loaded
  }, [])

  // Ref mirrors: the poll interval below must not reset on every
  // parent render (a `props` dep would starve it while typing).
  const loadSessionRef = useRef(loadSession)
  loadSessionRef.current = loadSession
  const refreshListRef = useRef(refreshList)
  refreshListRef.current = refreshList
  const statusRef = useRef(props.onStatus)
  statusRef.current = props.onStatus

  useEffect(() => {
    kryom()
      .listProviderModels({ providerId: 'meta' })
      .then((result) => setModels(result.models || []))
      .catch(() => setModels([]))
  }, [])

  useEffect(() => {
    if (!props.workspaceRoot) {
      setSession(null)
      setSessions([])
      return
    }

    // Embedded sessions restore their linked research; standalone use
    // keeps the global active session. A stale link clears the view
    // with an honest error instead of showing another session.
    if (props.sessionId) {
      loadSession(props.sessionId).catch((e) => {
        setSession(null)
        setError(`Linked research session is unavailable: ${errorMessage(e)}`)
      })
    } else {
      kryom()
        .getActiveResearch()
        .then((active) => {
          if (active) {
            setSession(active)
          }
        })
        .catch(() => undefined)
    }

    void refreshList()
  }, [props.workspaceRoot, props.sessionId, refreshList, loadSession])

  useEffect(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }

    if (!session || session.status !== 'running') {
      return
    }

    const watchedId = session.id

    pollRef.current = window.setInterval(() => {
      loadSessionRef.current(watchedId)
        .then((loaded) => {
          if (loaded.status !== 'running') {
            void refreshListRef.current()
            statusRef.current(`Research ${loaded.status}: ${loaded.statusDetail}`)
            // Surface the finished report, but only when the user is
            // still on the default tab — never steal an active view.
            setTab((current) => (current === 'overview' && loaded.status === 'completed' ? 'report' : current))
          }
        })
        .catch((e) => setError(errorMessage(e)))
    }, 2000)

    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [session?.id, session?.status])

  async function exportBrief(id: string) {
    if (exporting) {
      return
    }

    setExporting(true)
    setError('')

    try {
      const result = await kryom().exportBriefDocx({
        sessionId: id,
        template: exportTemplate,
      })

      if (!result) {
        props.onStatus('Brief export cancelled')
        return
      }

      props.onStatus(`Brief exported (${Math.round(result.bytes / 1024)} KB)`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  async function exportReport(id: string, format: 'markdown' | 'html') {
    if (exporting) {
      return
    }

    setExporting(true)
    setError('')

    try {
      const result = await kryom().exportResearch({ id, format })
      const saved = await kryom().saveAs(result.content, result.fileName)

      if (!saved) {
        props.onStatus('Report export cancelled')
        return
      }

      props.onStatus(`Report exported (${result.fileName})`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  async function copyHandoff(id: string, target: 'chat' | 'agent-brief') {
    setError('')

    try {
      const result = await kryom().handoffResearch({ id, target })
      if (!(await copyToClipboard(result.text))) throw new Error('clipboard write failed')
      setCopied(`handoff-${target}`)
      setTimeout(() => setCopied(null), 1500)
      props.onStatus(target === 'chat' ? 'Chat handoff copied' : 'Agent brief copied')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function start(externalObjective?: string) {
    const trimmed = (externalObjective ?? objective).trim()

    if (!trimmed || starting || !props.workspaceRoot) {
      return
    }

    setStarting(true)
    setError('')
    setTab('overview')
    setSelectedSource(null)

    try {
      const started = await kryom().startResearch({
        objective: trimmed,
        depth,
        ...(model ? { model } : {}),
      })
      setObjective('')
      await loadSession(started.id)
      await refreshList()
      props.onStatus(`Research started (${depth})`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setStarting(false)
    }
  }

  // Welcome-composer starts arrive with a fresh nonce per submission.
  const consumedStartNonce = useRef<number | null>(null)

  useEffect(() => {
    const pending = props.pendingStart

    if (
      !pending ||
      consumedStartNonce.current === pending.nonce ||
      !props.workspaceRoot
    ) {
      return
    }

    consumedStartNonce.current = pending.nonce
    void start(pending.objective)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingStart, props.workspaceRoot])

  async function cancel() {
    if (!session || working) {
      return
    }

    setWorking(true)
    setError('')

    try {
      const updated = await kryom().cancelResearch({ id: session.id })
      setSession(updated)
      await refreshList()
      props.onStatus('Research cancelled')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function resume() {
    if (!session || working) {
      return
    }

    setWorking(true)
    setError('')

    try {
      await kryom().resumeResearch({ id: session.id })
      await loadSession(session.id)
      props.onStatus('Research resumed')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function select(id: string) {
    if (working || session?.id === id) {
      return
    }

    setWorking(true)
    setError('')
    setTab('overview')
    setSelectedSource(null)

    try {
      await kryom().selectResearch({ id })
      await loadSession(id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function rename() {
    if (!session || working) {
      return
    }

    const trimmed = draftName.trim()

    if (!trimmed) {
      return
    }

    setWorking(true)
    setError('')

    try {
      const updated = await kryom().renameResearch({ id: session.id, name: trimmed })
      setSession(updated)
      setRenaming(false)
      await refreshList()
      props.onStatus('Session renamed')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function removeSession(id: string) {
    if (working) {
      return
    }

    if (!window.confirm('Delete this research session and its saved report? This cannot be undone.')) {
      return
    }

    setWorking(true)
    setError('')

    try {
      await kryom().deleteResearch({ id })

      if (session?.id === id) {
        setSession(null)
      }

      await refreshList()
      props.onStatus('Session deleted')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setWorking(false)
    }
  }

  async function searchSessions() {
    if (!props.workspaceRoot) {
      return
    }

    const trimmed = sessionQuery.trim()

    if (!trimmed) {
      await refreshList()
      return
    }

    try {
      setSessions(await kryom().searchResearch({ query: trimmed }))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function copyText(text: string, key: string) {
    try {
      if (!(await copyToClipboard(text))) throw new Error('clipboard write failed')
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setError('Copy is unavailable in this context.')
    }
  }

  function isOpenableUrl(url: string): boolean {
    return /^https?:\/\//i.test(url.trim())
  }

  async function openSource(url: string) {
    setError('')

    try {
      await kryom().openExternal(url)
      props.onStatus('Source opened in browser')
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  function openCitation(index: number) {
    if (!session || index < 1 || index > session.sources.length) {
      return
    }

    setSelectedSource(index)
    setTab('sources')
  }

  const running = session?.status === 'running'
  const resumable =
    session !== null &&
    ['cancelled', 'failed', 'blocked'].includes(session.status)

  const viewedSessionId = session?.id ?? null

  useEffect(() => {
    props.onSessionChange?.(viewedSessionId)
    // The callback identity is the parent's concern; the id drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedSessionId])

  const sourceTypes = useMemo(() => {
    const kinds = new Set<string>()

    for (const source of session?.sources || []) {
      kinds.add(source.sourceType || 'unknown')
    }

    return [...kinds].sort()
  }, [session])

  const filteredSources = useMemo(() => {
    const needle = sourceQuery.trim().toLowerCase()

    return (session?.sources || [])
      .map((source, position) => ({ source, index: position + 1 }))
      .filter(({ source }) => {
        if (typeFilter !== 'all' && (source.sourceType || 'unknown') !== typeFilter) {
          return false
        }

        if (accessFilter !== 'all' && (source.accessStatus || 'unknown') !== accessFilter) {
          return false
        }

        if (needle) {
          const haystack = `${source.title} ${source.venue} ${source.authors.join(' ')} ${hostOf(source.url)}`.toLowerCase()

          if (!haystack.includes(needle)) {
            return false
          }
        }

        return true
      })
  }, [session, typeFilter, accessFilter, sourceQuery])

  // Findings grouped by cited source for source→finding navigation.
  const findingsBySource = useMemo(() => {
    const grouped = new Map<number, Array<{ finding: KryomResearchFinding; position: number }>>()

    for (const [position, finding] of (session?.findings || []).entries()) {
      for (const sourceIndex of finding.sourceIndexes) {
        if (!Number.isInteger(sourceIndex)) {
          continue
        }

        const list = grouped.get(sourceIndex) || []
        list.push({ finding, position: position + 1 })
        grouped.set(sourceIndex, list)
      }
    }

    return grouped
  }, [session])

  function renderOverview() {
    if (!session) {
      return null
    }

    const subQuestions = session.plan?.subQuestions || []
    const doneCount = subQuestions.filter((entry) => entry.status === 'done').length

    return (
      <div className="plan-view">
        <div className="plan-commands">
          <strong>Progress</strong>
          {session.steps.map((step) => (
            <div key={step.id} className="command-row">
              <code>
                [{stepIcon(step.status)}] {step.label}
                {step.detail ? ` — ${step.detail}` : ''}
                {step.error ? ` — ERROR: ${step.error}` : ''}
              </code>
            </div>
          ))}
        </div>

        {subQuestions.length > 0 && (
          <div className="plan-commands">
            <strong>
              Sub-questions ({doneCount}/{subQuestions.length} done)
            </strong>
            {subQuestions.map((entry) => (
              <div key={entry.id} className="command-row">
                <code>
                  [{stepIcon(entry.status === 'done' ? 'done' : entry.status === 'failed' ? 'failed' : entry.status === 'running' ? 'running' : 'pending')}]{' '}
                  {entry.id}: {entry.text}
                  {typeof entry.sourcesFound === 'number' ? ` — ${entry.sourcesFound} result(s)` : ''}
                  {entry.error ? ` — ERROR: ${entry.error}` : ''}
                </code>
              </div>
            ))}
          </div>
        )}

        {session.queries.length > 0 && (
          <div className="plan-commands">
            <strong>Recent queries ({session.queries.length})</strong>
            {session.queries.slice(-8).map((entry, position) => (
              <div key={`${entry.at}-${position}`} className="command-row">
                <code>
                  {entry.questionId ? `[${entry.questionId}] ` : ''}{entry.query}
                </code>
              </div>
            ))}
          </div>
        )}

        {session.errors.length > 0 && (
          <div className="plan-commands">
            <strong>Errors ({session.errors.length})</strong>
            {session.errors.slice(0, 8).map((entry, position) => (
              <div key={position} className="command-row">
                <code>
                  {entry.where}: {entry.message}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderPlan() {
    if (!session) {
      return null
    }

    const plan = session.plan

    if (!plan || plan.subQuestions.length === 0) {
      return (
        <div className="plan-view">
          <p className="muted padded">
            {running
              ? 'The research plan is being prepared…'
              : 'No plan was recorded for this session.'}
          </p>
        </div>
      )
    }

    return (
      <div className="plan-view">
        <p className="muted padded">
          Planned via {plan.via || 'unknown method'} · {plan.subQuestions.length} sub-question(s)
        </p>
        <div className="plan-commands">
          <strong>Sub-questions</strong>
          {plan.subQuestions.map((entry) => (
            <div key={entry.id} className="command-row finding-row">
              <div className="finding-body">
                <span>
                  <strong>{entry.id}</strong> · {entry.text}
                </span>
                <span className="muted">
                  Status: {entry.status}
                  {entry.queries.length > 0 ? ` · Queries: ${entry.queries.join(' | ')}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        {plan.searchTerms.length > 0 && (
          <div className="plan-commands">
            <strong>Search terms</strong>
            <div className="command-row">
              <code>{plan.searchTerms.join(', ')}</code>
            </div>
          </div>
        )}

        {plan.evidenceNeeds.length > 0 && (
          <div className="plan-commands">
            <strong>Evidence needed</strong>
            {plan.evidenceNeeds.map((need, position) => (
              <div key={position} className="command-row">
                <code>{need}</code>
              </div>
            ))}
          </div>
        )}

        {plan.ambiguityNotes.length > 0 && (
          <div className="plan-commands">
            <strong>Ambiguity notes</strong>
            {plan.ambiguityNotes.map((note, position) => (
              <div key={position} className="command-row">
                <code>{note}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderSourceDetail(index: number) {
    if (!session) {
      return null
    }

    const source = session.sources[index - 1]

    if (!source) {
      return null
    }

    const excerpt = (source.abstract || source.excerpt || '').trim()
    const linked = findingsBySource.get(index) || []
    const questions = new Map((session.plan?.subQuestions || []).map((entry) => [entry.id, entry.text]))

    return (
      <div className="command-row finding-row" data-testid={`source-detail-${index}`}>
        <div className="finding-body">
          <span>
            <strong>[{index}] {source.title}</strong>
          </span>
          <span className="muted">
            {[source.provider, source.sourceType, source.accessStatus].filter(Boolean).join(' · ')}
            {source.publishedAt ? ` · ${source.publishedAt.slice(0, 10)}` : ''}
            {hostOf(source.url) ? ` · ${hostOf(source.url)}` : ''}
          </span>
          {source.authors.length > 0 && (
            <span className="muted">By {source.authors.join(', ')}</span>
          )}
          {source.venue && <span className="muted">{source.venue}</span>}
          {excerpt ? (
            <span>{excerpt.slice(0, 900)}</span>
          ) : (
            <span className="muted">No abstract or excerpt — counted but not read.</span>
          )}
          {source.quality && (
            <span className="muted">
              Quality: {source.quality.summary}
              {source.quality.signals.map((signal) => (
                <span key={signal.label} title={signal.detail}>
                  {' '}· [{signal.polarity}] {signal.label}
                </span>
              ))}
            </span>
          )}
          {(source.supports || []).length > 0 && (
            <span className="muted">
              Supports: {(source.supports || []).map((id) => questions.get(id) || id).join(' | ')}
            </span>
          )}
          {linked.length > 0 && (
            <span className="muted">
              Findings: {linked.map((entry) => `#${entry.position}`).join(', ')}
              {' '}(see Findings tab)
            </span>
          )}
          <span className="source-actions">
            {isOpenableUrl(source.url) && (
              <button
                className="secondary-button"
                onClick={() => void openSource(source.url)}
                title="Open in your browser"
              >
                Open
              </button>
            )}
            <button
              className="secondary-button"
              onClick={() => void copyText(source.url, `src-${index}`)}
            >
              {copied === `src-${index}` ? 'Copied' : 'Copy URL'}
            </button>
            <button
              className="secondary-button"
              onClick={() => setSelectedSource(null)}
            >
              Close
            </button>
          </span>
        </div>
      </div>
    )
  }

  function renderSources() {
    if (!session) {
      return null
    }

    if (session.sources.length === 0) {
      return (
        <div className="plan-view">
          <p className="muted padded">
            {running
              ? 'Discovering sources… they appear here as searches complete.'
              : 'No sources were retrieved for this session.'}
          </p>
        </div>
      )
    }

    return (
      <div className="plan-view">
        <div className="composer-footer padded">
          <input
            aria-label="Filter sources"
            placeholder="Filter by title, venue, author, domain…"
            value={sourceQuery}
            onChange={(event) => setSourceQuery(event.target.value)}
          />
          <span>
            <select
              aria-label="Filter by source type"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
            >
              <option value="all">All types</option>
              {sourceTypes.map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </select>{' '}
            <select
              aria-label="Filter by access"
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value)}
            >
              <option value="all">Any access</option>
              <option value="open">Open</option>
              <option value="unknown">Unknown</option>
              <option value="unreadable">Unreadable</option>
              <option value="blocked">Blocked</option>
            </select>
          </span>
        </div>

        {selectedSource !== null && renderSourceDetail(selectedSource)}

        <div className="plan-commands">
          <strong>
            Sources ({filteredSources.length}
            {filteredSources.length !== session.sources.length ? ` of ${session.sources.length}` : ''})
          </strong>
          {filteredSources.length === 0 ? (
            <p className="muted">No sources match these filters.</p>
          ) : (
            filteredSources.map(({ source, index }) => (
              <div key={source.id || `${source.url}-${index}`} className="command-row">
                <code>
                  [{index}] {source.title} [{source.sourceType}] ({source.accessStatus})
                  {source.publishedAt ? ` · ${source.publishedAt.slice(0, 10)}` : ''}
                </code>
                <span className="source-actions">
                  <button
                    className="secondary-button"
                    onClick={() => setSelectedSource(selectedSource === index ? null : index)}
                  >
                    {selectedSource === index ? 'Hide' : 'Inspect'}
                  </button>
                  {isOpenableUrl(source.url) && (
                    <button
                      className="secondary-button"
                      onClick={() => void openSource(source.url)}
                      title="Open in your browser"
                    >
                      Open
                    </button>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  function citationButtons(indexes: number[]) {
    if (!session) {
      return <span className="muted">No sources cited</span>
    }

    const valid = indexes.filter(
      (entry) => Number.isInteger(entry) && entry >= 1 && entry <= session.sources.length
    )
    const missing = indexes.length - valid.length

    return (
      <span>
        {valid.map((entry) => (
          <button
            key={entry}
            type="button"
            className="md-cite"
            onClick={() => openCitation(entry)}
            title={session.sources[entry - 1]?.title || `Source ${entry}`}
            aria-label={`Open source ${entry}`}
          >
            [{entry}]
          </button>
        ))}
        {valid.length === 0 && <span className="muted">No sources cited</span>}
        {missing > 0 && (
          <span className="muted"> · {missing} reference(s) unavailable</span>
        )}
      </span>
    )
  }

  function renderEvidence() {
    if (!session) {
      return null
    }

    const claims = session.claims || []
    const conflicts = session.conflicts || []
    const titles = new Map(session.sources.map((source, position) => [source.id, position + 1]))

    return (
      <div className="plan-view">
        <p className="muted padded">
          Claims are sentences lifted from retrieved sources; statuses compare
          shared terminology across independent sources — never model-verified facts.
        </p>

        <div className="plan-commands">
          <strong>Claims ({claims.length})</strong>
          {claims.length === 0 ? (
            <p className="muted">
              {running
                ? 'Claims appear here once evidence extraction completes.'
                : (session.depth || 'standard') === 'quick'
                  ? 'Quick mode skips claim verification. Re-run with Standard or Deep for checked claims.'
                  : 'No claims were extracted from this session.'}
            </p>
          ) : (
            claims.map((claim) => (
              <div key={claim.id} className="command-row finding-row">
                <div className="finding-body">
                  <span>{claim.text}</span>
                  <span className="muted">
                    {claim.status || 'unverified'}
                    {claim.explanation ? ` · ${claim.explanation}` : ''}
                    {claim.conflictNote ? ` ${claim.conflictNote}` : ''}
                  </span>
                  <span>
                    {citationButtons(
                      [claim.sourceId, ...(claim.supportingSourceIds || [])]
                        .map((id) => titles.get(id || '') || 0)
                        .filter((entry) => entry > 0)
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="plan-commands">
          <strong>Conflicts ({conflicts.length})</strong>
          {conflicts.length === 0 ? (
            <p className="muted">
              No conflicts flagged. Absence of flags is not agreement.
            </p>
          ) : (
            conflicts.map((conflict) => (
              <div key={conflict.id} className="command-row finding-row">
                <div className="finding-body">
                  <span>{conflict.description}</span>
                  <span className="muted">Topic: {conflict.topic}</span>
                  <span>
                    {citationButtons(
                      (conflict.sourceIds || [])
                        .map((id) => titles.get(id) || 0)
                        .filter((entry) => entry > 0)
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {session.evidence.length > 0 && (
          <div className="plan-commands">
            <strong>Read excerpts ({session.evidence.length})</strong>
            {session.evidence.slice(0, 12).map((entry, position) => (
              <div key={position} className="command-row finding-row">
                <div className="finding-body">
                  <span className="muted">{entry.sourceUrl}</span>
                  <span>{entry.excerpt.slice(0, 400)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderFindings() {
    if (!session) {
      return null
    }

    return (
      <div className="plan-view">
        <div className="composer-footer padded">
          <span className="muted">
            {session.findings.length} finding(s)
            {session.conflicts && session.conflicts.length > 0
              ? ` · ${session.conflicts.length} conflict(s) flagged — verify before building on these.`
              : ''}
          </span>
          <span>
            <button
              className="secondary-button"
              onClick={() => void copyHandoff(session.id, 'chat')}
              disabled={session.findings.length === 0}
              title="Copy findings with citations for AI Chat"
            >
              {copied === 'handoff-chat' ? 'Copied' : 'Copy chat handoff'}
            </button>{' '}
            <button
              className="secondary-button"
              onClick={() => void copyHandoff(session.id, 'agent-brief')}
              disabled={session.findings.length === 0}
              title="Copy findings plus implementation tasks for the coding agent"
            >
              {copied === 'handoff-agent-brief' ? 'Copied' : 'Copy agent brief'}
            </button>
          </span>
        </div>

        <div className="plan-commands">
          {session.findings.length === 0 ? (
            <p className="muted">
              {running
                ? 'Findings appear here once synthesis completes.'
                : 'No findings were recorded for this session.'}
            </p>
          ) : (
            session.findings.map((finding, position) => (
              <div key={position} className="command-row finding-row">
                <div className="finding-body">
                  <span>
                    <strong>#{position + 1}</strong> {finding.claim}
                  </span>
                  <span className="muted">
                    Confidence: {finding.confidence}
                    {finding.note ? ` · ${finding.note}` : ''}
                  </span>
                  <span>
                    {citationButtons(finding.sourceIndexes)}{' '}
                    <button
                      className="secondary-button"
                      onClick={() => void copyText(
                        `${finding.claim} [${finding.sourceIndexes.join(', ')}]`,
                        `finding-${position}`
                      )}
                    >
                      {copied === `finding-${position}` ? 'Copied' : 'Copy'}
                    </button>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {session.implementationTasks.length > 0 && (
          <div className="plan-commands">
            <strong>
              Implementation tasks ({session.implementationTasks.length})
            </strong>
            {session.implementationTasks.map((task, position) => (
              <div key={position} className="command-row">
                <code>
                  {position + 1}. {task}
                </code>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderReport() {
    if (!session) {
      return null
    }

    if (session.brief.version === 0) {
      return (
        <div className="plan-view">
          <p className="muted padded">
            {running
              ? 'The report is being written…'
              : 'No report yet. Run research to completion first.'}
          </p>
        </div>
      )
    }

    return (
      <div className="plan-view">
        <div className="composer-footer padded">
          <span className="muted">
            Report v{session.brief.version} ({session.brief.via})
            {session.brief.generatedAt ? ` · ${session.brief.generatedAt.slice(0, 10)}` : ''}
          </span>
          <span>
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={() => void exportReport(session.id, 'markdown')}
            >
              {exporting ? 'Exporting…' : 'Markdown'}
            </button>{' '}
            <button
              className="secondary-button"
              disabled={exporting}
              onClick={() => void exportReport(session.id, 'html')}
            >
              {exporting ? 'Exporting…' : 'HTML'}
            </button>
          </span>
        </div>
        <div className="composer-footer padded">
          <select
            value={exportTemplate}
            onChange={(event) => setExportTemplate(event.target.value)}
            aria-label="Brief export template"
            disabled={exporting}
          >
            <option value="report">Report template</option>
            <option value="technical">Technical template</option>
          </select>
          <button
            className="secondary-button"
            disabled={exporting}
            onClick={() => void exportBrief(session.id)}
            title="Export this report with its cited sources to a .docx file"
          >
            {exporting ? 'Exporting…' : 'Export .docx'}
          </button>
        </div>
        <div className="brief-body">
          <MarkdownLite
            text={session.brief.markdown.slice(0, 24000)}
            onCitation={openCitation}
          />
        </div>
      </div>
    )
  }

  return (
    <section className="agent-panel research-workspace">
      <div className="ai-heading">
        <div>
          <strong>Deep Research</strong>
          <div className="muted">Multi-source investigation · verified claims · cited reports</div>
        </div>
        {session && (
          <span className="muted">
            {session.status.toUpperCase()} · {session.sources.length} source(s) · {(session.depth || 'standard').toUpperCase()}
          </span>
        )}
      </div>

      {!props.workspaceRoot ? (
        <p className="muted padded">Open a project to run research.</p>
      ) : (
        <>
          <form
            className="agent-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void start()
            }}
          >
            <textarea
              aria-label="Research objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="e.g. Compare path-planning algorithms for warehouse robots…"
              rows={3}
              maxLength={2000}
              disabled={starting || running}
            />
            <div className="composer-footer">
              <span className="research-options">
                <select
                  aria-label="Research depth"
                  value={depth}
                  onChange={(event) => setDepth(event.target.value as KryomResearchDepth)}
                  disabled={starting || running}
                  title="Quick: few sources, fast. Standard: verified claims. Deep: broad discovery plus refinement."
                >
                  <option value="quick">Quick</option>
                  <option value="standard">Standard</option>
                  <option value="deep">Deep</option>
                </select>{' '}
                <select
                  aria-label="Research model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  disabled={starting || running || models.length === 0}
                  title="Model for planning and synthesis. Default when unset."
                >
                  <option value="">Default model</option>
                  {models.map((entry) => (
                    <option key={entry.modelId} value={entry.modelId}>
                      {entry.displayName}
                    </option>
                  ))}
                </select>
              </span>
              <span>
                <span className="muted">{objective.length}/2000</span>{' '}
                <button
                  type="submit"
                  disabled={starting || running || !objective.trim()}
                >
                  {starting ? 'Starting…' : running ? 'Research running…' : 'Start research'}
                </button>
              </span>
            </div>
          </form>

          {!session && !starting && (
            <div className="plan-commands">
              <strong>Try an example</strong>
              {EXAMPLE_PROMPTS.map((example) => (
                <div key={example} className="command-row">
                  <code>{example}</code>
                  <button
                    className="secondary-button"
                    onClick={() => setObjective(example)}
                    disabled={starting || running}
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="ai-error" role="alert">
              <strong>Research request failed</strong>
              <p>{error}</p>
              <button onClick={() => setError('')} className="secondary-button">
                Dismiss
              </button>
            </div>
          )}

          <div className="plan-commands">
            <form
              className="composer-footer"
              onSubmit={(event) => {
                event.preventDefault()
                void searchSessions()
              }}
            >
              <input
                aria-label="Search sessions"
                placeholder="Search saved research…"
                value={sessionQuery}
                onChange={(event) => setSessionQuery(event.target.value)}
              />
              <button type="submit" className="secondary-button">
                Search
              </button>
            </form>
            {sessions.length > 0 && (
              <>
                <strong>Sessions ({sessions.length})</strong>
                {sessions.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="command-row">
                    <code>
                      {entry.status} · {entry.sources} src ·{' '}
                      {(entry.name && entry.name.trim() ? entry.name : entry.objective).slice(0, 80)}
                    </code>
                    <span className="source-actions">
                      <button
                        className="secondary-button"
                        onClick={() => void select(entry.id)}
                        disabled={working || session?.id === entry.id}
                      >
                        {session?.id === entry.id ? 'Current' : 'Open'}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => void removeSession(entry.id)}
                        disabled={working}
                        title="Delete this session"
                        aria-label={`Delete session ${entry.id}`}
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>

          {session && (
            <div className="plan-view">
              <div className="composer-footer padded">
                {renaming ? (
                  <span>
                    <input
                      aria-label="Session name"
                      value={draftName}
                      maxLength={120}
                      onChange={(event) => setDraftName(event.target.value)}
                      placeholder="Session name"
                    />{' '}
                    <button
                      className="secondary-button"
                      onClick={() => void rename()}
                      disabled={working || !draftName.trim()}
                    >
                      Save
                    </button>{' '}
                    <button
                      className="secondary-button"
                      onClick={() => setRenaming(false)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="muted">
                    {sessionTitle(session)} · {session.statusDetail}
                  </span>
                )}
                <span>
                  {!renaming && (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setDraftName(session.name || '')
                        setRenaming(true)
                      }}
                      disabled={working}
                    >
                      Rename
                    </button>
                  )}{' '}
                  {running && (
                    <button
                      className="secondary-button"
                      onClick={() => void cancel()}
                      disabled={working}
                    >
                      {working ? 'Cancelling…' : 'Stop'}
                    </button>
                  )}
                  {resumable && (
                    <button
                      className="secondary-button"
                      onClick={() => void resume()}
                      disabled={working}
                    >
                      {working ? 'Resuming…' : 'Retry / resume'}
                    </button>
                  )}
                </span>
              </div>

              <div className="research-tabs" role="tablist" aria-label="Research views">
                {TABS.map((entry) => (
                  <button
                    key={entry.id}
                    role="tab"
                    aria-selected={tab === entry.id}
                    className={tab === entry.id ? 'research-tab active' : 'research-tab'}
                    onClick={() => setTab(entry.id)}
                  >
                    {entry.label}
                    {entry.id === 'sources' && session.sources.length > 0 ? ` (${session.sources.length})` : ''}
                    {entry.id === 'evidence' && (session.claims || []).length > 0 ? ` (${session.claims?.length})` : ''}
                    {entry.id === 'findings' && session.findings.length > 0 ? ` (${session.findings.length})` : ''}
                  </button>
                ))}
              </div>

              {tab === 'overview' && renderOverview()}
              {tab === 'plan' && renderPlan()}
              {tab === 'sources' && renderSources()}
              {tab === 'evidence' && renderEvidence()}
              {tab === 'findings' && renderFindings()}
              {tab === 'report' && renderReport()}

              <div className="composer-footer padded">
                <span className="muted">
                  {session.brief.version > 0
                    ? 'Report ready for chat and implementation.'
                    : running
                      ? 'Running — progress above reflects completed work only.'
                      : `Ended: ${session.status}.`}
                </span>
                <span>
                  <button
                    className="secondary-button"
                    onClick={() => props.onAsk(session)}
                  >
                    Ask about this
                  </button>{' '}
                  <button
                    className="primary-button"
                    onClick={() => props.onImplement(session)}
                    disabled={session.brief.version === 0}
                    title={
                      session.brief.version === 0
                        ? 'Available once the report is ready'
                        : 'Plan implementation from this report'
                    }
                  >
                    Implement from Research
                  </button>
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
