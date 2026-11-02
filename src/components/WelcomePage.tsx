// Unified AI workspace home (Phase B): one pinned Chat/Research/
// Agent selector, one headline hero with the unified composer, and
// the three existing pipelines (ChatSessions, ResearchPanel,
// AgentPanel) behind submitted state. Drafts survive mode switches;
// each mode keeps its own limits, model pick, and backend.
import { useEffect, useRef, useState } from 'react'
import { kryom, errorMessage } from '../api/kryom'
import { baseName } from '../utils/paths'
import { useProviderModels } from '../hooks/useProviderModels'
import { modelDisplayName } from '../utils/models'
import { ChatSessions } from './ChatSessions'
import { HomeHero } from './HomeHero'
import { ResearchPanel } from './ResearchPanel'
import { AgentPanel } from './AgentPanel'
import type { ComposerMode } from './Composer'

export type DiscoveryMode = ComposerMode
export const DISCOVERY_MODES: DiscoveryMode[] = ['chat', 'research', 'agent']

const MODE_META: Record<
  DiscoveryMode,
  { label: string; placeholder: string; maxLength: number }
> = {
  chat: {
    label: 'Chat',
    placeholder: 'Ask anything about your code...',
    maxLength: 12000,
  },
  research: {
    label: 'Research',
    placeholder: 'What should we investigate?',
    maxLength: 2000,
  },
  agent: {
    label: 'Agent',
    placeholder: 'Describe what you want to build...',
    maxLength: 4000,
  },
}

const MAX_ATTACHMENTS = 8

export interface WelcomePageProps {
  mode: DiscoveryMode
  onModeChange: (mode: DiscoveryMode) => void
  workspaceRoot: string | null
  defaultModel: string
  activeFile: string | null
  fileName: string
  fileContent: string
  fileDirty: boolean
  contextEnabled: boolean
  chatResearchId: string | null
  onDetachChatResearch: () => void
  onOpenInAgent: (text: string) => void
  onResearchImplement: (session: KryomResearchSession) => void
  onResearchAsk: (session: KryomResearchSession) => void
  onStatus: (status: string) => void
  onOpenProviderSettings: () => void
  onFilesChanged: (changedPaths: string[]) => void
  confirmAllCommands: boolean
  onToggleConfirmAll: () => void
  onOpenProject: () => void
  // History deep-open: jump into an existing thread.
  chatSelect?: { id: string; nonce: number } | null
  researchRestore?: { sessionId: string; nonce: number } | null
  // History new-thread: reset one mode to its hero.
  newRequest?: { mode: DiscoveryMode; nonce: number } | null
  // External prompt (Explain selection / Explain error): consumed once
  // per nonce, then reported back so the parent clears it. Behaves
  // exactly like a hero submit.
  initialPrompt?: { text: string; nonce: number } | null
  onInitialPromptConsumed?: () => void
  onOpenFile?: (path: string) => void
}

export function WelcomePage(props: WelcomePageProps) {
  const [drafts, setDrafts] = useState<Record<DiscoveryMode, string>>({
    chat: '',
    research: '',
    agent: '',
  })
  const [model, setModel] = useState(props.defaultModel)
  const [chatPrompt, setChatPrompt] = useState<{
    text: string
    nonce: number
  } | null>(null)
  const [chatAttachments, setChatAttachments] = useState<{
    files: KryomContextFile[]
    nonce: number
  } | null>(null)
  const [researchStart, setResearchStart] = useState<{
    objective: string
    nonce: number
  } | null>(null)
  const [agentTask, setAgentTask] = useState<{
    text: string
    nonce: number
  } | null>(null)
  const [chatSubmitted, setChatSubmitted] = useState(false)
  const [researchSubmitted, setResearchSubmitted] = useState(false)
  const [agentSubmitted, setAgentSubmitted] = useState(false)
  const [restoredResearchId, setRestoredResearchId] = useState<string | null>(
    null
  )
  const [attachments, setAttachments] = useState<KryomContextFile[]>([])
  const [attaching, setAttaching] = useState(false)
  const [attachError, setAttachError] = useState('')
  const [nonce, setNonce] = useState(0)

  // Models come from the backend catalog; the stored default keeps
  // the picker (and Meta-first default) working when unreachable.
  const { models: catalogModels } = useProviderModels('meta')
  const modelOptions =
    catalogModels.length === 0
      ? [{ id: model, label: modelDisplayName(model) }]
      : catalogModels.some((entry) => entry.modelId === model)
        ? catalogModels.map((entry) => ({
            id: entry.modelId,
            label: entry.displayName,
          }))
        : [
            { id: model, label: modelDisplayName(model) },
            ...catalogModels.map((entry) => ({
              id: entry.modelId,
              label: entry.displayName,
            })),
          ]

  useEffect(() => {
    setModel(props.defaultModel)
  }, [props.defaultModel])

  // Pending payloads clear after the child consumes them on mount,
  // so mode-switch remounts never resubmit.
  useEffect(() => {
    if (chatPrompt !== null) {
      setChatPrompt(null)
    }
  }, [chatPrompt])

  useEffect(() => {
    if (chatAttachments !== null) {
      setChatAttachments(null)
    }
  }, [chatAttachments])

  useEffect(() => {
    if (researchStart !== null) {
      setResearchStart(null)
    }
  }, [researchStart])

  useEffect(() => {
    if (agentTask !== null) {
      setAgentTask(null)
    }
  }, [agentTask])

  // History deep-open: chat thread.
  const consumedChatSelect = useRef<number | null>(null)

  useEffect(() => {
    const select = props.chatSelect

    if (!select || consumedChatSelect.current === select.nonce) {
      return
    }

    consumedChatSelect.current = select.nonce
    setChatSubmitted(true)
    props.onModeChange('chat')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.chatSelect])

  // History deep-open: research session.
  const consumedResearchRestore = useRef<number | null>(null)

  useEffect(() => {
    const restore = props.researchRestore

    if (!restore || consumedResearchRestore.current === restore.nonce) {
      return
    }

    consumedResearchRestore.current = restore.nonce
    setRestoredResearchId(restore.sessionId)
    setResearchSubmitted(true)
    props.onModeChange('research')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.researchRestore])

  // History new-thread: reset one mode to its hero.
  const consumedNewRequest = useRef<number | null>(null)

  useEffect(() => {
    const request = props.newRequest

    if (!request || consumedNewRequest.current === request.nonce) {
      return
    }

    consumedNewRequest.current = request.nonce

    if (request.mode === 'chat') {
      setChatSubmitted(false)
    } else if (request.mode === 'research') {
      setRestoredResearchId(null)
      setResearchSubmitted(false)
    } else {
      setAgentSubmitted(false)
    }

    props.onModeChange(request.mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.newRequest])

  // External prompts land exactly like hero submits.
  const consumedExternalNonce = useRef<number | null>(null)

  useEffect(() => {
    const external = props.initialPrompt

    if (!external || external.text.trim() === '') {
      return
    }

    if (consumedExternalNonce.current === external.nonce) {
      return
    }

    consumedExternalNonce.current = external.nonce
    setChatSubmitted(true)
    setChatPrompt({ text: external.text, nonce: external.nonce })
    props.onModeChange('chat')
    props.onInitialPromptConsumed?.()
    // Runs on mount and whenever the parent offers a new prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialPrompt])

  async function attachFiles() {
    if (attaching) {
      return
    }

    setAttaching(true)
    setAttachError('')

    try {
      const picked = await kryom().pickContextFiles()

      if (picked.canceled || picked.paths.length === 0) {
        return
      }

      const fresh: KryomContextFile[] = []
      const seen = new Set(attachments.map((file) => file.path))

      for (const filePath of picked.paths) {
        if (seen.has(filePath)) {
          continue
        }

        if (attachments.length + fresh.length >= MAX_ATTACHMENTS) {
          setAttachError(`Attachment limit reached (${MAX_ATTACHMENTS} files).`)
          break
        }

        try {
          const excerpt = await kryom().readContextFile({ path: filePath })
          seen.add(excerpt.path)
          fresh.push(excerpt)
        } catch (e: unknown) {
          setAttachError(`Could not attach ${filePath}: ${errorMessage(e)}`)
        }
      }

      if (fresh.length > 0) {
        setAttachments((previous) => [...previous, ...fresh])
      }
    } catch (e: unknown) {
      setAttachError(errorMessage(e))
    } finally {
      setAttaching(false)
    }
  }

  function handleHeroSubmit() {
    const text = drafts[props.mode].trim()

    if (text === '') {
      return
    }

    const next = nonce + 1
    setNonce(next)

    if (props.mode === 'chat') {
      setChatSubmitted(true)
      setChatPrompt({ text, nonce: next })
      setChatAttachments({ files: attachments, nonce: next })
      setAttachments([])
      setDrafts((previous) => ({ ...previous, chat: '' }))
      return
    }

    // Research and Agent need a workspace; without one the panel
    // cannot start, so stay on the hero and say why.
    if (!props.workspaceRoot) {
      props.onStatus(
        props.mode === 'research'
          ? 'Open a workspace to run research'
          : 'Open a workspace to run the agent'
      )
      return
    }

    if (props.mode === 'research') {
      setRestoredResearchId(null)
      setResearchSubmitted(true)
      setResearchStart({ objective: text, nonce: next })
      setDrafts((previous) => ({ ...previous, research: '' }))
      return
    }

    setAgentSubmitted(true)
    setAgentTask({ text, nonce: next })
    setDrafts((previous) => ({ ...previous, agent: '' }))
  }

  function handleNewConversation() {
    if (props.mode === 'chat') {
      setChatSubmitted(false)
    } else if (props.mode === 'research') {
      setRestoredResearchId(null)
      setResearchSubmitted(false)
    } else {
      setAgentSubmitted(false)
    }
  }

  const submitted =
    props.mode === 'chat'
      ? chatSubmitted
      : props.mode === 'research'
        ? researchSubmitted
        : agentSubmitted
  const meta = MODE_META[props.mode]

  return (
    <div className="discovery">
      <div
        className="discovery-switch workspace-modes"
        role="group"
        aria-label="AI Workspace mode"
      >
        {DISCOVERY_MODES.map((id) => (
          <button
            key={id}
            type="button"
            className={props.mode === id ? 'segment active' : 'segment'}
            aria-pressed={props.mode === id}
            onClick={() => props.onModeChange(id)}
          >
            {MODE_META[id].label}
          </button>
        ))}
      </div>

      {!submitted ? (
        <div className="discovery-body">
          <HomeHero
            mode={props.mode}
            draft={drafts[props.mode]}
            onDraftChange={(value) =>
              setDrafts((previous) => ({ ...previous, [props.mode]: value }))
            }
            placeholder={meta.placeholder}
            maxLength={meta.maxLength}
            model={model}
            modelOptions={modelOptions}
            onModelChange={setModel}
            approvalRequired={props.confirmAllCommands}
            onToggleApproval={props.onToggleConfirmAll}
            attachments={attachments}
            onAttach={() => void attachFiles()}
            onRemoveAttachment={(path) =>
              setAttachments((previous) =>
                previous.filter((file) => file.path !== path)
              )
            }
            attaching={attaching}
            attachError={attachError}
            onSubmit={handleHeroSubmit}
            projectName={
              props.workspaceRoot ? baseName(props.workspaceRoot) : null
            }
            onOpenProject={props.onOpenProject}
            activeFileName={props.fileName}
            onOpenActiveFile={
              props.activeFile && props.onOpenFile
                ? () => props.onOpenFile?.(props.activeFile as string)
                : null
            }
            onNewConversation={handleNewConversation}
          />
        </div>
      ) : (
        <div className="discovery-body">
          {props.mode === 'chat' ? (
            <ChatSessions
              workspaceRoot={props.workspaceRoot}
              activeFile={props.activeFile}
              fileName={props.fileName}
              fileContent={props.fileContent}
              dirty={props.fileDirty}
              defaultModel={model}
              contextEnabled={props.contextEnabled}
              onStatus={props.onStatus}
              pendingPrompt={chatPrompt}
              pendingAttachments={chatAttachments}
              researchSessionId={props.chatResearchId}
              onDetachResearch={props.onDetachChatResearch}
              onOpenConnections={props.onOpenProviderSettings}
              onOpenInAgent={props.onOpenInAgent}
              onOpenFile={props.onOpenFile}
              externalSelect={props.chatSelect ?? null}
            />
          ) : props.mode === 'research' ? (
            <ResearchPanel
              workspaceRoot={props.workspaceRoot}
              onStatus={props.onStatus}
              pendingStart={researchStart}
              defaultModel={model}
              sessionId={restoredResearchId}
              onImplement={props.onResearchImplement}
              onAsk={props.onResearchAsk}
            />
          ) : (
            <AgentPanel
              workspaceRoot={props.workspaceRoot}
              defaultModel={model}
              defaultIncludeContext={props.contextEnabled}
              activeFile={props.activeFile}
              activeFileDirty={props.fileDirty}
              onFilesChanged={props.onFilesChanged}
              onStatus={props.onStatus}
              pendingTask={agentTask}
              onOpenConnections={props.onOpenProviderSettings}
              onOpenFile={props.onOpenFile}
            />
          )}
        </div>
      )}
    </div>
  )
}
