// One editor group: unified tab strip plus the active tab's content
// (Monaco for code, the Meta AI workspace for AI sessions). App.tsx
// renders one panel per split group; only the focused group registers
// its editor API for menu commands.
import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { detectLanguage } from '../utils/languages'
import { MONACO_FONT_FAMILY, monacoTheme } from '../utils/theme'
import { baseName, resolveAgainstRoot, samePath } from '../utils/paths'
import {
  isCodeTab,
  isExtensionTab,
  isMetaTab,
  type WorkbenchTab,
} from '../state/workbench-tabs'
import type { MetaSession } from '../state/meta-sessions'
import { EditorTabs } from './EditorTabs'
import { ErrorBoundary } from './ErrorBoundary'
import {
  MetaAIWorkspace,
  type MetaInitialPrompt,
} from './MetaAIWorkspace'

export interface EditorApi {
  revealLine: (line: number) => void
  focus: () => void
  find: () => void
  replace: () => void
  expandSelection: () => void
  shrinkSelection: () => void
}

// Minimal structural types for the Monaco instance. The real editor is
// a supertype of these, so mounting stays type-safe without importing
// the whole Monaco API surface.
interface MonacoTextModel {
  getLineCount: () => number
  getValueInRange: (range: MonacoSelection) => string
}

interface MonacoSelection {
  isEmpty: () => boolean
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

interface MonacoMarkerData {
  severity: number
  message: string
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
  source?: string
}

interface MonacoEditorInstance {
  revealLineInCenter: (line: number) => void
  focus: () => void
  setPosition: (position: { lineNumber: number; column: number }) => void
  addCommand: (keybinding: number, handler: () => void) => void
  getModel: () => MonacoTextModel | null
  trigger: (source: string, handlerId: string, payload?: unknown) => void
  onDidChangeCursorPosition: (
    listener: (event: {
      position: { lineNumber: number; column: number }
    }) => void
  ) => { dispose: () => void }
  onDidChangeCursorSelection: (
    listener: (event: { selection: MonacoSelection }) => void
  ) => { dispose: () => void }
  getSelection: () => MonacoSelection | null
}

interface MonacoApi {
  KeyMod: { CtrlCmd: number; Shift: number }
  KeyCode: { KeyS: number; F8: number }
  MarkerSeverity: { Error: number; Warning: number }
  editor: {
    setModelMarkers: (
      model: MonacoTextModel,
      owner: string,
      markers: MonacoMarkerData[]
    ) => void
  }
}

export interface MetaTabContext {
  session: MetaSession
  // Same-root sessions for history attach; pre-filtered by the shell
  // so the workspace can never see another project's sessions.
  siblings: MetaSession[]
  activeFile: string | null
  fileName: string
  fileContent: string
  fileDirty: boolean
  contextEnabled: boolean
  workspaceRoot: string | null
  onStatus: (status: string) => void
  onUpdateSession: (session: MetaSession) => void
  onOpenFile: (path: string, line?: number) => void
  onOpenSession: (sessionId: string) => void
  onFilesChanged: (changedPaths: string[]) => void
  onOpenProviderSettings: () => void
  initialPrompt: MetaInitialPrompt | null
  onInitialPromptConsumed: () => void
}

export interface EditorPanelProps {
  groupId: string
  tabs: WorkbenchTab[]
  activeTab: WorkbenchTab | null
  sessions: Record<string, MetaSession>
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onCloseOthers: (keepId: string) => void
  onSplitRight: (id: string) => void
  onCloseGroup: () => void
  canCloseGroup: boolean
  onNewMetaAI: () => void
  onRenameSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  // Tab-strip copy-path result (Phase E). Absent = silent.
  onCopyPath?: (path: string, copied: boolean) => void
  content: string
  dirty: boolean
  pendingLine: number | null
  onChange: (value: string) => void
  onSave: () => void
  onRevealConsumed: () => void
  meta: MetaTabContext | null
  panelActive: boolean
  registerApi: (api: EditorApi | null) => void
  fontSize?: number
  theme?: 'dark' | 'light'
  onCursorChange?: (line: number, column: number) => void
  workspaceRoot?: string | null
  markers?: KryomDiagnostic[]
  saving?: boolean
  // Explains the current Monaco selection in home chat. Absent = no
  // Explain button.
  onExplainSelection?: (selection: {
    text: string
    file: string
    startLine: number
    endLine: number
  }) => void
}

function breadcrumbs(
  filePath: string,
  workspaceRoot: string | null
): string[] {
  let relative = filePath

  if (workspaceRoot) {
    const prefix = workspaceRoot.endsWith('/')
      || workspaceRoot.endsWith('\\')
      ? workspaceRoot
      : `${workspaceRoot}/`
    const normalized = filePath.replace(/\\/g, '/')

    if (normalized.startsWith(prefix.replace(/\\/g, '/'))) {
      relative = filePath.slice(prefix.length)
    } else if (
      workspaceRoot.includes('\\') &&
      filePath.startsWith(`${workspaceRoot}\\`)
    ) {
      relative = filePath.slice(workspaceRoot.length + 1)
    }
  }

  return relative.split(/[/\\]/).filter((segment) => segment.length > 0)
}

export function EditorPanel(props: EditorPanelProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null)
  const monacoRef = useRef<MonacoApi | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const apiRef = useRef<EditorApi | null>(null)
  const saveRef = useRef(props.onSave)
  saveRef.current = props.onSave
  const registerRef = useRef(props.registerApi)
  registerRef.current = props.registerApi
  const panelActiveRef = useRef(props.panelActive)
  panelActiveRef.current = props.panelActive
  // Live mirrors so marker application (triggered from mount and
  // effects) always sees the latest diagnostics and file identity.
  const markersRef = useRef(props.markers)
  markersRef.current = props.markers
  const activeTab = props.activeTab
  const codeTab = activeTab && isCodeTab(activeTab) ? activeTab : null
  const metaTab = activeTab && isMetaTab(activeTab) ? activeTab : null
  const extensionTab =
    activeTab && isExtensionTab(activeTab) ? activeTab : null
  const filePath = codeTab?.path ?? null
  const fileRef = useRef({
    path: filePath,
    root: props.workspaceRoot ?? null,
  })
  fileRef.current = {
    path: filePath,
    root: props.workspaceRoot ?? null,
  }

  // Editor API ownership follows the focused group and the active
  // code tab: the active group's Monaco registers for menu commands
  // (Find, Go to Line), and anything else unregisters. Inactive
  // groups never clear a registration they do not own.
  useEffect(() => {
    if (panelActiveRef.current && apiRef.current && fileRef.current.path) {
      registerRef.current(apiRef.current)
    } else if (panelActiveRef.current && !fileRef.current.path) {
      registerRef.current(null)
    }
  }, [props.panelActive, filePath])

  useEffect(() => {
    return () => {
      apiRef.current = null

      if (panelActiveRef.current) {
        registerRef.current(null)
      }
    }
  }, [])

  // Applies the diagnostics that belong to the open file as gutter
  // markers. Positions are clamped into the model; an empty set
  // clears stale markers. Monaco's built-in F8/Shift+F8 marker
  // navigation picks these up with no extra wiring.
  function applyMarkers() {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel() ?? null
    const currentPath = fileRef.current.path

    if (!editor || !monaco || !model || !currentPath) {
      return
    }

    const maxLine = Math.max(1, model.getLineCount())
    const data: MonacoMarkerData[] = (markersRef.current ?? [])
      .filter((diagnostic) =>
        samePath(
          resolveAgainstRoot(fileRef.current.root, diagnostic.file),
          currentPath
        )
      )
      .map((diagnostic) => {
        const line = Math.min(
          Math.max(1, diagnostic.line || 1),
          maxLine
        )
        const column = Math.max(1, diagnostic.column || 1)

        return {
          severity:
            diagnostic.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Error,
          message: diagnostic.code
            ? `${diagnostic.message} (${diagnostic.code})`
            : diagnostic.message,
          startLineNumber: line,
          startColumn: column,
          endLineNumber: line,
          endColumn: column + 1,
          source: diagnostic.source || 'kryom',
        }
      })

    monaco.editor.setModelMarkers(model, 'kryom', data)
  }

  // Deliberately runs after every render (not only when markers
  // change): Monaco mounts asynchronously without a re-render, so a
  // dep-scoped effect could miss the mount and leave the gutter
  // stale. setModelMarkers with an identical set is cheap.
  useEffect(() => {
    applyMarkers()
  })

  useEffect(() => {
    if (props.pendingLine === null || !filePath) {
      return
    }

    const line = props.pendingLine
    const timer = setTimeout(() => {
      const editor = editorRef.current
      const model = editor?.getModel() ?? null
      const maxLine = model?.getLineCount() ?? line
      const safeLine = Math.min(Math.max(1, line), Math.max(1, maxLine))

      editor?.revealLineInCenter(safeLine)
      editor?.setPosition({ lineNumber: safeLine, column: 1 })
      props.onRevealConsumed()
    }, 80)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingLine, filePath])

  const cursorRef = useRef(props.onCursorChange)
  cursorRef.current = props.onCursorChange

  const handleMount = (editor: MonacoEditorInstance, monaco: MonacoApi) => {
    editorRef.current = editor
    monacoRef.current = monaco
    applyMarkers()
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current()
    })
    // Explicit marker navigation so F8/Shift+F8 always cycle the
    // KryomCode diagnostics, regardless of Monaco defaults.
    editor.addCommand(monaco.KeyCode.F8, () => {
      editor.trigger('shortcuts', 'editor.action.marker.next')
    })
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F8, () => {
      editor.trigger('shortcuts', 'editor.action.marker.prev')
    })
    editor.onDidChangeCursorPosition((event) => {
      cursorRef.current?.(
        event.position.lineNumber,
        event.position.column
      )
    })
    // Tracks whether a non-empty selection exists so the Explain
    // button only appears when there is something to explain.
    editor.onDidChangeCursorSelection((event) => {
      setHasSelection(!event.selection.isEmpty())
    })
    apiRef.current = {
      revealLine: (line: number) => {
        const model = editor.getModel()
        const maxLine = model?.getLineCount() ?? line
        const safeLine = Math.min(Math.max(1, line), Math.max(1, maxLine))

        editor.revealLineInCenter(safeLine)
        editor.setPosition({ lineNumber: safeLine, column: 1 })
      },
      focus: () => editor.focus(),
      find: () => editor.trigger('menu', 'actions.find'),
      replace: () => editor.trigger('menu', 'editor.action.startFindReplaceAction'),
      expandSelection: () =>
        editor.trigger('menu', 'editor.action.smartSelect.expand'),
      shrinkSelection: () =>
        editor.trigger('menu', 'editor.action.smartSelect.shrink'),
    }

    if (panelActiveRef.current) {
      registerRef.current(apiRef.current)
    }
  }

  // Reads the live selection at click time (fresh even if the
  // listener state lagged) and hands it to home chat.
  function explainSelection() {
    const editor = editorRef.current
    const codePath = codeTab?.path ?? null

    if (!editor || !codePath || !props.onExplainSelection) {
      return
    }

    const selection = editor.getSelection()

    if (!selection || selection.isEmpty()) {
      return
    }

    const model = editor.getModel()
    const text = model ? model.getValueInRange(selection) : ''

    if (text.trim() === '') {
      return
    }

    props.onExplainSelection({
      text,
      file: codePath,
      startLine: selection.startLineNumber,
      endLine: selection.endLineNumber,
    })
  }

  const codePath = codeTab ? codeTab.path : null

  // A selection never carries across files; the button resets until
  // the new file reports its own selection.
  useEffect(() => {
    setHasSelection(false)
  }, [codePath])

  const crumbs =
    codeTab !== null
      ? breadcrumbs(codeTab.path, props.workspaceRoot ?? null)
      : []

  return (
    <ErrorBoundary compact title="This editor group crashed.">
    <section className="editor-panel" aria-label="Editor group">
      <EditorTabs
        tabs={props.tabs}
        activeId={activeTab?.id ?? null}
        sessions={props.sessions}
        onSelect={props.onSelectTab}
        onClose={props.onCloseTab}
        onCloseOthers={props.onCloseOthers}
        onSplitRight={props.onSplitRight}
        onNewMetaAI={props.onNewMetaAI}
        onRenameSession={props.onRenameSession}
        onDeleteSession={props.onDeleteSession}
        onCopyPath={props.onCopyPath}
      />

      {codeTab !== null && (
        <>
          <div className="tabbar">
            <nav className="breadcrumbs" aria-label="File path" title={codeTab.path}>
              {crumbs.map((segment, index) => (
                <span key={`${segment}-${index}`} className="crumb">
                  {index > 0 && <span className="crumb-sep" aria-hidden="true">›</span>}
                  <span
                    className={
                      index === crumbs.length - 1 ? 'crumb current' : 'crumb'
                    }
                  >
                    {segment}
                  </span>
                </span>
              ))}
              {props.dirty && (
                <span className="tab-dirty" aria-hidden="true">
                  •
                </span>
              )}
            </nav>
            <span className="spacer" />
            <span className="muted">{detectLanguage(baseName(codeTab.path))}</span>
            {props.onExplainSelection && hasSelection && (
              <button
                type="button"
                className="mini-btn"
                onClick={explainSelection}
                title="Explain the selected code with Kryom AI"
              >
                Explain
              </button>
            )}
            <button
              type="button"
              className="mini-btn"
              onClick={props.onSave}
              disabled={!props.dirty || props.saving === true}
              title="Save the active file (Ctrl+S)"
              aria-label={
                props.dirty ? 'Save the active file' : 'No unsaved changes'
              }
            >
              {props.saving === true ? 'Saving…' : 'Save'}
            </button>
            {props.canCloseGroup && (
              <button
                type="button"
                className="mini-btn"
                onClick={props.onCloseGroup}
                title="Close this editor group"
                aria-label="Close this editor group"
              >
                ×
              </button>
            )}
          </div>

          <Editor
            height="100%"
            path={codeTab.path}
            language={detectLanguage(baseName(codeTab.path))}
            theme={monacoTheme(props.theme ?? 'dark')}
            value={props.content}
            onChange={(value) => props.onChange(value ?? '')}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: props.fontSize ?? 14,
              fontFamily: MONACO_FONT_FAMILY,
              fontLigatures: true,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              readOnly: false,
              padding: { top: 12 },
              renderLineHighlight: 'all',
            }}
          />
        </>
      )}

      {activeTab !== null && codeTab === null && props.canCloseGroup && (
        <div className="tabbar group-bar">
          <span className="spacer" />
          <button
            type="button"
            className="mini-btn"
            onClick={props.onCloseGroup}
            title="Close this editor group"
            aria-label="Close this editor group"
          >
            Close group ×
          </button>
        </div>
      )}

      {metaTab !== null && props.meta !== null && (
        <MetaAIWorkspace
          key={metaTab.sessionId}
          session={props.meta.session}
          siblings={props.meta.siblings}
          workspaceRoot={props.meta.workspaceRoot}
          activeFile={props.meta.activeFile}
          fileName={props.meta.fileName}
          fileContent={props.meta.fileContent}
          fileDirty={props.meta.fileDirty}
          contextEnabled={props.meta.contextEnabled}
          onStatus={props.meta.onStatus}
          onUpdateSession={props.meta.onUpdateSession}
          onOpenFile={props.meta.onOpenFile}
          onOpenSession={props.meta.onOpenSession}
          onFilesChanged={props.meta.onFilesChanged}
          onOpenProviderSettings={props.meta.onOpenProviderSettings}
          initialPrompt={props.meta.initialPrompt}
          onInitialPromptConsumed={props.meta.onInitialPromptConsumed}
        />
      )}

      {metaTab !== null && props.meta === null && (
        <div className="welcome">
          <h1>Session unavailable.</h1>
          <p>This Meta AI session record is missing. Close the tab and open a new session.</p>
        </div>
      )}

      {extensionTab !== null && (
        <div className="welcome">
          <h1>Extension views are not available yet.</h1>
          <p>The extension view contract exists for future modules; nothing provides views today.</p>
        </div>
      )}

      {activeTab === null && (
        <div className="welcome">
          <h1>No open editors.</h1>
          <p>Open a file from the Explorer or start a Meta AI session.</p>
          <p>
            <button
              type="button"
              className="secondary-button"
              onClick={props.onNewMetaAI}
            >
              New Meta AI session
            </button>
          </p>
        </div>
      )}
    </section>
    </ErrorBoundary>
  )
}
