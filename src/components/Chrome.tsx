import { baseName } from '../utils/paths'
import { modelDisplayName } from '../utils/models'
import logoUrl from '../../assets/branding/kryomcode-logo.png'

export interface TitleBarProps {
  workspaceRoot: string | null
  activeLabel: string | null
  dirty: boolean
  sidebarVisible: boolean
  bottomOpen: boolean
  asideOpen: boolean
  canGoBack: boolean
  canGoForward: boolean
  onToggleSidebar: () => void
  onToggleBottom: () => void
  onToggleAside: () => void
  onOpenPalette: () => void
  onGoBack: () => void
  onGoForward: () => void
}

function LayoutIcon({ kind }: { kind: 'left' | 'right' | 'bottom' }) {
  const bar =
    kind === 'left'
      ? 'M4 5h4v14H4z'
      : kind === 'right'
        ? 'M16 5h4v14h-4z'
        : 'M4 15h16v4H4z'

  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d={bar} fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  )
}

function NavIcon({ forward }: { forward: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      {forward ? (
        <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

// Compact IDE title bar under the native menu (File … Help stay
// native for accessibility and window behavior; minimize/maximize/
// close stay on the native OS frame). Shows the product icon once —
// the OS window title carries the wordmark — plus workbench file
// navigation, the current workspace, the active editor, a
// command-center entry, and layout controls. Auto-save state lives
// in the status bar only.
export function TitleBar(props: TitleBarProps) {
  const project = props.workspaceRoot ? baseName(props.workspaceRoot) : null

  return (
    <header className="titlebar">
      <span className="title-brand" title="KryomCode">
        <img
          className="title-logo"
          src={logoUrl}
          alt="KryomCode"
          width={18}
          height={18}
        />
      </span>

      <span className="title-nav" role="group" aria-label="Navigate">
        <button
          type="button"
          className="title-layout-btn"
          onClick={props.onGoBack}
          disabled={!props.canGoBack}
          title="Go back (Alt+Left)"
          aria-label="Go back"
        >
          <NavIcon forward={false} />
        </button>
        <button
          type="button"
          className="title-layout-btn"
          onClick={props.onGoForward}
          disabled={!props.canGoForward}
          title="Go forward (Alt+Right)"
          aria-label="Go forward"
        >
          <NavIcon forward={true} />
        </button>
      </span>

      <span className="title-crumb muted" title={props.workspaceRoot ?? ''}>
        {project ?? 'No project selected'}
        {props.activeLabel ? ` › ${props.activeLabel}${props.dirty ? ' •' : ''}` : ''}
      </span>

      <button
        type="button"
        className="title-palette-btn"
        onClick={props.onOpenPalette}
        title="Command palette (Ctrl+Shift+P) · Go to file (Ctrl+P)"
        aria-label="Open command palette"
      >
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.2-4.2" strokeLinecap="round" />
        </svg>
        <span>Search files, commands…</span>
      </button>

      <span className="spacer" />

      <span className="title-layout" role="group" aria-label="Layout">
        <button
          type="button"
          className="title-layout-btn"
          onClick={props.onToggleSidebar}
          title={props.sidebarVisible ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
          aria-label={props.sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          aria-pressed={props.sidebarVisible}
        >
          <LayoutIcon kind="left" />
        </button>
        <button
          type="button"
          className="title-layout-btn"
          onClick={props.onToggleAside}
          title={props.asideOpen ? 'Hide auxiliary panel' : 'Show auxiliary panel'}
          aria-label={props.asideOpen ? 'Hide auxiliary panel' : 'Show auxiliary panel'}
          aria-pressed={props.asideOpen}
        >
          <LayoutIcon kind="right" />
        </button>
        <button
          type="button"
          className="title-layout-btn"
          onClick={props.onToggleBottom}
          title={props.bottomOpen ? 'Hide bottom panel (Ctrl+J)' : 'Show bottom panel (Ctrl+J)'}
          aria-label={props.bottomOpen ? 'Hide bottom panel' : 'Show bottom panel'}
          aria-pressed={props.bottomOpen}
        >
          <LayoutIcon kind="bottom" />
        </button>
      </span>
    </header>
  )
}

export interface StatusBarProps {
  status: string
  workspaceName: string | null
  branch: string | null
  branchKnown: boolean
  onBranchRefresh: () => void
  fileName: string | null
  dirty: boolean
  language: string | null
  line: number | null
  column: number | null
  model: string
  providerLabel: string | null
  providerOk: boolean | null
  onOpenProviderSettings: () => void
  autoSave: boolean
  terminalRunning: boolean
  diagnostics: { count: number; success: boolean } | null
  onShowDiagnostics: () => void
  bottomOpen: boolean
  onToggleBottom: () => void
}

// Compact status bar. Every segment is verified live state: no fake
// counts, branches, or diagnostics.
export function StatusBar(props: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span className="status-left">
        <button
          className="status-toggle"
          onClick={props.onToggleBottom}
          title={
            props.bottomOpen
              ? 'Hide bottom panel (Ctrl+J)'
              : 'Show bottom panel (Ctrl+J)'
          }
          aria-label={props.bottomOpen ? 'Hide bottom panel' : 'Show bottom panel'}
        >
          {props.bottomOpen ? '▾ Panel' : '▸ Panel'}
        </button>
        <span className="status-msg" title={props.status}>
          {props.status}
        </span>
        {props.terminalRunning && (
          <span className="status-run" title="A terminal command is running">
            <span className="run-dot" aria-hidden="true" />
            Running
          </span>
        )}
        {props.diagnostics && (
          <button
            type="button"
            className="status-btn"
            onClick={props.onShowDiagnostics}
            title={
              props.diagnostics.success
                ? `${props.diagnostics.count} problem(s) from the last diagnostics run — click to open`
                : 'Last diagnostics run failed — click to open'
            }
          >
            {props.diagnostics.success
              ? `✓ ${props.diagnostics.count}`
              : `✕ ${props.diagnostics.count}`}
          </button>
        )}
      </span>

      <span className="status-right">
        {props.workspaceName && (
          <span className="status-seg" title="Open project">
            {props.workspaceName}
          </span>
        )}

        <button
          type="button"
          className="status-btn"
          onClick={props.onBranchRefresh}
          title={
            props.branchKnown
              ? `Git branch ${props.branch ?? 'detached HEAD'} — click to refresh`
              : 'No Git repository verified — click to recheck'
          }
        >
          {props.branchKnown ? `⎇ ${props.branch ?? 'detached'}` : '⎇ no repo'}
        </button>

        {props.fileName && (
          <span
            className="status-seg"
            title={props.language ? `Language: ${props.language}` : 'Open file'}
          >
            {props.fileName}
            {props.dirty ? ' •' : ''}
            {props.language ? ` · ${props.language}` : ''}
          </span>
        )}

        {props.line !== null && props.column !== null && (
          <span className="status-seg status-pos" title="Cursor position">
            Ln {props.line}, Col {props.column}
          </span>
        )}

        <span className="status-seg" title={`Default model: ${props.model}`}>
          {modelDisplayName(props.model)}
        </span>

        <button
          type="button"
          className="status-btn"
          onClick={props.onOpenProviderSettings}
          title={
            props.providerOk === null
              ? 'Provider status unknown — click for provider settings'
              : props.providerOk
                ? `${props.providerLabel ?? 'AI configured'} — click for provider settings`
                : 'Meta AI is not configured — click to configure'
          }
        >
          {props.providerOk === null
            ? 'AI …'
            : props.providerOk
              ? `AI ${props.providerLabel ?? 'ready'}`
              : 'AI not configured'}
        </button>

        <span
          className="status-seg"
          title={props.autoSave ? 'Auto Save is on' : 'Auto Save is off'}
        >
          {props.autoSave ? 'Auto-save' : 'Save: manual'}
        </span>
      </span>
    </footer>
  )
}
