// Meta AI Agent tab: a clean VS Code-inspired coding workspace per
// session (conversation, embedded Implementation/Research, compact
// composer). Planning, research, agent orchestration, diagnostics,
// repair, change-set review, verification, terminal execution, and
// approvals are the EXISTING backend services and panels — this
// component orchestrates them per session instead of reimplementing
// them. Session tracking (plans, changed files, execution) continues
// internally; only the dashboard presentation was removed.
import { useEffect, useRef, useState } from 'react'
import { kryom, errorMessage, isCancelError } from '../api/kryom'
import { modelDisplayName } from '../utils/models'
import { copyText } from '../utils/clipboard'
import {
  deriveSessionTitle,
  recordChangedFiles,
  touchSession,
  type HistoryRef,
  type MetaSession,
} from '../state/meta-sessions'
import { classifyAIError, type AIErrorKind } from './meta-timeline'
import { useMetaWorkspaceData } from './useMetaWorkspace'
import { MarkdownLite } from './MarkdownLite'
import { MetaMark } from './MetaMark'
import { AgentPanel } from './AgentPanel'
import { ResearchPanel } from './ResearchPanel'
import { AgentTasksPanel } from './AgentTasksPanel'
import { AgentHistoryPicker } from './AgentHistoryPicker'
import { useDialogs } from './dialogs'

export interface MetaInitialPrompt {
  text: string
  nonce: number
  intent: 'chat' | 'plan' | 'research'
}

export interface MetaAIWorkspaceProps {
  session: MetaSession
  // Same-root agent sessions for the history picker (includes this
  // session; the picker excludes it). Never crosses project roots.
  siblings: MetaSession[]
  workspaceRoot: string | null
  activeFile: string | null
  fileName: string
  fileContent: string
  fileDirty: boolean
  contextEnabled: boolean
  onStatus: (status: string) => void
  onUpdateSession: (session: MetaSession) => void
  onOpenFile: (path: string, line?: number) => void
  onOpenSession: (sessionId: string) => void
  onFilesChanged: (changedPaths: string[]) => void
  onOpenProviderSettings: () => void
  initialPrompt?: MetaInitialPrompt | null
  onInitialPromptConsumed?: () => void
}

const MAX_PROMPT = 12000

// Selected history resolves to bounded text at send time: 1500 chars
// per ref, 6000 total. Refs never auto-attach — only these explicit
// user selections resolve.
const HISTORY_CHARS_PER_REF = 1500
const HISTORY_CHARS_TOTAL = 6000
const HISTORY_MAX_REFS = 12

const TASKS_HEIGHT_KEY = 'kryom.agentTasksHeight'
const TASKS_HEIGHT_MIN = 120
const TASKS_HEIGHT_MAX = 520
const TASKS_HEIGHT_DEFAULT = 240

function readTasksHeight(): number {
  try {
    const raw = window.localStorage.getItem(TASKS_HEIGHT_KEY)
    const parsed = raw === null ? NaN : Number.parseInt(raw, 10)

    if (Number.isFinite(parsed)) {
      return Math.min(
        TASKS_HEIGHT_MAX,
        Math.max(TASKS_HEIGHT_MIN, parsed)
      )
    }
  } catch {
    // Private mode: fall through to the default.
  }

  return TASKS_HEIGHT_DEFAULT
}

// Welcome/handoff prompts fire exactly once per nonce, even across
// StrictMode dev double-mounts (production mounts once; this only
// hardens development). Bounded: nonces are unique per tab.
const consumedPromptNonces = new Set<number>()

function timeOf(iso: string): string {
  const time = Date.parse(iso)

  if (Number.isNaN(time)) {
    return iso
  }

  return new Date(time).toLocaleTimeString('en-GB', { hour12: false })
}

export function MetaAIWorkspace(props: MetaAIWorkspaceProps) {
  const dialogs = useDialogs()
  const data = useMetaWorkspaceData(props.session)
  const [draft, setDraft] = useState(props.session.draft)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState<AIErrorKind>('unknown')
  const [keyMissing, setKeyMissing] = useState(false)
  const [includeFileContext, setIncludeFileContext] = useState(
    props.contextEnabled
  )
  const [includeResearch, setIncludeResearch] = useState(true)
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  )
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null)
  const [agentHandoff, setAgentHandoff] = useState<{
    text: string
    nonce: number
    researchSessionId?: string
  } | null>(null)
  const [researchHandoff, setResearchHandoff] = useState<{
    objective: string
    nonce: number
  } | null>(null)
  const [implOpen, setImplOpen] = useState(props.session.planId !== null)
  const [researchOpen, setResearchOpen] = useState(
    props.session.researchSessionId !== null
  )
  const [historyOpen, setHistoryOpen] = useState(
    props.session.historyRefs.length > 0
  )
  // Bottom Tasks panel: open when the session has anything to
  // report, collapsible and resizable (height persists locally).
  const [tasksOpen, setTasksOpen] = useState(
    props.session.planId !== null ||
      props.session.researchSessionId !== null ||
      props.session.changedFiles.length > 0
  )
  const [tasksHeight, setTasksHeight] = useState(readTasksHeight)
  const [tasksToken, setTasksToken] = useState(0)
  // resolvedHistory holds the selected refs as bounded text for the
  // conversation and the planner; refreshed when refs change.
  const [resolvedHistory, setResolvedHistory] = useState('')
  const sessionRef = useRef(props.session)
  sessionRef.current = props.session
  const sendingRef = useRef(false)
  // Embedded panels report null on mount before their restores land;
  // the first null never wipes a restored link, but later nulls
  // (fresh plan rounds) are honored.
  const planReportedRef = useRef(false)
  const researchReportedRef = useRef(false)
  const sendGenerationRef = useRef(0)
  const handoffNonce = useRef(0)
  const consumedPromptNonce = useRef<number | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)

  const session = props.session

  function updateSession(patch: Partial<MetaSession>): void {
    props.onUpdateSession(
      touchSession({ ...sessionRef.current, ...patch })
    )
  }

  function toggleHistoryRef(ref: HistoryRef): void {
    const current = sessionRef.current.historyRefs
    const key = (entry: HistoryRef) => `${entry.kind}:${entry.id}`
    const exists = current.some((entry) => key(entry) === key(ref))

    if (exists) {
      updateSession({ historyRefs: current.filter((entry) => key(entry) !== key(ref)) })
      return
    }

    if (current.length >= HISTORY_MAX_REFS) {
      props.onStatus(`History attachments capped at ${HISTORY_MAX_REFS}`)
      return
    }

    updateSession({ historyRefs: [...current, ref] })
  }

  // Resolves selected history refs to bounded text. Chat resolves via
  // the project excerpt, research via its brief, agent refs from the
  // same-root siblings in memory — a sibling from another root never
  // resolves, even if a crafted ref claims it.
  useEffect(() => {
    const refs = sessionRef.current.historyRefs

    if (refs.length === 0 || !props.workspaceRoot) {
      setResolvedHistory('')
      return
    }

    let cancelled = false

    void (async () => {
      const blocks: string[] = []
      const skipped: string[] = []
      let remaining = HISTORY_CHARS_TOTAL

      for (const ref of refs.slice(0, HISTORY_MAX_REFS)) {
        if (remaining <= 0) {
          break
        }

        const budget = Math.min(HISTORY_CHARS_PER_REF, remaining)
        let text = ''

        try {
          if (ref.kind === 'chat') {
            const excerpt = await kryom().getAgentChatExcerpt()

            text = excerpt.excerpt.slice(0, budget)
          } else if (ref.kind === 'research') {
            const brief = await kryom().getResearchBrief({ id: ref.id })

            text = brief.markdown.slice(0, budget)
          } else {
            const sibling = props.siblings.find(
              (entry) =>
                entry.id === ref.id && entry.root === sessionRef.current.root
            )

            if (sibling) {
              text = sibling.messages
                .slice(-6)
                .map((message) =>
                  `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`
                )
                .join('\n\n')
                .slice(0, budget)
            }
          }
        } catch {
          // One unreadable ref never blocks the rest, but the skip
          // is reported below instead of vanishing silently.
          skipped.push(ref.label)
        }

        if (text.trim() !== '') {
          blocks.push(`[${ref.kind}: ${ref.label}]\n${text}`)
          remaining -= Math.min(budget, text.length)
        }
      }

      if (!cancelled) {
        setResolvedHistory(blocks.join('\n\n---\n\n'))

        if (skipped.length > 0) {
          props.onStatus(`History unavailable: ${skipped.join(', ')}`)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session.historyRefs, props.workspaceRoot, props.siblings])

  function startTasksResize(event: {
    preventDefault: () => void
    clientY: number
  }): void {
    event.preventDefault()

    const startY = event.clientY
    const startHeight = tasksHeight
    let latest = startHeight

    function onMove(move: MouseEvent): void {
      latest = Math.min(
        TASKS_HEIGHT_MAX,
        Math.max(TASKS_HEIGHT_MIN, startHeight + (startY - move.clientY))
      )

      setTasksHeight(latest)
    }

    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      try {
        window.localStorage.setItem(TASKS_HEIGHT_KEY, String(latest))
      } catch {
        // Private mode: the height simply does not persist.
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Composer drafts persist on the session (debounced) so tab
  // switches and restarts never lose entered text.
  useEffect(() => {
    const snapshot = draft
    const timer = setTimeout(() => {
      if (sessionRef.current.draft !== snapshot) {
        props.onUpdateSession(
          touchSession({ ...sessionRef.current, draft: snapshot })
        )
      }
    }, 600)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    setIncludeFileContext(props.contextEnabled)
  }, [props.contextEnabled])

  function onMessagesScroll(): void {
    const element = messagesRef.current

    if (!element) {
      return
    }

    stickRef.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  useEffect(() => {
    // Phase E: same jsdom-safe follow as AiChat — scrollTo may be
    // absent outside real browsers.
    if (stickRef.current && messagesRef.current) {
      if (typeof messagesRef.current.scrollTo === "function") {
        messagesRef.current.scrollTo({
          top: messagesRef.current.scrollHeight,
        })
      } else {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight
      }
    }
  }, [session.messages, sending])

  async function buildContext(): Promise<string> {
    let base = ''

    if (includeFileContext && props.activeFile) {
      base =
        `Active file: ${props.activeFile}\n` +
        'Unsaved changes are included if present.\n\n' +
        props.fileContent.slice(0, 18000)
    } else if (props.workspaceRoot) {
      try {
        const summary = await kryom().getWorkspaceContext({ maxChars: 4000 })

        base =
          `Workspace root: ${props.workspaceRoot}\n` +
          `Project type: ${summary.projectType}\n\n${summary.context}`
      } catch {
        base = `Workspace root: ${props.workspaceRoot}`
      }
    }

    // User-selected history only: resolved refs as a delimited block.
    if (resolvedHistory.trim() !== '') {
      const prefix = base === '' ? '' : `${base}\n\n`

      return (
        `${prefix}Relevant selected history (prior sessions, may be stale):\n` +
        resolvedHistory
      )
    }

    return base
  }

  async function sendWithText(userPrompt: string): Promise<void> {
    if (!userPrompt || sending) {
      return
    }

    if (!online) {
      setErrorKind('network')
      setError(
        'Meta AI is currently offline. Your local development workspace is still available.'
      )
      setDraft(userPrompt)
      return
    }

    // Pre-flight: guide key setup instead of failing the request. A
    // status-check failure itself never blocks; the request reports
    // its own error in that case.
    try {
      const status = await kryom().getAIStatus()

      if (!status.modelKeyConfigured) {
        setDraft(userPrompt)
        setKeyMissing(true)
        props.onStatus('Meta AI is not configured')
        return
      }
    } catch {
      // Fall through to the request path.
    }

    setError('')
    setErrorKind('unknown')
    setKeyMissing(false)
    setSending(true)
    sendingRef.current = true

    const generation = sendGenerationRef.current + 1
    sendGenerationRef.current = generation
    const at = new Date().toISOString()
    const userMessage = { role: 'user' as const, content: userPrompt, at }

    try {
      const context = await buildContext()
      const history = sessionRef.current.messages
        .slice(-10)
        .map((message) => ({ role: message.role, content: message.content }))
      const attachedResearch =
        includeResearch && sessionRef.current.researchSessionId
          ? sessionRef.current.researchSessionId
          : undefined

      const result = await kryom().askAI({
        prompt: userPrompt,
        context,
        history,
        model: sessionRef.current.model,
        ...(attachedResearch ? { researchSessionId: attachedResearch } : {}),
      })

      if (generation !== sendGenerationRef.current) {
        return
      }

      const previous = sessionRef.current
      const nextMessages = [
        ...previous.messages,
        userMessage,
        {
          role: 'assistant' as const,
          content: result.answer,
          model: result.model,
          at: new Date().toISOString(),
        },
      ]

      props.onUpdateSession(
        touchSession({
          ...previous,
          messages: nextMessages.slice(-50),
          title:
            previous.messages.length === 0
              ? deriveSessionTitle(userPrompt)
              : previous.title,
          statusNote: `Responded at ${timeOf(new Date().toISOString())}`,
        })
      )
      props.onStatus(`Meta AI responded (${result.model})`)
    } catch (e) {
      if (
        isCancelError(e) &&
        sendGenerationRef.current === generation + 1
      ) {
        const previous = sessionRef.current

        props.onUpdateSession(
          touchSession({
            ...previous,
            messages: [...previous.messages, userMessage].slice(-50),
          })
        )
        return
      }

      if (generation !== sendGenerationRef.current) {
        return
      }

      const previous = sessionRef.current

      props.onUpdateSession(
        touchSession({
          ...previous,
          messages: [...previous.messages, userMessage].slice(-50),
        })
      )

      if (isCancelError(e)) {
        props.onStatus('Meta AI request cancelled')
      } else {
        const message = errorMessage(e)

        setErrorKind(classifyAIError(message))
        setError(message)
      }
    } finally {
      if (generation === sendGenerationRef.current) {
        setSending(false)
        sendingRef.current = false
      }
    }
  }

  function stopRequest(): void {
    sendGenerationRef.current += 1
    setSending(false)
    sendingRef.current = false
    props.onStatus('Meta AI request cancelled')
    kryom().cancelAI().catch(() => undefined)
  }

  // Closing the tab mid-request cancels the flight: the session keeps
  // whatever completed, and no orphaned request bills the user.
  useEffect(() => {
    return () => {
      if (sendingRef.current) {
        sendGenerationRef.current += 1
        kryom().cancelAI().catch(() => undefined)
      }
    }
  }, [])

  async function sendDraft(): Promise<void> {
    const userPrompt = draft.trim()

    if (!userPrompt || sending) {
      return
    }

    setDraft('')
    await sendWithText(userPrompt)
  }

  // Consumes one welcome/handoff prompt per nonce: chat prompts send
  // immediately, plan/research prompts hand to the embedded panels.
  useEffect(() => {
    const pending = props.initialPrompt

    if (!pending || pending.text.trim() === '') {
      return
    }

    if (
      consumedPromptNonce.current === pending.nonce ||
      consumedPromptNonces.has(pending.nonce)
    ) {
      return
    }

    consumedPromptNonce.current = pending.nonce
    consumedPromptNonces.add(pending.nonce)

    if (consumedPromptNonces.size > 200) {
      const oldest = consumedPromptNonces.values().next().value

      if (oldest !== undefined) {
        consumedPromptNonces.delete(oldest)
      }
    }

    props.onInitialPromptConsumed?.()

    if (pending.intent === 'plan') {
      handoffNonce.current += 1
      setAgentHandoff({
        text: pending.text.trim().slice(0, 4000),
        nonce: handoffNonce.current,
        ...(sessionRef.current.researchSessionId
          ? { researchSessionId: sessionRef.current.researchSessionId }
          : {}),
      })
      setImplOpen(true)
      props.onStatus('Agent task started — review the plan before applying')
      return
    }

    if (pending.intent === 'research') {
      handoffNonce.current += 1
      setResearchHandoff({
        objective: pending.text.trim().slice(0, 2000),
        nonce: handoffNonce.current,
      })
      setResearchOpen(true)
      props.onStatus('Research started')
      return
    }

    setDraft('')
    void sendWithText(pending.text.trim())
    // sendWithText reads live refs; the nonce guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialPrompt])

  function handleResearchImplement(research: KryomResearchSession): void {
    handoffNonce.current += 1
    setAgentHandoff({
      text:
        `Implement from research brief (session ${research.id}).\n` +
        `Objective: ${research.objective}\n` +
        "Follow the brief's ordered implementation tasks and acceptance criteria. " +
        "Cite the brief's sources when reporting which requirements are satisfied.",
      nonce: handoffNonce.current,
      researchSessionId: research.id,
    })
    setImplOpen(true)
    props.onStatus('Agent planning from research brief…')
  }

  function handleResearchAsk(research: KryomResearchSession): void {
    updateSession({ researchSessionId: research.id })
    setIncludeResearch(true)
    props.onStatus(`Research ${research.id} attached to this session`)
  }

  async function copyMessage(content: string, index: number): Promise<void> {
    try {
      if (!(await copyText(content))) throw new Error('clipboard write failed')
      setCopiedMessage(index)
      setTimeout(() => setCopiedMessage(null), 1500)
    } catch {
      setError('Copy is unavailable in this context.')
    }
  }

  async function clearConversation(): Promise<void> {
    if (sending || session.messages.length === 0) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Clear conversation?',
      message: 'The session keeps its linked plan, research, and changed files.',
      confirmLabel: 'Clear conversation',
    })

    if (confirmed) {
      updateSession({ messages: [], statusNote: '' })
      props.onStatus('Conversation cleared')
    }
  }

  const contextShort =
    includeFileContext && props.activeFile
      ? `${props.fileName}${props.fileDirty ? ' •' : ''}`
      : includeFileContext
        ? 'workspace summary'
        : 'context off'

  const modelOptions =
    data.models.length > 0
      ? data.models
      : [
          {
            modelId: session.model,
            displayName: modelDisplayName(session.model),
          },
        ]

  return (
    <section className="meta-workspace" aria-label={`Meta AI session ${session.title}`}>
      <header className="meta-head">
        <span className="meta-identity">
          <MetaMark size={16} gradient label="Meta AI" />
          <strong className="meta-title">{session.title}</strong>
        </span>
        <span className="spacer" />
        {sending && (
          <span className="muted meta-working" role="status">
            Working…
          </span>
        )}
      </header>

      {!online && (
        <div className="meta-banner" role="alert">
          <strong>Meta AI is currently offline.</strong>
          <span> Your local development workspace is still available.</span>
        </div>
      )}

      {online && keyMissing && (
        <div className="meta-banner" role="alert">
          <strong>Meta AI is not configured.</strong>
          <span> Add your API key to start this session.</span>
          <button
            type="button"
            className="secondary-button"
            onClick={props.onOpenProviderSettings}
          >
            Configure Provider
          </button>
        </div>
      )}

      {error && errorKind !== 'network' && (
        <div className="ai-error" role="alert">
          <strong>
            {errorKind === 'auth'
              ? 'Meta AI authentication failed'
              : errorKind === 'rate-limit'
                ? 'Meta AI rate limit reached'
                : errorKind === 'missing-key'
                  ? 'Meta AI is not configured'
                  : 'Meta AI request failed'}
          </strong>
          <p>{error}</p>
          <div className="notice-actions">
            {(errorKind === 'auth' || errorKind === 'missing-key') && (
              <button
                type="button"
                className="secondary-button"
                onClick={props.onOpenProviderSettings}
              >
                Open Provider Settings
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => setError('')}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && errorKind === 'network' && online && (
        <div className="ai-error" role="alert">
          <strong>Meta AI request failed</strong>
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        ref={messagesRef}
        onScroll={onMessagesScroll}
        className="ai-messages meta-messages"
        aria-live="polite"
      >
        {session.messages.length === 0 && (
          <div className="ai-empty">
            <div className="ai-empty-icon">
              <MetaMark size={22} gradient />
            </div>
            <h3>What are we building?</h3>
            <p>
              Ask for explanations, debugging help, or implementation
              ideas — or start an implementation or research task below.
            </p>
            <p className="muted">
              AI suggestions do not change files automatically.
            </p>
          </div>
        )}

        {session.messages.map((message, index) => (
          <article
            className={`chat-message ${message.role}`}
            key={`${message.at}-${index}`}
          >
            <div className="message-role">
              <span>
                {message.role === 'user'
                  ? 'YOU'
                  : `META AI${message.model ? ` · ${modelDisplayName(message.model)}` : ''}`}
              </span>
              <button
                type="button"
                className="mini-btn"
                onClick={() => void copyMessage(message.content, index)}
                title="Copy message text"
              >
                {copiedMessage === index ? 'Copied' : 'Copy'}
              </button>
            </div>
            {message.role === 'user' ? (
              <p className="md-para">{message.content}</p>
            ) : (
              <MarkdownLite text={message.content} />
            )}
          </article>
        ))}

        {sending && (
          <div className="ai-loading" role="status">
            <span className="loading-dot" />
            Meta AI is thinking…
          </div>
        )}
      </div>

      <details
        className="meta-embedded"
        open={implOpen}
        onToggle={(event) =>
          setImplOpen((event.target as HTMLDetailsElement).open)
        }
      >
        <summary>
          <strong>Implementation</strong>
          <span className="muted">
            {session.planId
              ? ` · plan ${session.planId}`
              : ' · plan, review, apply, verify'}
          </span>
        </summary>
        <AgentPanel
          workspaceRoot={props.workspaceRoot}
          defaultModel={session.model}
          defaultIncludeContext={props.contextEnabled}
          activeFile={props.activeFile}
          activeFileDirty={props.fileDirty}
          onFilesChanged={props.onFilesChanged}
          onStatus={props.onStatus}
          pendingTask={agentHandoff}
          historyContext={resolvedHistory !== '' ? resolvedHistory : null}
          onOpenConnections={props.onOpenProviderSettings}
          onOpenFile={props.onOpenFile}
          draftKey={props.workspaceRoot ? `meta:${session.id}` : null}
          onPlanTracked={(planId) => {
            const firstNull =
              planId === null &&
              sessionRef.current.planId !== null &&
              !planReportedRef.current

            planReportedRef.current = true

            if (!firstNull && planId !== sessionRef.current.planId) {
              updateSession({
                planId,
                reviewState: planId ? 'awaiting-review' : sessionRef.current.reviewState,
                statusNote: planId ? `Plan ${planId} tracked` : sessionRef.current.statusNote,
              })
              setTasksToken((token) => token + 1)
            }
          }}
          onApplyCompleted={(applied) => {
            const next = recordChangedFiles(
              sessionRef.current,
              applied,
              'agent-apply'
            )

            props.onUpdateSession(
              touchSession({
                ...next,
                reviewState: 'applied',
                statusNote: `Applied ${applied.length} file(s)`,
              })
            )
            data.refresh()
            setTasksToken((token) => token + 1)
          }}
        />
      </details>

      <details
        className="meta-embedded"
        open={researchOpen}
        onToggle={(event) =>
          setResearchOpen((event.target as HTMLDetailsElement).open)
        }
      >
        <summary>
          <strong>Research</strong>
          <span className="muted">
            {session.researchSessionId
              ? ` · ${session.researchSessionId}`
              : ' · cited briefs'}
          </span>
        </summary>
        <ResearchPanel
          workspaceRoot={props.workspaceRoot}
          onStatus={props.onStatus}
          onImplement={handleResearchImplement}
          onAsk={handleResearchAsk}
          pendingStart={researchHandoff}
          sessionId={session.researchSessionId}
          onSessionChange={(researchId) => {
            const firstNull =
              researchId === null &&
              sessionRef.current.researchSessionId !== null &&
              !researchReportedRef.current

            researchReportedRef.current = true

            if (!firstNull && researchId !== sessionRef.current.researchSessionId) {
              updateSession({ researchSessionId: researchId })
              setTasksToken((token) => token + 1)
            }
          }}
        />
      </details>

      <details
        className="meta-embedded"
        open={historyOpen}
        onToggle={(event) =>
          setHistoryOpen((event.target as HTMLDetailsElement).open)
        }
      >
        <summary>
          <strong>History</strong>
          <span className="muted">
            {session.historyRefs.length > 0
              ? ` · ${session.historyRefs.length} attached`
              : ' · attach prior sessions'}
          </span>
        </summary>
        <AgentHistoryPicker
          session={session}
          siblings={props.siblings}
          workspaceRoot={props.workspaceRoot}
          taskQuery={draft}
          onToggleRef={toggleHistoryRef}
          onOpenSession={props.onOpenSession}
          onStatus={props.onStatus}
        />
      </details>

      {tasksOpen && (
        <section
          className="agent-tasks-wrap"
          style={{ height: tasksHeight }}
          aria-label="Session tasks panel"
        >
          <div
            className="agent-tasks-grip"
            role="separator"
            aria-orientation="horizontal"
            aria-label={`Resize tasks panel (currently ${tasksHeight} pixels)`}
            aria-valuenow={tasksHeight}
            aria-valuemin={TASKS_HEIGHT_MIN}
            aria-valuemax={TASKS_HEIGHT_MAX}
            title="Drag or use arrow keys to resize the tasks panel"
            tabIndex={0}
            onMouseDown={startTasksResize}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
                return
              }

              event.preventDefault()

              const next = Math.min(
                TASKS_HEIGHT_MAX,
                Math.max(
                  TASKS_HEIGHT_MIN,
                  tasksHeight + (event.key === 'ArrowUp' ? 20 : -20)
                )
              )

              setTasksHeight(next)

              try {
                window.localStorage.setItem(TASKS_HEIGHT_KEY, String(next))
              } catch {
                // Private mode: the height simply does not persist.
              }
            }}
          />
          <AgentTasksPanel
            session={session}
            workspaceRoot={props.workspaceRoot}
            refreshToken={tasksToken}
            onOpenFile={props.onOpenFile}
            onStatus={props.onStatus}
          />
        </section>
      )}

      <form
        className="ai-composer meta-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void sendDraft()
        }}
      >
        <div className="meta-composer-input">
          <span className="meta-composer-mark" aria-hidden="true">
            <MetaMark size={15} gradient label={undefined} />
          </span>
          <textarea
            aria-label="Message Meta AI"
            value={draft}
            onChange={(event) =>
              setDraft(event.target.value.slice(0, MAX_PROMPT))
            }
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                void sendDraft()
              }
            }}
            placeholder="Describe a change or ask a question…"
            rows={2}
            maxLength={MAX_PROMPT}
            disabled={sending}
          />
        </div>
        <div className="composer-footer meta-composer-footer">
          <span className="muted" title="Active file context">
            {contextShort}
          </span>
          <label
            className="ai-toolbar-check"
            title="Sends the active file (first ~18,000 characters, unsaved edits included) with each request"
          >
            <input
              type="checkbox"
              checked={includeFileContext}
              onChange={(event) =>
                setIncludeFileContext(event.target.checked)
              }
            />
            Context
          </label>
          {session.researchSessionId && (
            <label
              className="ai-toolbar-check"
              title={`Research brief ${session.researchSessionId} is attached as cited context`}
            >
              <input
                type="checkbox"
                checked={includeResearch}
                onChange={(event) =>
                  setIncludeResearch(event.target.checked)
                }
              />
              Research
            </label>
          )}
          <button
            type="button"
            className="secondary-button"
            aria-pressed={tasksOpen}
            onClick={() => setTasksOpen((open) => !open)}
            title="Show or hide the session Tasks panel below"
          >
            Work Summary
          </button>
          <button
            type="button"
            className="secondary-button"
            aria-pressed={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            title="Attach previous chat, research, or agent history as context"
          >
            History
            {session.historyRefs.length > 0
              ? ` · ${session.historyRefs.length}`
              : ''}
          </button>
          <select
            value={session.model}
            onChange={(event) => updateSession({ model: event.target.value })}
            disabled={sending}
            aria-label="Session model"
            title="Model for this session"
          >
            {modelOptions.map((entry) => (
              <option key={entry.modelId} value={entry.modelId}>
                {'displayName' in entry && entry.displayName
                  ? entry.displayName
                  : entry.modelId}
              </option>
            ))}
          </select>
          <span className="spacer" />
          {session.messages.length > 0 && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void clearConversation()}
              disabled={sending}
              title="Clear this session's conversation"
            >
              Clear
            </button>
          )}
          {sending ? (
            <button type="button" onClick={stopRequest}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={draft.trim() === ''}>
              Start
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
