// Unified welcome composer (Phase B). One polished foundation for
// Chat, Research, and Agent: multiline auto-resizing input, per-mode
// limits with honest validation, and an action row wired only to
// real controls (attach is Chat-only because only the Chat pipeline
// consumes excerpts; approval reflects confirmAllCommands; models
// come from the provider catalog). Enter inserts a newline; Ctrl+Enter
// (or the Send button) submits.
import { useEffect, useRef } from 'react'
import { baseName } from '../utils/paths'

export type ComposerMode = 'chat' | 'research' | 'agent'

export interface ComposerModelOption {
  id: string
  label: string
}

export interface ComposerProps {
  mode: ComposerMode
  value: string
  onChange: (value: string) => void
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
  running: boolean
  onSubmit: () => void
  onStop: () => void
}

const MAX_HEIGHT = 200

const MODE_LABEL: Record<ComposerMode, string> = {
  chat: 'Chat',
  research: 'Research',
  agent: 'Agent',
}

export function Composer(props: ComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const overLimit = props.value.length > props.maxLength
  const empty = props.value.trim() === ''
  const canSend =
    !props.running && !empty && !overLimit && !props.attaching
  const showAttach = props.mode === 'chat'

  // Auto-resize to content, then internal scroll past MAX_HEIGHT.
  useEffect(() => {
    const area = areaRef.current

    if (!area) {
      return
    }

    area.style.height = 'auto'
    area.style.height = `${Math.min(area.scrollHeight, MAX_HEIGHT)}px`
  }, [props.value])

  function submit() {
    if (canSend) {
      props.onSubmit()
    }
  }

  return (
    <div className="composer">
      {showAttach && props.attachments.length > 0 && (
        <div className="attach-row composer-attach-row">
          {props.attachments.map((file) => (
            <span
              key={file.path}
              className="attach-chip"
              title={`${file.path} · ${file.chars} chars${file.truncated ? ' (truncated)' : ''}`}
            >
              <span className="attach-name">{baseName(file.path)}</span>
              <button
                type="button"
                className="attach-remove"
                onClick={() => props.onRemoveAttachment(file.path)}
                disabled={props.running}
                aria-label={`Remove ${file.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {showAttach && props.attachError !== '' && (
        <p className="attach-error" role="alert">
          {props.attachError}
        </p>
      )}

      <textarea
        ref={areaRef}
        className="composer-input"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter is always a newline; only Ctrl+Enter submits, so
          // multiline editing never fires accidentally.
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder={props.placeholder}
        aria-label={`${MODE_LABEL[props.mode]} prompt`}
        rows={3}
      />

      <div className="composer-actions">
        {showAttach && (
          <button
            type="button"
            className="composer-btn"
            onClick={props.onAttach}
            disabled={props.running || props.attaching}
            title="Attach file excerpts to this conversation (read once, sent with each request)"
            aria-label="Attach files"
          >
            {props.attaching ? 'Attaching…' : '+ Attach'}
          </button>
        )}

        <button
          type="button"
          className={
            props.approvalRequired
              ? 'composer-btn composer-approval on'
              : 'composer-btn composer-approval'
          }
          onClick={props.onToggleApproval}
          disabled={props.running}
          title={
            props.approvalRequired
              ? 'Approval required: every terminal and diagnostics command asks first (click to relax)'
              : 'Approvals relaxed for routine commands (click to require approval)'
          }
          aria-pressed={props.approvalRequired}
          aria-label="Toggle approval requirement"
        >
          {props.approvalRequired ? 'Approval: On' : 'Approval: Off'}
        </button>

        <label className="composer-model" title="Model for this conversation (from the configured Meta catalog)">
          <span className="sr-only">Model</span>
          <select
            value={props.model}
            onChange={(event) => props.onModelChange(event.target.value)}
            disabled={props.running || props.modelOptions.length === 0}
            aria-label="Model"
          >
            {props.modelOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <span
          className={overLimit ? 'composer-count over' : 'composer-count'}
          title={`Input limit: ${props.maxLength.toLocaleString()} characters`}
        >
          {props.value.length.toLocaleString()} / {props.maxLength.toLocaleString()}
        </span>

        <span className="spacer" />

        {overLimit && (
          <span className="composer-error" role="alert">
            Over the {props.mode} limit by{' '}
            {(props.value.length - props.maxLength).toLocaleString()} characters.
          </span>
        )}

        {props.running ? (
          <button
            type="button"
            className="composer-send stop"
            onClick={props.onStop}
            aria-label="Stop request"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="composer-send"
            onClick={submit}
            disabled={!canSend}
            title={empty ? 'Type a prompt first' : 'Send (Ctrl+Enter)'}
            aria-label="Send prompt"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
