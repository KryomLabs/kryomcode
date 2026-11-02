// Welcome hero (Phase B): one headline, the unified composer, and
// a compact context toolbar. No logo badge, no brand text, no mode
// buttons — the mode selector lives in the parent, pinned in one
// position across hero and conversation states.
import { Composer, type ComposerMode, type ComposerModelOption } from './Composer'

export interface HomeHeroProps {
  mode: ComposerMode
  draft: string
  onDraftChange: (value: string) => void
  placeholder: string
  maxLength: number
  model: string
  modelOptions: ComposerModelOption[]
  onModelChange: (model: string) => void
  approvalRequired: boolean
  onToggleApproval: () => void
  attachments: KryomContextFile[]
  onAttach: () => void
  onRemoveAttachment: (path: string) => void
  attaching: boolean
  attachError: string
  onSubmit: () => void
  projectName: string | null
  onOpenProject: () => void
  activeFileName: string
  onOpenActiveFile: (() => void) | null
  onNewConversation: () => void
}

export function HomeHero(props: HomeHeroProps) {
  return (
    <div className="hero hero-b">
      <h1 className="hero-title">What should we build &amp; discover?</h1>

      <div className="hero-composer">
        <Composer
          mode={props.mode}
          value={props.draft}
          onChange={props.onDraftChange}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          model={props.model}
          modelOptions={props.modelOptions}
          onModelChange={props.onModelChange}
          approvalRequired={props.approvalRequired}
          onToggleApproval={props.onToggleApproval}
          attachments={props.attachments}
          onAttach={props.onAttach}
          onRemoveAttachment={props.onRemoveAttachment}
          attaching={props.attaching}
          attachError={props.attachError}
          running={false}
          onSubmit={props.onSubmit}
          onStop={() => undefined}
        />
      </div>

      <div className="hero-toolbar" role="toolbar" aria-label="Context">
        <button
          type="button"
          className="toolbar-btn"
          onClick={props.onOpenProject}
          title={
            props.projectName
              ? `Current project: ${props.projectName} — click to switch`
              : 'Open a project folder'
          }
        >
          {props.projectName ? `Project: ${props.projectName}` : 'Choose Project'}
        </button>

        {props.activeFileName !== '' && (
          <button
            type="button"
            className="toolbar-btn"
            onClick={props.onOpenActiveFile ?? undefined}
            disabled={props.onOpenActiveFile === null}
            title={`Active file: ${props.activeFileName}`}
          >
            File: {props.activeFileName}
          </button>
        )}

        <button
          type="button"
          className="toolbar-btn"
          onClick={props.onNewConversation}
          title="Clear this mode and start a new conversation"
        >
          New conversation
        </button>
      </div>
    </div>
  )
}
