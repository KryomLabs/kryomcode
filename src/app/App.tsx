import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { kryom, errorMessage, isWriteConflict, isCancelError } from '../api/kryom'
import { baseName, joinName, parentDir, resolveAgainstRoot } from '../utils/paths'
import { detectLanguage } from '../utils/languages'
import { modelDisplayName } from '../utils/models'
import { logOutput } from '../utils/output-log'
import { applyTheme, initialTheme, type KryomTheme } from '../utils/theme'
import {
  activateTab,
  closeGroup,
  closeOtherTabs,
  closeTab,
  codeTabId,
  dirtyTabs,
  findCodeTabByPath,
  findTab,
  focusGroup,
  getActiveGroup,
  groupTabs,
  initialWorkbench,
  isCodeTab,
  isMetaTab,
  isTabDirty,
  metaTabId,
  openTab,
  repathCodeTabs,
  splitGroupRight,
  tabsUnderPath,
  updateCodeTab,
  type CodeTab,
  type EditorGroup,
  type WorkbenchTab,
  type WorkbenchState,
} from '../state/workbench-tabs'
import {
  createMetaSession,
  deleteMetaSession,
  deriveSessionTitle,
  loadMetaSessions,
  saveMetaSession,
  touchSession,
  type MetaSession,
} from '../state/meta-sessions'
import {
  getActivity,
  hasActivity,
  registerBuiltinActivities,
} from '../components/activity-registry'
import {
  saveTabSnapshot,
  loadTabSnapshot,
  clearTabSnapshot,
} from '../utils/session-restore'
import { DialogProvider, useDialogs } from '../components/dialogs'
import { TitleBar, StatusBar } from '../components/Chrome'
import { ActivityBar, type ActivityId } from '../components/ActivityBar'
import { ResizeHandle } from '../components/ResizeHandle'
import { Explorer, type GitBadge } from '../components/Explorer'
import { SearchPanel } from '../components/SearchPanel'
import { EditorPanel, type EditorApi, type MetaTabContext } from '../components/EditorPanel'
import { IntelligenceHub } from '../components/IntelligenceHub'
import { PlatformHub } from '../components/PlatformHub'
import { AgentWorkspace } from '../components/AgentWorkspace'
import { TasksPanel } from '../components/TasksPanel'
import { DebugConsolePanel } from '../components/DebugConsolePanel'
import {
  parseBottomTab,
  type BottomTab,
} from '../utils/bottom-tabs'
import { TemplatePickerDialog } from '../components/TemplatePickerDialog'
import type { MetaInitialPrompt } from '../components/MetaAIWorkspace'
import {
  TerminalPanelView,
  useTerminalController,
} from '../components/TerminalPanel'
import { ProblemsPanel } from '../components/ProblemsPanel'
import { GitPanel } from '../components/GitPanel'
import { SettingsModal, type SettingsSection } from '../components/SettingsModal'
import { WelcomePage, type DiscoveryMode } from '../components/WelcomePage'
import { ConnectionsPanel } from '../components/ConnectionsPanel'
import { MemoryPanel } from '../components/MemoryPanel'
import { ExtensionsPanel } from '../components/ExtensionsPanel'
import { OutputPanel } from '../components/OutputPanel'
import { AboutDialog } from '../components/AboutDialog'
import { QuickOpen } from '../components/QuickOpen'
import { CommandPalette, type PaletteCommand } from '../components/CommandPalette'
import { AsidePanel } from '../components/AsidePanel'
import { AiWorkspaceHub } from '../components/AiWorkspaceHub'
import { HistoryPanel, type HistoryFilter } from '../components/HistoryPanel'
import {
  buildThreadRefs,
  filterThreadsForRoot,
  loadThreadIndex,
  saveThreadIndex,
  THREAD_INDEX_VERSION,
  type ThreadMode,
  type ThreadRef,
} from '../state/thread-index'
import { RunDebugSidebar } from '../components/RunDebugSidebar'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { DiagnosticsDialog } from '../components/DiagnosticsDialog'
import { ErrorBoundary } from '../components/ErrorBoundary'

type CenterView = 'editor' | 'home' | 'intel' | 'platform' | 'agent'
type StageMode = 'intel' | 'platform' | 'agent'

// Unified workbench (Level 3C): code files and Meta AI sessions share
// one central tab system with split groups; Intel/Platform ride a
// small center stage; Terminal/Problems/Source Control/Output/Tasks
// live in the bottom panel. Bottom and stage regions hide with
// `hidden` instead of unmounting so runs and hubs survive navigation,
// while editor tabs persist their own state and remount freely.
const FALLBACK_SETTINGS: KryomSettings = {
  defaultModel: 'muse-spark-1.3',
  aiContextEnabled: true,
  confirmAllCommands: false,
  panelLeftWidth: 260,
  panelRightWidth: 360,
  panelBottomHeight: 264,
}

const PANEL_LIMITS = {
  left: { min: 180, max: 420, fallback: 260 },
  bottom: { min: 120, max: 600, fallback: 264 },
  aside: { min: 300, max: 520, fallback: 360 },
} as const

const FONT_LIMITS = { min: 10, max: 24, fallback: 14 } as const

// Maximized bottom panel keeps the ~420px editor floor: titlebar
// (40) + status bar (24) + editor floor (420) + resize/tab slack.
const MAXIMIZED_BOTTOM_CHROME = 492

// D2 terminal renderer settings (blueprint T1: font 11–16 live).
// localStorage-backed like the editor font size — no settings
// migration (see Phase A report §6.2).
const TERMINAL_FONT_LIMITS = { min: 11, max: 16, fallback: 13 } as const
type TerminalRenderer = 'xterm' | 'pre'

function clampLeftWidth(value: number): number {
  const max = Math.max(
    PANEL_LIMITS.left.min,
    Math.min(PANEL_LIMITS.left.max, window.innerWidth - 284)
  )

  return Math.min(max, Math.max(PANEL_LIMITS.left.min, Math.round(value)))
}

function clampBottomHeight(value: number): number {
  const max = Math.max(
    PANEL_LIMITS.bottom.min,
    Math.min(PANEL_LIMITS.bottom.max, window.innerHeight - 284)
  )

  return Math.min(max, Math.max(PANEL_LIMITS.bottom.min, Math.round(value)))
}

function clampAsideWidth(value: number): number {
  const max = Math.max(
    PANEL_LIMITS.aside.min,
    Math.min(PANEL_LIMITS.aside.max, window.innerWidth - 560)
  )

  return Math.min(max, Math.max(PANEL_LIMITS.aside.min, Math.round(value)))
}

function clampFontSize(value: number): number {
  return Math.min(
    FONT_LIMITS.max,
    Math.max(FONT_LIMITS.min, Math.round(value))
  )
}

function readLocalActivity(): ActivityId {
  registerBuiltinActivities()

  const raw = window.localStorage.getItem('kryom.activity')

  // Only sidebar-backed views persist here. Aside/panel/center/action
  // destinations open the dock, bottom panel, center view, or run a
  // command instead, so a stale stored value falls back to Explorer.
  // Retired ids (connections/profile/tools/memory/account/...) all
  // land on Explorer; nothing is lost (their views moved, see Phase
  // A report).
  if (
    raw &&
    hasActivity(raw) &&
    getActivity(raw)?.area === 'sidebar'
  ) {
    return raw
  }

  return 'explorer'
}

function readLocalAside(): ActivityId {
  registerBuiltinActivities()

  const raw = window.localStorage.getItem('kryom.asideActivity')

  if (
    raw &&
    hasActivity(raw) &&
    getActivity(raw)?.area === 'aside'
  ) {
    return raw
  }

  return 'ai-workspace'
}

function readLocalFontSize(): number {
  const raw = Number(window.localStorage.getItem('kryom.editorFontSize'))

  if (Number.isFinite(raw)) {
    return clampFontSize(raw)
  }

  return FONT_LIMITS.fallback
}

function clampTerminalFontSize(value: number): number {
  return Math.min(
    TERMINAL_FONT_LIMITS.max,
    Math.max(TERMINAL_FONT_LIMITS.min, Math.round(value))
  )
}

function readLocalTerminalFontSize(): number {
  const raw = Number(window.localStorage.getItem('kryom.terminalFontSize'))

  if (Number.isFinite(raw)) {
    return clampTerminalFontSize(raw)
  }

  return TERMINAL_FONT_LIMITS.fallback
}

function readLocalTerminalRenderer(): TerminalRenderer {
  const raw = window.localStorage.getItem('kryom.terminalRenderer')

  return raw === 'pre' || raw === 'xterm' ? raw : 'xterm'
}

function AppShell() {
  const dialogs = useDialogs()
  const [workspace, setWorkspace] = useState<KryomWorkspace | null>(null)
  const [explorerLoading, setExplorerLoading] = useState(false)
  const [workbench, setWorkbench] = useState<WorkbenchState>(() =>
    initialWorkbench()
  )
  const [sessions, setSessions] = useState<Record<string, MetaSession>>({})
  const [metaPrompts, setMetaPrompts] = useState<
    Record<string, MetaInitialPrompt>
  >({})
  const [pendingReveal, setPendingReveal] = useState<{
    path: string
    line: number
  } | null>(null)
  const [settings, setSettings] = useState<KryomSettings>(FALLBACK_SETTINGS)
  const [leftWidth, setLeftWidth] = useState(FALLBACK_SETTINGS.panelLeftWidth)
  const [bottomHeight, setBottomHeight] = useState(
    FALLBACK_SETTINGS.panelBottomHeight
  )
  const [asideActivity, setAsideActivity] = useState<ActivityId>(() =>
    readLocalAside()
  )
  const [asideOpen, setAsideOpen] = useState(
    () => window.localStorage.getItem('kryom.asideOpen') !== '0'
  )
  const [asideWidth, setAsideWidth] = useState<number>(
    PANEL_LIMITS.aside.fallback
  )
  const panelsRef = useRef<{
    left: number
    bottom: number
    aside: number
  }>({
    left: FALLBACK_SETTINGS.panelLeftWidth,
    bottom: FALLBACK_SETTINGS.panelBottomHeight,
    aside: PANEL_LIMITS.aside.fallback,
  })
  const [summary, setSummary] = useState<KryomWorkspaceSummary | null>(null)
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState('')
  const [activity, setActivity] = useState<ActivityId>(() =>
    readLocalActivity()
  )
  const [sidebarVisible, setSidebarVisible] = useState(
    () => window.localStorage.getItem('kryom.sidebarVisible') !== '0'
  )
  const [centerView, setCenterView] = useState<CenterView>('home')
  // Discovery (home) workspace mode: Chat or Research hosted directly
  // in the central workspace, switched from the title bar. Coding
  // requests never switch this — they open Meta AI Agent tabs.
  const [discoveryMode, setDiscoveryMode] =
    useState<DiscoveryMode>('chat')
  // History deep-open targets, consumed once per nonce by WelcomePage.
  const [chatSelect, setChatSelect] = useState<{
    id: string
    nonce: number
  } | null>(null)
  const [researchRestore, setResearchRestore] = useState<{
    sessionId: string
    nonce: number
  } | null>(null)
  const [homeNewRequest, setHomeNewRequest] = useState<{
    mode: DiscoveryMode
    nonce: number
  } | null>(null)
  // D1 unified thread refs (references only) + saved-index fallback.
  const [threadRefs, setThreadRefs] = useState<ThreadRef[]>(() => {
    try {
      return loadThreadIndex(window.localStorage).index.refs
    } catch {
      return []
    }
  })
  const [indexCorrupt, setIndexCorrupt] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const threadNonce = useRef(0)

  function nextThreadNonce(): number {
    threadNonce.current += 1
    return threadNonce.current
  }
  // Research brief attached to Discovery chat as cited context; the
  // chat keeps its own history, the brief only grounds answers.
  const [chatResearchId, setChatResearchId] = useState<string | null>(null)
  // External home-chat prompt (Explain selection / Explain error).
  // WelcomePage consumes it once per nonce, then clears it back.
  const [homePrompt, setHomePrompt] = useState<{
    text: string
    nonce: number
  } | null>(null)
  const homeNonce = useRef(0)
  const [fontSize, setFontSize] = useState(() => readLocalFontSize())
  const [theme, setTheme] = useState<KryomTheme>(() => initialTheme())
  const [cursor, setCursor] = useState<{ line: number; column: number }>({
    line: 1,
    column: 1,
  })
  const [gitBranch, setGitBranch] = useState<{
    known: boolean
    branch: string | null
  }>({ known: false, branch: null })
  const [gitBadges, setGitBadges] = useState<Record<string, GitBadge> | null>(
    null
  )
  const [autoSave, setAutoSave] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>('general')
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [providerStatus, setProviderStatus] = useState<{
    ok: boolean | null
    label: string | null
  }>({ ok: null, label: null })
  const [aboutOpen, setAboutOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [diagSummary, setDiagSummary] = useState<{
    count: number
    success: boolean
  } | null>(null)
  const [diagnostics, setDiagnostics] = useState<KryomDiagnostic[]>([])
  const [diagnosticsRun, setDiagnosticsRun] = useState<{
    nonce: number
  } | null>(null)
  const runNonce = useRef(0)
  // Live mirrors: workbenchRef keeps async flows (save-all) on fresh
  // state, saveInflight coalesces concurrent saves of the same tab
  // (e.g. a Monaco keybinding plus the matching native-menu
  // accelerator).
  const workbenchRef = useRef<WorkbenchState>(workbench)
  workbenchRef.current = workbench
  const sessionsRef = useRef<Record<string, MetaSession>>(sessions)
  sessionsRef.current = sessions
  const saveInflight = useRef(new Map<string, Promise<boolean>>())

  // Status and error reporters double as Output log writers so the
  // Output tab shows real milestones without touching every panel.
  const reportStatus = useCallback((message: string) => {
    setStatus(message)
    logOutput('app', message)
  }, [])

  const reportError = useCallback((e: unknown) => {
    const message = errorMessage(e)

    setError(message)
    logOutput('error', message)
  }, [])

  const terminal = useTerminalController(
    workspace?.root ?? null,
    reportStatus,
    settings.confirmAllCommands
  )
  // Active panel restores from localStorage (Phase D1); unknown or
  // retired ids fall back to the terminal via parseBottomTab.
  const [bottomTab, setBottomTab] = useState<BottomTab>(() =>
    parseBottomTab(window.localStorage.getItem('kryom.bottomTab'))
  )
  const [bottomOpen, setBottomOpen] = useState(
    () => window.localStorage.getItem('kryom.bottomOpen') !== '0'
  )
  // Maximized bottom panel (Phase D1): transient, never persisted —
  // unmaximizing returns to the settings-persisted height.
  const [bottomMaximized, setBottomMaximized] = useState(false)
  const maximizedBottomHeight = Math.max(
    PANEL_LIMITS.bottom.min,
    window.innerHeight - MAXIMIZED_BOTTOM_CHROME
  )
  // Terminal focus requests (Phase D1): bumped by Terminal: Focus
  // Terminal and by the Ctrl+` toggle when it opens the panel.
  const terminalFocusNonce = useRef(0)
  const [terminalFocus, setTerminalFocus] = useState<{
    nonce: number
  } | null>(null)
  const [terminalFontSize, setTerminalFontSize] = useState(() =>
    readLocalTerminalFontSize()
  )
  const [terminalRenderer, setTerminalRenderer] = useState<TerminalRenderer>(
    () => readLocalTerminalRenderer()
  )
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const metaNonce = useRef(0)
  const editorApi = useRef<EditorApi | null>(null)

  // Navigation history over opened files for Go Back/Forward.
  const historyRef = useRef<{ entries: string[]; index: number }>({
    entries: [],
    index: -1,
  })
  const navigatingRef = useRef(false)
  // Reactive mirror of the file-history position for the title-bar
  // Back/Forward enabled states. The ref stays the source of truth.
  const [navPosition, setNavPosition] = useState({ canBack: false, canForward: false })

  function syncNavPosition() {
    const history = historyRef.current

    setNavPosition({
      canBack: history.index > 0,
      canForward: history.index < history.entries.length - 1,
    })
  }

  const activeGroup = getActiveGroup(workbench)
  const activeTab: WorkbenchTab | null = activeGroup.activeId
    ? findTab(workbench.tabs, activeGroup.activeId)
    : null
  const activeCodeTab =
    activeTab && isCodeTab(activeTab) ? activeTab : null
  const activeMetaTab =
    activeTab && isMetaTab(activeTab) ? activeTab : null
  const dirty = activeTab !== null && isTabDirty(activeTab)
  const dirtyCount = dirtyTabs(workbench.tabs).length
  const activeLabel = activeTab
    ? isCodeTab(activeTab)
      ? baseName(activeTab.path)
      : isMetaTab(activeTab)
        ? `Meta AI — ${sessions[activeTab.sessionId]?.title ?? 'New Task'}`
        : activeTab.title
    : null
  const windowTitle = `${dirty ? '• ' : ''}${activeLabel ? `${activeLabel} — ` : ''}${workspace ? `${baseName(workspace.root)} — ` : ''}KryomCode`
  const showEditor = centerView === 'editor'
  const staged: StageMode | null =
    centerView === 'intel' || centerView === 'platform' || centerView === 'agent'
      ? centerView
      : null

  useEffect(() => {
    logOutput('app', 'KryomCode started')

    // Retired layout keys from earlier shells.
    window.localStorage.removeItem('kryom.panelLoc')
    window.localStorage.removeItem('kryom.rightOpen')

    kryom()
      .getSettings()
      .then((loaded) => {
        setSettings(loaded)

        const left = clampLeftWidth(loaded.panelLeftWidth)
        const bottom = clampBottomHeight(loaded.panelBottomHeight)

        panelsRef.current.left = left
        panelsRef.current.bottom = bottom
        setLeftWidth(left)
        setBottomHeight(bottom)
      })
      .catch(() => undefined)

    kryom()
      .getUIState()
      .then((state) => {
        setAutoSave(state.autoSave)
        setRecent(state.recent)
      })
      .catch(() => undefined)

    // Global (project-less) Meta AI sessions load at startup;
    // project sessions load when their project opens.
    const global = loadMetaSessions(null)
    const record: Record<string, MetaSession> = {}

    for (const entry of global) {
      record[entry.id] = entry
    }

    setSessions(record)

    return kryom().onUIState((state) => {
      setAutoSave(state.autoSave)
      setRecent(state.recent)
    })
  }, [])

  useEffect(() => {
    window.localStorage.setItem('kryom.activity', activity)
  }, [activity])

  useEffect(() => {
    window.localStorage.setItem('kryom.sidebarVisible', sidebarVisible ? '1' : '0')
  }, [sidebarVisible])

  useEffect(() => {
    window.localStorage.setItem('kryom.bottomOpen', bottomOpen ? '1' : '0')
  }, [bottomOpen])

  useEffect(() => {
    window.localStorage.setItem('kryom.bottomTab', bottomTab)
  }, [bottomTab])

  useEffect(() => {
    window.localStorage.setItem(
      'kryom.terminalFontSize',
      String(terminalFontSize)
    )
  }, [terminalFontSize])

  useEffect(() => {
    window.localStorage.setItem('kryom.terminalRenderer', terminalRenderer)
  }, [terminalRenderer])

  useEffect(() => {
    window.localStorage.setItem('kryom.asideActivity', asideActivity)
  }, [asideActivity])

  useEffect(() => {
    window.localStorage.setItem('kryom.asideOpen', asideOpen ? '1' : '0')
  }, [asideOpen])

  useEffect(() => {
    window.localStorage.setItem('kryom.asideWidth', String(asideWidth))
  }, [asideWidth])

  useEffect(() => {
    window.localStorage.setItem('kryom.editorFontSize', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Restore the aside width once (localStorage; no settings
  // migration in Phase A).
  useEffect(() => {
    const raw = Number(window.localStorage.getItem('kryom.asideWidth'))

    if (Number.isFinite(raw)) {
      const next = clampAsideWidth(raw)

      panelsRef.current.aside = next
      setAsideWidth(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the layout valid when the Electron window itself is resized.
  useEffect(() => {
    const onWindowResize = () => {
      const left = clampLeftWidth(panelsRef.current.left)
      const bottom = clampBottomHeight(panelsRef.current.bottom)
      const aside = clampAsideWidth(panelsRef.current.aside)

      panelsRef.current = { left, bottom, aside }
      setLeftWidth(left)
      setBottomHeight(bottom)
      setAsideWidth(aside)
    }

    window.addEventListener('resize', onWindowResize)

    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

  const persistPanels = useCallback(() => {
    const panels = panelsRef.current

    kryom()
      .updateSettings({
        panelLeftWidth: panels.left,
        panelBottomHeight: panels.bottom,
      })
      .catch(() => undefined)
  }, [])

  const resizeLeft = useCallback((value: number) => {
    const next = clampLeftWidth(value)

    panelsRef.current.left = next
    setLeftWidth(next)
  }, [])

  const resizeBottom = useCallback((value: number) => {
    const next = clampBottomHeight(value)

    panelsRef.current.bottom = next
    setBottomHeight(next)
  }, [])

  const resizeAside = useCallback((value: number) => {
    const next = clampAsideWidth(value)

    panelsRef.current.aside = next
    setAsideWidth(next)
  }, [])

  function resetPanels() {
    const left = PANEL_LIMITS.left.fallback
    const bottom = PANEL_LIMITS.bottom.fallback
    const aside = PANEL_LIMITS.aside.fallback

    panelsRef.current = { left, bottom, aside }
    setLeftWidth(left)
    setBottomHeight(bottom)
    setAsideWidth(aside)

    kryom()
      .updateSettings({ panelLeftWidth: left, panelBottomHeight: bottom })
      .then(() => reportStatus('Panel sizes reset to defaults'))
      .catch((e) => reportError(e))
  }

  useEffect(() => {
    if (!workspace) {
      setSummary(null)
      return
    }

    kryom()
      .getWorkspaceSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
  }, [workspace])

  const refreshGitBranch = useCallback(async () => {
    if (!workspace) {
      setGitBranch({ known: false, branch: null })
      setGitBadges(null)
      return
    }

    try {
      const state = await kryom().gitStatus()

      setGitBranch({ known: true, branch: state.branch })

      // Explorer badges resolve status paths (relative to the repo
      // top level) to absolute paths. Unstaged wins over staged for
      // files present in both; untracked only when otherwise clean.
      const badges: Record<string, GitBadge> = {}

      for (const relative of state.untracked) {
        badges[resolveAgainstRoot(state.toplevel, relative)] = 'untracked'
      }

      for (const relative of state.staged) {
        badges[resolveAgainstRoot(state.toplevel, relative)] = 'staged'
      }

      for (const relative of state.unstaged) {
        badges[resolveAgainstRoot(state.toplevel, relative)] = 'unstaged'
      }

      setGitBadges(badges)
    } catch {
      setGitBranch({ known: false, branch: null })
      setGitBadges(null)
    }
  }, [workspace])

  useEffect(() => {
    void refreshGitBranch()
  }, [refreshGitBranch])

  // Status-bar provider segment: real configured state plus the
  // actual routed model. Refreshed on startup, project switches, and
  // settings closes — never fabricated while loading.
  const refreshProviderStatus = useCallback(async () => {
    try {
      const [status, selection] = await Promise.all([
        kryom().getAIStatus(),
        kryom().getProviderSelection(),
      ])

      setProviderStatus({
        ok: status.modelKeyConfigured,
        label: status.modelKeyConfigured
          ? modelDisplayName(selection.route.modelId)
          : null,
      })
    } catch {
      setProviderStatus({ ok: null, label: null })
    }
  }, [])

  useEffect(() => {
    void refreshProviderStatus()
  }, [refreshProviderStatus, workspace, settingsOpen])

  // Push coarse capability state so the native menu can enable and
  // disable workspace/editor/terminal commands accurately. The dirty
  // count also drives the main-process close guard, and the title
  // keeps the OS window label in sync with project/file context.
  useEffect(() => {
    kryom()
      .pushUIContext({
        hasWorkspace: workspace !== null,
        hasEditor: activeCodeTab !== null,
        terminalRunning: terminal.running,
        dirtyCount,
        title: windowTitle,
      })
      .catch(() => undefined)
  }, [workspace, activeCodeTab, terminal.running, dirtyCount, windowTitle])

  // Reload guard (Ctrl+R and friends). Window close takes the richer
  // main-process Save/Discard/Cancel path instead; the main process
  // destroys approved windows so this never double-prompts there.
  // Covers editor buffers only. Snapshots restore tabs after reload,
  // but the prompt stays: recovery is a net, not a choice.
  useEffect(() => {
    if (dirtyCount === 0) {
      return
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }

    window.addEventListener('beforeunload', onBeforeUnload)

    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyCount])

  // Track opened files for Go Back/Forward. History-driven activations
  // set the navigating flag so the effect does not re-record them.
  const activeCodePath = activeCodeTab?.path ?? null

  useEffect(() => {
    if (!activeCodePath) {
      return
    }

    const history = historyRef.current

    if (navigatingRef.current) {
      navigatingRef.current = false
      return
    }

    if (history.entries[history.index] === activeCodePath) {
      return
    }

    const entries = [...history.entries.slice(0, history.index + 1), activeCodePath].slice(-100)

    historyRef.current = { entries, index: entries.length - 1 }
    syncNavPosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCodePath])

  // Session snapshots (Level 2B.2 + 3C): open code tabs plus
  // bounded dirty contents persist per project, debounced so typing
  // does not write on every keystroke; open Meta AI tab ids persist
  // alongside (sessions live in the session store). Restore runs once
  // per opened root into an empty workbench only.
  const restoredTabsForRef = useRef<string | null>(null)

  useEffect(() => {
    const root = workspace?.root ?? null

    if (!root) {
      return
    }

    const snapshotWorkbench = workbench

    const timer = setTimeout(() => {
      const codeTabs = snapshotWorkbench.tabs.filter(isCodeTab)
      const metaIds = snapshotWorkbench.tabs
        .filter(isMetaTab)
        .map((tab) => tab.id)
      const group = snapshotWorkbench.groups.find(
        (entry) => entry.id === snapshotWorkbench.activeGroupId
      )

      saveTabSnapshot(root, codeTabs, group?.activeId ?? null, metaIds)
    }, 500)

    return () => clearTimeout(timer)
  }, [workspace, workbench])

  useEffect(() => {
    const root = workspace?.root ?? null

    if (!root || restoredTabsForRef.current === root) {
      return
    }

    restoredTabsForRef.current = root
    void restoreTabsForRoot(root)
  }, [workspace])

  async function restoreTabsForRoot(root: string) {
    const snapshot = loadTabSnapshot(root)

    if (!snapshot || snapshot.tabs.length === 0) {
      // Meta-only snapshots still restore their tabs below.
      if (!snapshot || snapshot.metaTabIds.length === 0) {
        return
      }
    }

    if (workbenchRef.current.tabs.length > 0) {
      return
    }

    const restored: CodeTab[] = []

    for (const entry of snapshot.tabs) {
      try {
        const meta = await kryom().readFileMeta(entry.path)

        restored.push({
          kind: 'code',
          id: codeTabId(meta.path),
          path: meta.path,
          content: entry.dirtyContent ?? meta.content,
          savedContent: meta.content,
          mtimeMs: meta.mtimeMs,
        })
      } catch {
        // Vanished or unreadable files reopen as nothing, never faked.
      }
    }

    // Meta AI tabs reopen only for sessions that still exist; stale
    // ids are dropped, never faked.
    const knownSessions = loadMetaSessions(root)
    const knownIds = new Set(knownSessions.map((entry) => entry.id))
    const metaTabs: WorkbenchTab[] = snapshot.metaTabIds
      .filter((id) => knownIds.has(id.slice('meta-ai:'.length)))
      .map((id) => ({
        kind: 'meta-ai' as const,
        id,
        sessionId: id.slice('meta-ai:'.length),
      }))

    if (restored.length === 0 && metaTabs.length === 0) {
      return
    }

    const tabs: WorkbenchTab[] = [...restored, ...metaTabs]
    const activeId =
      snapshot.activeId && tabs.some((tab) => tab.id === snapshot.activeId)
        ? snapshot.activeId
        : tabs[0].id

    setWorkbench((current) => {
      if (current.tabs.length > 0) {
        return current
      }

      return {
        tabs,
        groups: [
          {
            id: 'group-1',
            tabIds: tabs.map((tab) => tab.id),
            activeId,
          },
        ],
        activeGroupId: 'group-1',
      }
    })
    setCenterView('editor')
    reportStatus(`Restored ${tabs.length} tab(s) from last session`)
  }

  const confirmDiscardTabs = useCallback(async (): Promise<boolean> => {
    const dirty = dirtyTabs(workbench.tabs)

    if (dirty.length === 0) {
      return true
    }

    const names = dirty
      .slice(0, 3)
      .map((tab) => baseName(tab.path))
      .join(', ')
    const extra = dirty.length > 3 ? ` and ${dirty.length - 3} more` : ''

    const confirmed = await dialogs.confirm({
      title: 'Discard unsaved changes?',
      message: `${names}${extra} ${dirty.length === 1 ? 'has' : 'have'} unsaved edits that will be lost.`,
      confirmLabel: 'Discard changes',
      danger: true,
    })

    // Explicit discard drops the recovery snapshot too, so reopening
    // the project does not resurrect discarded buffers.
    if (confirmed && workspace?.root) {
      clearTabSnapshot(workspace.root)
    }

    return confirmed
  }, [dialogs, workbench.tabs, workspace])

  async function refreshExplorer() {
    if (!workspace || explorerLoading) {
      return
    }

    setExplorerLoading(true)

    try {
      setWorkspace(await kryom().refreshWorkspace())
    } catch (e) {
      reportError(e)
    } finally {
      setExplorerLoading(false)
    }
  }

  function resetForWorkspace(next: KryomWorkspace | null) {
    setWorkspace(next)
    setWorkbench(initialWorkbench())
    setMetaPrompts({})
    setCenterView('home')
    setCursor({ line: 1, column: 1 })
    setDiagSummary(null)
    setDiagnostics([])
    historyRef.current = { entries: [], index: -1 }
    setNavPosition({ canBack: false, canForward: false })

    // Meta AI sessions are per-project: switching projects loads that
    // project's sessions, closing unloads them (records persist).
    const root = next?.root ?? null
    const loaded = loadMetaSessions(root)
    const record: Record<string, MetaSession> = {}

    for (const entry of loaded) {
      record[entry.id] = entry
    }

    setSessions(record)

    if (!next) {
      setSummary(null)
    }
  }

  async function openProject() {
    if (!(await confirmDiscardTabs())) {
      return
    }

    setError('')

    try {
      const result = await kryom().openWorkspace()

      if (result) {
        resetForWorkspace(result)
        setActivity('explorer')
        setSidebarVisible(true)
        reportStatus('Project opened')
      }
    } catch (e) {
      reportError(e)
    }
  }

  async function openSingleFile() {
    if (!(await confirmDiscardTabs())) {
      return
    }

    setError('')

    try {
      const result = await kryom().openFile()

      if (!result) {
        return
      }

      resetForWorkspace({ root: result.root, tree: result.tree })
      setActivity('explorer')
      setSidebarVisible(true)
      await openEditorFile(result.filePath)
      reportStatus('File opened')
    } catch (e) {
      reportError(e)
    }
  }

  async function openRecentPath(target: string) {
    if (!(await confirmDiscardTabs())) {
      return
    }

    setError('')

    try {
      const result = await kryom().openPath(target)

      resetForWorkspace(result)
      setActivity('explorer')
      setSidebarVisible(true)
      reportStatus('Project opened')
    } catch (e) {
      reportError(e)

      // A stale recent entry may have been pruned; re-read the list.
      kryom()
        .getUIState()
        .then((state) => setRecent(state.recent))
        .catch(() => undefined)
    }
  }

  async function clearRecent() {
    try {
      const state = await kryom().setUIState({ clearRecent: true })

      setRecent(state.recent)
      reportStatus('Recent projects cleared')
    } catch (e) {
      reportError(e)
    }
  }

  async function cloneRepository(url: string) {
    if (!(await confirmDiscardTabs())) {
      return
    }

    setError('')

    try {
      const result = await kryom().gitClone({ url })

      if (!result) {
        reportStatus('Clone cancelled')
        return
      }

      resetForWorkspace({ root: result.root, tree: result.tree })
      setActivity('explorer')
      setSidebarVisible(true)
      reportStatus('Repository cloned and opened')
    } catch (e) {
      if (isCancelError(e)) {
        reportStatus('Clone cancelled')
      } else {
        reportError(e)
      }
    }
  }

  // Creates base.ext, base-2.ext, ... until the backend accepts one.
  async function createUniqueFile(
    dir: string,
    base: string,
    ext: string,
    content: string
  ): Promise<string> {
    const safeBase =
      base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') ||
      'document'

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const name =
        attempt === 0
          ? `${safeBase}.${ext}`
          : `${safeBase}-${attempt + 1}.${ext}`

      try {
        const created = await kryom().createPath({
          path: joinName(dir, name),
          type: 'file',
          content,
        })

        return created.path
      } catch (e) {
        if (!/exists|EEXIST/i.test(errorMessage(e)) || attempt === 9) {
          throw e
        }
      }
    }

    throw new Error('Could not find a free file name.')
  }

  function reportScaffold(template: string): string {
    const date = new Date().toISOString().slice(0, 10)
    const technical = template === 'technical'

    return [
      `# Report — ${date}`,
      '',
      '## Objective',
      '',
      'What question does this report answer?',
      '',
      technical ? '## Design' : '## Findings',
      '',
      technical
        ? 'Architecture, components, and trade-offs.'
        : 'Key findings with evidence, one per bullet.',
      '',
      '- ',
      '',
      technical ? '## Verification' : '## Next steps',
      '',
      technical
        ? 'How was this tested? Commands and results.'
        : 'Follow-up actions and owners.',
      '',
      '## Sources',
      '',
      '1. ',
      '',
    ].join('\n')
  }

  async function createReport(template: string) {
    if (!workspace) {
      reportStatus('Open a project first')
      return
    }

    setError('')

    try {
      const created = await createUniqueFile(
        workspace.root,
        'report',
        'md',
        reportScaffold(template)
      )
      await refreshExplorer()
      await openEditorFile(created)
      reportStatus('Report created')
    } catch (e) {
      reportError(e)
    }
  }

  async function exportActiveFile(template: string) {
    if (!activeCodeTab) {
      reportStatus('Open a file first')
      return
    }

    setError('')

    try {
      const title = baseName(activeCodeTab.path).replace(/\.[^.]+$/, '') || 'document'
      const result = await kryom().exportTextDocx({
        title,
        markdown: activeCodeTab.content,
        template,
      })

      if (!result) {
        reportStatus('Export cancelled')
        return
      }

      await refreshExplorer()
      reportStatus(`Exported ${baseName(result.path)}`)
    } catch (e) {
      reportError(e)
    }
  }

  async function importSave(text: string, fileName: string) {
    if (!workspace) {
      reportStatus('Open a project first')
      return
    }

    setError('')

    try {
      const base = fileName.replace(/\.docx$/i, '') || 'imported'
      const created = await createUniqueFile(workspace.root, base, 'md', text)

      await refreshExplorer()
      await openEditorFile(created)
      reportStatus('Imported document saved and opened')
    } catch (e) {
      reportError(e)
    }
  }

  async function closeProject() {
    if (!workspace || !(await confirmDiscardTabs())) {
      return
    }

    try {
      await kryom().closeWorkspace()
      resetForWorkspace(null)
      reportStatus('Project closed')
    } catch (e) {
      reportError(e)
    }
  }

  async function openEditorFile(targetPath: string, line?: number) {
    const existing = findCodeTabByPath(workbench.tabs, targetPath)

    if (existing) {
      // openTab also reveals tabs that live in another group only.
      setWorkbench((previous) => openTab(previous, existing))
      setCenterView('editor')

      if (line !== undefined) {
        setPendingReveal({ path: existing.path, line })
      }

      return
    }

    setOpening(true)
    setError('')

    try {
      const meta = await kryom().readFileMeta(targetPath)
      const tab: CodeTab = {
        kind: 'code',
        id: codeTabId(meta.path),
        path: meta.path,
        content: meta.content,
        savedContent: meta.content,
        mtimeMs: meta.mtimeMs,
      }

      setWorkbench((previous) => openTab(previous, tab))
      setCenterView('editor')
      setCursor({ line: 1, column: 1 })

      if (line !== undefined) {
        setPendingReveal({ path: meta.path, line })
      }

      reportStatus('File opened')
    } catch (e) {
      reportError(e)
    } finally {
      setOpening(false)
    }
  }

  function selectTab(groupId: string, id: string) {
    setWorkbench((previous) => activateTab(previous, groupId, id))
    setCenterView('editor')
    setCursor({ line: 1, column: 1 })
  }

  // Ctrl+Tab / Ctrl+Shift+Tab cycle through the active group's tabs in
  // strip order. No native accelerator is registered for these, so
  // the window keydown listener below is the single handler.
  const cycleTab = useCallback((delta: 1 | -1) => {
    const state = workbenchRef.current
    const group = getActiveGroup(state)
    const list = groupTabs(state, group)

    if (list.length < 2) {
      return
    }

    const index = list.findIndex((tab) => tab.id === group.activeId)
    const base = index < 0 ? (delta > 0 ? -1 : 0) : index
    const next = list[(base + delta + list.length) % list.length]

    setWorkbench((previous) => activateTab(previous, group.id, next.id))
    setCenterView('editor')
    setCursor({ line: 1, column: 1 })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key !== 'Tab'
      ) {
        return
      }

      const state = workbenchRef.current

      if (groupTabs(state, getActiveGroup(state)).length < 2) {
        return
      }

      event.preventDefault()
      cycleTab(event.shiftKey ? -1 : 1)
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [cycleTab])

  function navigateHistory(delta: -1 | 1) {
    const history = historyRef.current
    const next = history.index + delta

    if (next < 0 || next >= history.entries.length) {
      reportStatus(
        delta < 0 ? 'No earlier file in history' : 'No later file in history'
      )
      return
    }

    navigatingRef.current = true
    historyRef.current = { entries: history.entries, index: next }
    syncNavPosition()

    const target = history.entries[next]
    const existing = findCodeTabByPath(workbench.tabs, target)

    if (existing) {
      // openTab also reveals tabs that live in another group only.
      setWorkbench((previous) => openTab(previous, existing))
      setCenterView('editor')
    } else {
      void openEditorFile(target)
    }
  }

  async function reloadEditor(targetPath: string) {
    try {
      const meta = await kryom().readFileMeta(targetPath)

      setWorkbench((previous) => ({
        ...previous,
        tabs: updateCodeTab(previous.tabs, codeTabId(targetPath), {
          path: meta.path,
          content: meta.content,
          savedContent: meta.content,
          mtimeMs: meta.mtimeMs,
        }),
      }))
      reportStatus('Reloaded from disk')
    } catch (e) {
      reportError(e)
    }
  }

  async function overwriteEditor(targetPath: string, content: string) {
    try {
      await kryom().saveFile(targetPath, content)
      const meta = await kryom().readFileMeta(targetPath)

      setWorkbench((previous) => ({
        ...previous,
        tabs: updateCodeTab(previous.tabs, codeTabId(targetPath), {
          path: meta.path,
          content: meta.content,
          savedContent: meta.content,
          mtimeMs: meta.mtimeMs,
        }),
      }))
      reportStatus('All changes saved')
    } catch (e) {
      reportError(e)
    }
  }

  // Saves one code tab by id. Returns true when the tab no longer
  // holds unsaved work (saved, reloaded after a conflict, or already
  // clean). Concurrent callers share one in-flight save per tab, so a
  // Monaco keybinding plus its native-menu accelerator can never
  // double-save.
  async function saveTab(tabId: string): Promise<boolean> {
    const inflight = saveInflight.current.get(tabId)

    if (inflight) {
      return inflight
    }

    const run = saveTabInner(tabId)

    saveInflight.current.set(tabId, run)

    try {
      return await run
    } finally {
      saveInflight.current.delete(tabId)
    }
  }

  async function saveTabInner(tabId: string): Promise<boolean> {
    const tab = findTab(workbenchRef.current.tabs, tabId)

    // No global `saving` check: per-tab saveInflight coalesces
    // re-entrant saves, while different tabs save independently
    // (conditional writes keep each file safe).
    if (!tab || !isCodeTab(tab)) {
      return false
    }

    if (!isTabDirty(tab)) {
      reportStatus('No changes to save')
      return true
    }

    const targetPath = tab.path
    const content = tab.content
    const expectedMtimeMs = tab.mtimeMs

    setSaving(true)
    setError('')

    try {
      const result = await kryom().saveFileConditional(
        targetPath,
        content,
        expectedMtimeMs
      )

      setWorkbench((previous) => ({
        ...previous,
        tabs: updateCodeTab(previous.tabs, tabId, {
          savedContent: content,
          mtimeMs: result.mtimeMs,
        }),
      }))
      reportStatus('All changes saved')

      return true
    } catch (e) {
      if (isWriteConflict(e)) {
        const choice = await dialogs.resolveConflict({
          fileName: baseName(targetPath),
        })

        if (choice === 'reload') {
          await reloadEditor(targetPath)

          return true
        }

        if (choice === 'overwrite') {
          await overwriteEditor(targetPath, content)

          return true
        }

        return false
      }

      reportError(e)

      return false
    } finally {
      setSaving(false)
    }
  }

  const saveTabRef = useRef(saveTab)
  saveTabRef.current = saveTab

  // Auto Save: persists the dirty active code tab shortly after
  // edits stop. Conflict dialogs still apply; nothing is silently
  // discarded.
  useEffect(() => {
    if (!autoSave || !activeCodeTab || !isTabDirty(activeCodeTab)) {
      return
    }

    const target = activeCodeTab.id
    const timer = window.setTimeout(() => {
      void saveTabRef.current(target)
    }, 1200)

    return () => window.clearTimeout(timer)
  }, [autoSave, activeCodeTab])

  async function saveEditor() {
    if (activeCodeTab) {
      await saveTab(activeCodeTab.id)
    }
  }

  // Sequential save-all for the main-process close guard. Conflict
  // dialogs surface per tab; a cancel or failure keeps that tab dirty
  // and the reported count aborts the close. The nonce echo lets the
  // main process settle promptly instead of waiting out its deadline.
  async function saveAllTabs(nonce: number) {
    const snapshot = dirtyTabs(workbenchRef.current.tabs)
    let failed = 0

    for (const tab of snapshot) {
      const settled = await saveTabRef.current(tab.id)

      if (!settled) {
        failed += 1
      }
    }

    // Let React flush the tab updates, then report the live count so
    // buffers dirtied mid-save still block the close. Fail-safe: any
    // doubt reports dirty and the close is retried, never forced.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const count = Math.max(dirtyTabs(workbenchRef.current.tabs).length, failed)

    kryom()
      .pushUIContext({
        hasWorkspace: workspace !== null,
        hasEditor: activeCodeTab !== null,
        terminalRunning: terminal.running,
        dirtyCount: count,
        title: windowTitle,
        saveAllNonce: nonce,
      })
      .catch(() => undefined)
  }

  async function saveAs() {
    if (!activeCodeTab) {
      return
    }

    setError('')

    try {
      const result = await kryom().saveAs(
        activeCodeTab.content,
        baseName(activeCodeTab.path)
      )

      if (!result) {
        reportStatus('Save As cancelled')
        return
      }

      if (result.path === activeCodeTab.path) {
        const id = activeCodeTab.id

        setWorkbench((previous) => ({
          ...previous,
          tabs: updateCodeTab(previous.tabs, id, {
            savedContent: result.content,
            mtimeMs: result.mtimeMs,
          }),
        }))
      } else {
        const next: CodeTab = {
          kind: 'code',
          id: codeTabId(result.path),
          path: result.path,
          content: result.content,
          savedContent: result.content,
          mtimeMs: result.mtimeMs,
        }
        const oldId = activeCodeTab.id

        setWorkbench((previous) =>
          openTab(closeTab(previous, oldId), next)
        )
      }

      await refreshExplorer()
      reportStatus('File saved')
    } catch (e) {
      reportError(e)
    }
  }

  async function toggleAutoSave() {
    try {
      const state = await kryom().setUIState({ autoSave: !autoSave })

      setAutoSave(state.autoSave)
      reportStatus(state.autoSave ? 'Auto Save on' : 'Auto Save off')
    } catch (e) {
      reportError(e)
    }
  }

  async function newFile() {
    if (!workspace) {
      reportStatus('Open a project first')
      return
    }

    const name = await dialogs.prompt({
      title: 'New file',
      label: 'Name',
      placeholder: 'example.ts',
      confirmLabel: 'Create',
    })

    if (!name) {
      return
    }

    try {
      const created = await kryom().createPath({
        path: joinName(workspace.root, name),
        type: 'file',
      })
      await refreshExplorer()
      reportStatus('File created')
      await openEditorFile(created.path)
    } catch (e) {
      reportError(e)
    }
  }

  function dropTabs(ids: string[]) {
    setWorkbench((previous) =>
      ids.reduce((state, id) => closeTab(state, id), previous)
    )
  }

  // Closing a code tab with unsaved work confirms first; closing a
  // Meta AI tab only closes the tab — the persistent session survives
  // and reopens from the session record.
  async function closeTabById(tabId: string) {
    const tab = findTab(workbenchRef.current.tabs, tabId)

    if (!tab) {
      return
    }

    if (isCodeTab(tab) && isTabDirty(tab)) {
      const choice = await dialogs.confirmCloseDirty({
        fileName: baseName(tab.path),
      })

      if (choice === 'cancel') {
        return
      }

      if (choice === 'save') {
        const saved = await saveTab(tab.id)

        if (!saved) {
          return
        }
      }
    }

    setWorkbench((previous) => {
      const next = closeTab(previous, tabId)

      if (next.tabs.length === 0) {
        setCenterView('home')
      }

      return next
    })

    reportStatus(isMetaTab(tab) ? 'Meta AI tab closed (session kept)' : 'Tab closed')
  }

  async function closeOtherTabsById(groupId: string, keepId: string) {
    const state = workbenchRef.current
    const group = state.groups.find((entry) => entry.id === groupId)

    if (!group) {
      return
    }

    const dirtyOthers = group.tabIds
      .map((id) => findTab(state.tabs, id))
      .filter(
        (tab): tab is CodeTab =>
          !!tab && tab.id !== keepId && isCodeTab(tab) && isTabDirty(tab)
      )

    if (dirtyOthers.length > 0) {
      const confirmed = await dialogs.confirm({
        title: 'Discard unsaved changes?',
        message:
          `${dirtyOthers.length} other tab${dirtyOthers.length === 1 ? ' has' : 's have'} ` +
          'unsaved edits that will be lost.',
        confirmLabel: 'Discard changes',
        danger: true,
      })

      if (!confirmed) {
        return
      }
    }

    setWorkbench((previous) => closeOtherTabs(previous, groupId, keepId))
    reportStatus('Other tabs closed')
  }

  function splitGroupFromTab(groupId: string, tabId: string) {
    setWorkbench((previous) =>
      splitGroupRight(activateTab(previous, groupId, tabId), groupId)
    )
    reportStatus('Editor split right')
  }

  function closeEditorGroup(groupId: string) {
    setWorkbench((previous) => closeGroup(previous, groupId))
    reportStatus('Editor group closed')
  }

  async function createEntry(dir: string, type: 'file' | 'directory') {
    const name = await dialogs.prompt({
      title: type === 'file' ? 'New file' : 'New folder',
      label: 'Name',
      placeholder: type === 'file' ? 'example.ts' : 'components',
      confirmLabel: 'Create',
    })

    if (!name) {
      return
    }

    try {
      const created = await kryom().createPath({
        path: joinName(dir, name),
        type,
      })
      await refreshExplorer()
      reportStatus(type === 'file' ? 'File created' : 'Folder created')

      if (type === 'file') {
        await openEditorFile(created.path)
      }
    } catch (e) {
      reportError(e)
    }
  }

  async function renameEntry(node: KryomNode) {
    const name = await dialogs.prompt({
      title: `Rename ${node.type}`,
      label: 'New name',
      initialValue: baseName(node.path),
      confirmLabel: 'Rename',
    })

    if (!name) {
      return
    }

    const oldPath = node.path
    const newPath = joinName(parentDir(oldPath), name)

    try {
      await kryom().renamePath({ oldPath, newPath })
      setWorkbench((previous) => repathCodeTabs(previous, oldPath, newPath))
      await refreshExplorer()
      reportStatus('Renamed')
    } catch (e) {
      reportError(e)
    }
  }

  async function deleteEntry(node: KryomNode) {
    const affectedIds = tabsUnderPath(workbench.tabs, node.path)
    const dirtyAffected = affectedIds
      .map((id) => findTab(workbench.tabs, id))
      .filter(
        (tab): tab is CodeTab => !!tab && isCodeTab(tab) && isTabDirty(tab)
      )
    const confirmed = await dialogs.confirm({
      title: `Delete ${node.type}?`,
      message:
        `"${baseName(node.path)}" will be permanently deleted.` +
        (dirtyAffected.length > 0
          ? ` ${dirtyAffected.length} open tab${dirtyAffected.length === 1 ? ' has' : 's have'} unsaved changes that will be lost.`
          : ''),
      confirmLabel: 'Delete',
      danger: true,
    })

    if (!confirmed) {
      return
    }

    try {
      await kryom().deletePath(node.path)

      if (affectedIds.length > 0) {
        dropTabs(affectedIds)
      }

      await refreshExplorer()
      reportStatus('Deleted')
    } catch (e) {
      reportError(e)
    }
  }

  async function handleAgentFilesChanged(changedPaths: string[]) {
    await refreshExplorer()

    let warned = false

    for (const changed of changedPaths) {
      const tab = findCodeTabByPath(workbenchRef.current.tabs, changed)

      if (!tab) {
        continue
      }

      if (isTabDirty(tab)) {
        warned = true
        continue
      }

      await reloadEditor(tab.path)
    }

    if (warned) {
      reportStatus(
        'Agent changed an open file with unsaved edits. Save to review the disk conflict.'
      )
    }
  }

  function showBottom(tab: BottomTab) {
    setBottomTab(tab)
    setBottomOpen(true)
  }

  function toggleBottom(tab: BottomTab) {
    if (bottomTab === tab && bottomOpen) {
      setBottomOpen(false)
      return
    }

    showBottom(tab)
  }

  function focusTerminalPanel() {
    showBottom('terminal')
    terminalFocusNonce.current += 1
    setTerminalFocus({ nonce: terminalFocusNonce.current })
  }

  // Aside (right dock) selection: re-selecting the visible view
  // collapses the dock, VS Code style.
  function selectAside(id: ActivityId) {
    if (id === asideActivity && asideOpen) {
      setAsideOpen(false)
      return
    }

    setAsideActivity(id)
    setAsideOpen(true)
  }

  function showAside(id: ActivityId) {
    setAsideActivity(id)
    setAsideOpen(true)
  }

  function selectActivity(id: ActivityId) {
    const def = getActivity(id)

    if (!def) {
      return
    }

    // Aside destinations toggle the right dock. Panel/center/action
    // areas remain valid for future extension destinations; no
    // builtin uses them in Phase A (stage views stay reachable via
    // the command palette and the AI Workspace hub).
    if (def.area === 'aside') {
      selectAside(id)
      return
    }

    if (def.area === 'panel') {
      toggleBottom('problems')
      return
    }

    if (def.area === 'center') {
      setCenterView('home')
      return
    }

    if (def.area === 'action') {
      return
    }

    // Re-selecting the visible view collapses the sidebar, VS Code style.
    if (id === activity && sidebarVisible) {
      setSidebarVisible(false)
      return
    }

    setActivity(id)
    setSidebarVisible(true)
  }

  function showSidebar(id: ActivityId) {
    const def = getActivity(id)

    if (!def) {
      return
    }

    if (def.area === 'aside') {
      showAside(id)
      return
    }

    if (def.area === 'panel') {
      showBottom('problems')
      return
    }

    if (def.area === 'center') {
      setCenterView('home')
      return
    }

    if (def.area === 'action') {
      return
    }

    setActivity(id)
    setSidebarVisible(true)
  }

  // Activity-bar active state: aside destinations reflect the dock,
  // sidebar views the sidebar.
  function isActivitySelected(id: ActivityId): boolean {
    const def = getActivity(id)

    if (def?.area === 'aside') {
      return asideOpen && asideActivity === id
    }

    return activity === id && sidebarVisible
  }

  function showHome() {
    setCenterView('home')
  }

  async function toggleConfirmAllCommands() {
    try {
      const saved = await kryom().updateSettings({
        confirmAllCommands: !settings.confirmAllCommands,
      })

      setSettings(saved)
      reportStatus(
        saved.confirmAllCommands
          ? 'Approval required for commands'
          : 'Routine-command approvals relaxed'
      )
    } catch (e: unknown) {
      reportStatus(`Could not update approval mode: ${errorMessage(e)}`)
    }
  }

  // D1 index: rebuild references from the live homes whenever the
  // project or Meta sessions change; the saved index stays as the
  // fallback when a listing fails. References only — no payloads.
  useEffect(() => {
    const stored = (() => {
      try {
        return loadThreadIndex(window.localStorage)
      } catch {
        return { index: { version: THREAD_INDEX_VERSION, refs: [] }, corrupt: true }
      }
    })()

    setIndexCorrupt(stored.corrupt)

    if (stored.index.refs.length > 0) {
      setThreadRefs((previous) =>
        previous.length === 0
          ? filterThreadsForRoot(stored.index.refs, workspace?.root ?? '')
          : previous
      )
    }

    let cancelled = false
    const root = workspace?.root ?? null

    async function rebuild() {
      try {
        const chats =
          root === null
            ? []
            : (await kryom().listChatSessions()).sessions
        const research =
          root === null ? [] : await kryom().listResearch()
        const runs =
          root === null ? [] : (await kryom().listOrchRuns()).runs

        if (cancelled) {
          return
        }

        const refs = filterThreadsForRoot(
          buildThreadRefs({
            root: root ?? '',
            chats,
            research,
            agentRuns: runs,
            metaSessions: Object.values(sessions).map((session) => ({
              id: session.id,
              title: session.title,
              root: session.root,
              updatedAt: session.updatedAt,
            })),
          }),
          root ?? ''
        )

        setThreadRefs(refs)
        saveThreadIndex(window.localStorage, {
          version: THREAD_INDEX_VERSION,
          refs,
        })
      } catch {
        // Listing failure: keep showing the saved refs; the next
        // project/session change retries. Never clears to empty here.
        if (!cancelled) {
          reportStatus('Thread history is temporarily unavailable')
        }
      }
    }

    void rebuild()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.root, sessions])

  // History deep-open routing. Stale refs fail loud with a status
  // message; nothing is deleted or repaired.
  async function openThread(thread: ThreadRef) {
    if (thread.mode === 'meta') {
      openMetaSession(thread.ref)
      return
    }

    if (thread.mode === 'agent') {
      stageCenter('agent')
      reportStatus(
        `Opened Agent Runs console for “${thread.title}” (per-run restore is not supported; see Phase B report)`
      )
      return
    }

    if (thread.mode === 'chat') {
      try {
        const list = await kryom().listChatSessions()
        const found = list.sessions.some((entry) => entry.id === thread.ref)

        if (!found) {
          reportStatus('Conversation is no longer available')
          return
        }
      } catch (e: unknown) {
        reportStatus(`Could not open conversation: ${errorMessage(e)}`)
        return
      }

      showHome()
      setDiscoveryMode('chat')
      setChatSelect({ id: thread.ref, nonce: nextThreadNonce() })
      return
    }

    try {
      const list = await kryom().listResearch()
      const found = list.some((entry) => entry.id === thread.ref)

      if (!found) {
        reportStatus('Research session is no longer available')
        return
      }
    } catch (e: unknown) {
      reportStatus(`Could not open research session: ${errorMessage(e)}`)
      return
    }

    showHome()
    setDiscoveryMode('research')
    setResearchRestore({ sessionId: thread.ref, nonce: nextThreadNonce() })
  }

  function newThread(mode: ThreadMode) {
    if (mode === 'meta') {
      newMetaAI()
      return
    }

    showHome()
    setDiscoveryMode(mode)
    setHomeNewRequest({ mode, nonce: nextThreadNonce() })
  }

  function stageCenter(mode: StageMode) {
    setCenterView(mode)
  }

  function unstageCenter() {
    setCenterView(workbench.tabs.length > 0 ? 'editor' : 'home')
  }

  // Meta AI sessions (Level 3C, Phases 3–5): every tab owns an
  // independent persistent session. Creating opens the tab; closing
  // the tab keeps the session; deleting removes the record.
  function newMetaAI(
    initialPrompt?: {
      text: string
      intent: 'chat' | 'plan' | 'research'
    },
    titleSeed?: string
  ) {
    const root = workspace?.root ?? null
    const session = createMetaSession(root, settings.defaultModel)

    if (titleSeed) {
      session.title = deriveSessionTitle(titleSeed)
    }

    saveMetaSession(session)
    setSessions((previous) => ({ ...previous, [session.id]: session }))

    const tabId = metaTabId(session.id)

    if (initialPrompt) {
      metaNonce.current += 1
      setMetaPrompts((previous) => ({
        ...previous,
        [tabId]: { ...initialPrompt, nonce: metaNonce.current },
      }))
    }

    setWorkbench((previous) =>
      openTab(previous, { kind: 'meta-ai', id: tabId, sessionId: session.id })
    )
    setCenterView('editor')
    reportStatus(
      initialPrompt ? 'Meta AI session started' : 'Meta AI session opened'
    )
  }

  // Opens an existing session's tab (history "Open" action):
  // re-activates the tab when already open, never duplicates it.
  function openMetaSession(sessionId: string) {
    const session = sessionsRef.current[sessionId]

    if (!session) {
      reportStatus('Session is no longer available')
      return
    }

    setWorkbench((previous) =>
      openTab(previous, {
        kind: 'meta-ai',
        id: metaTabId(sessionId),
        sessionId,
      })
    )
    setCenterView('editor')
    reportStatus(`Meta AI session opened (${session.title})`)
  }

  function consumeMetaPrompt(tabId: string) {
    setMetaPrompts((previous) => {
      if (!(tabId in previous)) {
        return previous
      }

      const next = { ...previous }

      delete next[tabId]

      return next
    })
  }

  function updateSession(session: MetaSession) {
    saveMetaSession(session)
    setSessions((previous) => ({ ...previous, [session.id]: session }))
  }

  async function renameSession(sessionId: string) {
    const session = sessionsRef.current[sessionId]

    if (!session) {
      return
    }

    const title = await dialogs.prompt({
      title: 'Rename session',
      label: 'Session title',
      initialValue: session.title,
      confirmLabel: 'Rename',
    })

    if (title) {
      updateSession(touchSession({ ...session, title: title.slice(0, 80) }))
    }
  }

  // Applies a session deletion without confirming: callers confirm
  // first (the workspace and the tab menu each ask).
  function applySessionDelete(sessionId: string) {
    const session = sessionsRef.current[sessionId]

    if (!session) {
      return
    }

    deleteMetaSession(session.root, sessionId)
    setSessions((previous) => {
      const next = { ...previous }

      delete next[sessionId]

      return next
    })
    setWorkbench((previous) => closeTab(previous, metaTabId(sessionId)))
    reportStatus('Meta AI session deleted')
  }

  async function deleteSession(sessionId: string) {
    const session = sessionsRef.current[sessionId]

    if (!session) {
      return
    }

    const confirmed = await dialogs.confirm({
      title: 'Delete session?',
      message:
        'The conversation and session record are removed. Linked plans, research, and files on disk are kept.',
      confirmLabel: 'Delete session',
      danger: true,
    })

    if (!confirmed) {
      return
    }

    applySessionDelete(sessionId)
  }

  // Discovery routing: explicit user actions only. Ordinary chat
  // and research stay in the central workspace; these handlers open
  // Meta AI Agent tabs for coding work.
  function handleDiscoveryOpenInAgent(text: string) {
    // The tab title seeds immediately from the request.
    newMetaAI({ text, intent: 'plan' }, text)
  }

  function handleDiscoveryResearchImplement(research: KryomResearchSession) {
    newMetaAI(
      {
        text:
          `Implement from research brief (session ${research.id}).\n` +
          `Objective: ${research.objective}\n` +
          "Follow the brief's ordered implementation tasks and acceptance criteria. " +
          "Cite the brief's sources when reporting which requirements are satisfied.",
        intent: 'plan',
      },
      `Implement: ${research.objective}`
    )
  }

  function handleDiscoveryResearchAsk(research: KryomResearchSession) {
    setChatResearchId(research.id)
    setDiscoveryMode('chat')
    reportStatus(`Research ${research.id} attached to Discovery chat`)
  }

  // Navigates to home chat with an external prompt. The prompt is
  // bounded (a huge selection reports its truncation honestly) and
  // behaves exactly like a typed submit once it lands.
  function goHomeWithPrompt(text: string) {
    homeNonce.current += 1
    setHomePrompt({ text, nonce: homeNonce.current })
    setDiscoveryMode('chat')
    unstageCenter()
    setCenterView('home')
  }

  function handleExplainSelection(selection: {
    text: string
    file: string
    startLine: number
    endLine: number
  }) {
    const MAX_SELECTION_CHARS = 8000
    const trimmed =
      selection.text.length > MAX_SELECTION_CHARS
        ? `${selection.text.slice(0, MAX_SELECTION_CHARS)}\n…(truncated, ${selection.text.length} chars total)`
        : selection.text
    const name = baseName(selection.file)
    const range =
      selection.startLine === selection.endLine
        ? `line ${selection.startLine}`
        : `lines ${selection.startLine}–${selection.endLine}`

    goHomeWithPrompt(
      `Explain this code from ${name} (${range}):\n\n\`\`\`\n${trimmed}\n\`\`\`\n\nExplain what it does, and note any risks or bugs.`
    )
    reportStatus(`Explaining selection from ${name}`)
  }

  function handleExplainDiagnostic(report: {
    diagnostic: KryomDiagnostic
    command: string
  }) {
    const diagnostic = report.diagnostic
    const MAX_MESSAGE_CHARS = 2000
    const message =
      diagnostic.message.length > MAX_MESSAGE_CHARS
        ? `${diagnostic.message.slice(0, MAX_MESSAGE_CHARS)}…(truncated)`
        : diagnostic.message
    const where = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
    const code = diagnostic.code ? ` ${diagnostic.code}` : ''
    const via = report.command ? ` (from \`${report.command}\`)` : ''

    goHomeWithPrompt(
      `Explain this error and suggest a fix${via}:\n\n${where} [${diagnostic.severity}]${code}\n${message}`
    )
    reportStatus(`Explaining ${diagnostic.file}:${diagnostic.line}`)
  }

  function openProviderSettings() {
    setSettingsSection('providers')
    setSettingsOpen(true)
  }

  function openGeneralSettings() {
    setSettingsSection('general')
    setSettingsOpen(true)
  }

  function toggleTheme() {
    setTheme((previous) => (previous === 'dark' ? 'light' : 'dark'))
    reportStatus('Theme toggled')
  }

  function runDiagnosticsNow() {
    if (!workspace) {
      reportStatus('Open a project first')
      return
    }

    showBottom('problems')
    runNonce.current += 1
    setDiagnosticsRun({ nonce: runNonce.current })
    reportStatus('Diagnostics running…')
  }

  async function goToLine() {
    if (!activeCodeTab) {
      reportStatus('Open a file first')
      return
    }

    const answer = await dialogs.prompt({
      title: 'Go to Line',
      label: 'Line number',
      placeholder: '1',
      confirmLabel: 'Go',
    })

    if (!answer) {
      return
    }

    const line = Number.parseInt(answer, 10)

    if (!Number.isFinite(line) || line < 1) {
      reportStatus('Invalid line number')
      return
    }

    setCenterView('editor')
    setPendingReveal({ path: activeCodeTab.path, line })
  }

  function openQuickOpen() {
    if (!workspace) {
      reportStatus('Open a project first')
      return
    }

    setQuickOpen(true)
  }

  function changeFontSize(delta: number) {
    setFontSize((previous) => {
      const next = clampFontSize(previous + delta)

      if (next !== previous) {
        reportStatus(`Editor font size ${next}px`)
      }

      return next
    })
  }

  // Native-menu command dispatcher. Every command reuses the same
  // handlers as the in-app controls, including confirmations.
  const handleCommand = useCallback(
    (command: KryomCommand) => {
      logOutput('menu', `Command: ${command.id}`)

      switch (command.id) {
        case 'file.newFile':
          void newFile()
          break
        case 'file.openFile':
          void openSingleFile()
          break
        case 'file.openFolder':
          void openProject()
          break
        case 'file.openPath':
          if (command.payload?.path) {
            void openRecentPath(command.payload.path)
          }
          break
        case 'file.save':
          void saveEditor()
          break
        case 'file.saveAs':
          void saveAs()
          break
        case 'file.saveAll':
          void saveAllTabs(command.payload?.nonce ?? 0)
          break
        case 'session.discardSnapshots':
          if (workspace?.root) {
            clearTabSnapshot(workspace.root)
          }

          break
        case 'file.toggleAutoSave':
          void toggleAutoSave()
          break
        case 'file.closeEditor': {
          const group = getActiveGroup(workbenchRef.current)

          if (group.activeId) {
            void closeTabById(group.activeId)
          }
          break
        }
        case 'file.closeFolder':
          void closeProject()
          break
        case 'edit.find':
          if (editorApi.current && activeCodeTab) {
            setCenterView('editor')
            editorApi.current.find()
          } else {
            reportStatus('Open a file to use Find')
          }
          break
        case 'edit.replace':
          if (editorApi.current && activeCodeTab) {
            setCenterView('editor')
            editorApi.current.replace()
          } else {
            reportStatus('Open a file to use Replace')
          }
          break
        case 'select.expand':
          if (editorApi.current && activeCodeTab) {
            editorApi.current.expandSelection()
          } else {
            reportStatus('Open a file to change the selection')
          }
          break
        case 'select.shrink':
          if (editorApi.current && activeCodeTab) {
            editorApi.current.shrinkSelection()
          } else {
            reportStatus('Open a file to change the selection')
          }
          break
        case 'view.explorer':
          showSidebar('explorer')
          break
        case 'view.search':
          showSidebar('search')
          break
        case 'view.git':
          showSidebar('git')
          break
        case 'view.run':
          showSidebar('run')
          break
        case 'view.home':
          showHome()
          break
        case 'view.metaAI':
          newMetaAI()
          break
        case 'view.extensions':
          showSidebar('extensions')
          break
        case 'view.knowledge':
          showAside('knowledge')
          break
        case 'view.history':
          showAside('history')
          break
        case 'view.aiWorkspace':
          showAside('ai-workspace')
          break
        case 'view.agent':
          stageCenter('agent')
          break
        case 'view.palette':
          setPaletteOpen(true)
          break
        case 'view.settings':
          openGeneralSettings()
          break
        case 'view.toggleAside':
          setAsideOpen((open) => !open)
          break
        case 'view.toggleTheme':
          toggleTheme()
          break
        case 'view.chat':
        case 'view.agent':
        case 'view.research':
          // Legacy accelerators predate the unified workspace; all of
          // them open a Meta AI session tab now.
          newMetaAI()
          break
        case 'view.intel':
          stageCenter('intel')
          break
        case 'view.platform':
          stageCenter('platform')
          break
        case 'view.splitRight': {
          const group = getActiveGroup(workbenchRef.current)

          if (group.activeId) {
            splitGroupFromTab(group.id, group.activeId)
          } else {
            reportStatus('Open a tab to split')
          }
          break
        }
        case 'view.focusEditor':
          if (activeCodeTab || activeMetaTab) {
            setCenterView('editor')
            editorApi.current?.focus()
          } else {
            showHome()
          }
          break
        case 'view.terminal':
          // Opening the terminal also focuses its input, VS Code
          // style; closing never steals focus anywhere.
          if (bottomTab === 'terminal' && bottomOpen) {
            toggleBottom('terminal')
          } else {
            focusTerminalPanel()
          }
          break
        case 'view.problems':
          toggleBottom('problems')
          break
        case 'view.output':
          showBottom('output')
          break
        case 'view.debugConsole':
          showBottom('debug')
          break
        case 'view.toggleSidebar':
          setSidebarVisible((visible) => !visible)
          break
        case 'view.toggleRight':
          setBottomOpen((open) => !open)
          break
        case 'editor.fontLarger':
          changeFontSize(1)
          break
        case 'editor.fontSmaller':
          changeFontSize(-1)
          break
        case 'go.file':
          openQuickOpen()
          break
        case 'go.line':
          void goToLine()
          break
        case 'go.back':
          navigateHistory(-1)
          break
        case 'go.forward':
          navigateHistory(1)
          break
        case 'run.diagnostics':
          runDiagnosticsNow()
          break
        case 'terminal.cancel':
          terminal.cancel()
          break
        case 'terminal.clear':
          terminal.clear()
          showBottom('terminal')
          reportStatus('Terminal cleared')
          break
        case 'terminal.focus':
          focusTerminalPanel()
          break
        case 'help.shortcuts':
          setShortcutsOpen(true)
          break
        case 'help.diagnostics':
          setDiagnosticsOpen(true)
          break
        default:
          reportStatus(`Unknown command: ${command.id}`)
          break
      }
    },
    // The dispatcher closes over the latest shell state via this
    // callback identity; the subscription below always calls through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      workbench,
      activeCodeTab,
      activeMetaTab,
      workspace,
      bottomTab,
      bottomOpen,
      autoSave,
      saving,
      settings,
      dialogs,
      terminal,
    ]
  )

  const commandRef = useRef(handleCommand)
  commandRef.current = handleCommand

  useEffect(() => {
    return kryom().onCommand((command) => commandRef.current(command))
  }, [])

  // Command palette entries (Phase A). Every entry dispatches through
  // the live command ref — the same path as the native menu — so each
  // id maps to a real registered handler with current shell state.
  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const via = (id: string, label: string, hint?: string): PaletteCommand => ({
      id: `menu:${id}`,
      label,
      hint,
      run: () => commandRef.current({ id } as KryomCommand),
    })

    const entries: PaletteCommand[] = [
      via('file.newFile', 'File: New Text File', 'Ctrl+N'),
      via('file.openFile', 'File: Open File…', 'Ctrl+O'),
      via('file.openFolder', 'File: Open Folder…', 'Ctrl+Shift+O'),
      via('file.save', 'File: Save', 'Ctrl+S'),
      via('file.saveAs', 'File: Save As…', 'Ctrl+Shift+S'),
      via('file.closeEditor', 'File: Close Editor', 'Ctrl+W'),
      via('file.closeFolder', 'File: Close Folder'),
      via('view.explorer', 'View: Explorer', 'Ctrl+Shift+E'),
      via('view.search', 'View: Search', 'Ctrl+Shift+F'),
      via('view.git', 'View: Source Control', 'Ctrl+Shift+G'),
      via('view.run', 'View: Run and Debug', 'Ctrl+Shift+D'),
      via('view.extensions', 'View: Extensions', 'Ctrl+Shift+X'),
      via('view.aiWorkspace', 'View: AI Workspace', 'Ctrl+Shift+A'),
      via('view.knowledge', 'View: Knowledge', 'Ctrl+Shift+K'),
      via('view.history', 'View: History', 'Ctrl+Shift+H'),
      via('view.home', 'View: Welcome Home'),
      via('view.metaAI', 'AI: New AI Thread', 'Ctrl+Shift+M'),
      via('view.intel', 'View: Intelligence'),
      via('view.platform', 'View: Platform'),
      via('view.agent', 'View: Agent Runs'),
      via('view.focusEditor', 'View: Focus Editor', 'Ctrl+1'),
      via('view.splitRight', 'View: Split Editor Right', 'Ctrl+\\'),
      via('view.toggleSidebar', 'View: Toggle Sidebar', 'Ctrl+B'),
      via('view.toggleRight', 'View: Toggle Bottom Panel', 'Ctrl+J'),
      via('view.problems', 'View: Problems', 'Ctrl+Shift+J'),
      via('view.output', 'View: Output'),
      via('view.debugConsole', 'View: Debug Console'),
      via('view.toggleAside', 'View: Toggle Auxiliary Panel'),
      via('view.toggleTheme', 'View: Toggle Theme'),
      via('go.file', 'Go to File…', 'Ctrl+P'),
      via('go.line', 'Go to Line…', 'Ctrl+G'),
      via('go.back', 'Go Back', 'Alt+Left'),
      via('go.forward', 'Go Forward', 'Alt+Right'),
      via('run.diagnostics', 'Run Diagnostics', 'F5'),
      via('terminal.focus', 'Terminal: Focus Terminal'),
      via('terminal.clear', 'Terminal: Clear Terminal'),
      via('terminal.cancel', 'Terminal: Cancel Running Command'),
      via('view.settings', 'Preferences: Open Settings', 'Ctrl+,'),
      via('help.shortcuts', 'Help: Keyboard Shortcuts'),
      via('help.diagnostics', 'Help: Export Diagnostics'),
    ]

    for (const root of recent) {
      entries.push({
        id: `recent:${root}`,
        label: `Open Recent: ${baseName(root)}`,
        hint: root,
        run: () =>
          commandRef.current({ id: 'file.openPath', payload: { path: root } } as KryomCommand),
      })
    }

    return entries
  }, [recent])

  const projectInfo = summary
    ? `${summary.projectType}${
        summary.frameworks.length > 0
          ? ` · ${summary.frameworks.join(', ')}`
          : ''
      }`
    : null

  const scripts = summary ? Object.keys(summary.scripts) : []

  // Sidebar views with their own headers map to ''; center/panel
  // destinations never render here.
  const sidebarTitle: Record<string, string> = {
    explorer: 'EXPLORER',
    search: 'SEARCH',
    git: 'SOURCE CONTROL',
    run: 'RUN AND DEBUG',
    extensions: '',
  }

  const STAGE_TABS: Array<{ id: StageMode; label: string }> = [
    { id: 'intel', label: 'INTEL' },
    { id: 'platform', label: 'PLATFORM' },
    { id: 'agent', label: 'AGENT' },
  ]

  // Problems badge counts (Phase D1): the backend reports error and
  // warning severities only — there is no informational level.
  const problemErrors = diagnostics.filter(
    (entry) => entry.severity === 'error'
  ).length
  const problemWarnings = diagnostics.filter(
    (entry) => entry.severity === 'warning'
  ).length
  const problemTotal = diagnostics.length

  const BOTTOM_TABS: Array<{ id: BottomTab; label: string }> = [
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'problems', label: 'PROBLEMS' },
    { id: 'output', label: 'OUTPUT' },
    { id: 'debug', label: 'DEBUG CONSOLE' },
    { id: 'tasks', label: 'TASKS' },
  ]

  // Same-root session buckets for history attach. Memoized so the
  // Agent workspace's history resolution does not refire on every
  // shell render.
  const siblingsByRoot = useMemo(() => {
    const buckets = new Map<string | null, MetaSession[]>()

    for (const entry of Object.values(sessions)) {
      const bucket = buckets.get(entry.root) ?? []

      bucket.push(entry)
      buckets.set(entry.root, bucket)
    }

    return buckets
  }, [sessions])

  // Meta AI file context prefers a code tab in the same group, then
  // any open code tab, so the session indicator names a real file.
  function metaContextFor(
    group: EditorGroup,
    sessionId: string
  ): MetaTabContext | null {
    const session = sessions[sessionId]

    if (!session) {
      return null
    }

    const groupTabsList = groupTabs(workbench, group)
    const sameGroup =
      groupTabsList.find(
        (tab): tab is CodeTab => isCodeTab(tab)
      ) ?? null
    const anywhere =
      sameGroup ??
      workbench.tabs.find((tab): tab is CodeTab => isCodeTab(tab)) ??
      null

    return {
      session,
      // History isolation boundary: only sessions bound to this
      // session's root reach the workspace. The bucket always holds
      // this session itself, so the lookup never misses.
      siblings: siblingsByRoot.get(session.root) ?? [],
      activeFile: anywhere?.path ?? null,
      fileName: anywhere ? baseName(anywhere.path) : '',
      fileContent: anywhere?.content ?? '',
      fileDirty: anywhere ? isTabDirty(anywhere) : false,
      contextEnabled: settings.aiContextEnabled,
      workspaceRoot: workspace?.root ?? null,
      onStatus: reportStatus,
      onUpdateSession: updateSession,
      onOpenFile: (path: string, line?: number) => void openEditorFile(path, line),
      onOpenSession: openMetaSession,
      onFilesChanged: (paths: string[]) => void handleAgentFilesChanged(paths),
      onOpenProviderSettings: openProviderSettings,
      initialPrompt: metaPrompts[metaTabId(sessionId)] ?? null,
      onInitialPromptConsumed: () => consumeMetaPrompt(metaTabId(sessionId)),
    }
  }

  return (
    <main className="ide">
      <TitleBar
        workspaceRoot={workspace?.root ?? null}
        activeLabel={showEditor ? activeLabel : null}
        dirty={dirty}
        sidebarVisible={sidebarVisible}
        bottomOpen={bottomOpen}
        asideOpen={asideOpen}
        onToggleSidebar={() => setSidebarVisible((visible) => !visible)}
        onToggleBottom={() => setBottomOpen((open) => !open)}
        onToggleAside={() => setAsideOpen((open) => !open)}
        onOpenPalette={() => setPaletteOpen(true)}
        canGoBack={navPosition.canBack}
        canGoForward={navPosition.canForward}
        onGoBack={() => navigateHistory(-1)}
        onGoForward={() => navigateHistory(1)}
      />

      <div className="shell">
        <ActivityBar
          active={activity}
          sidebarVisible={sidebarVisible}
          onSelect={selectActivity}
          onOpenSettings={openGeneralSettings}
          isSelected={isActivitySelected}
        />

        {/* Always mounted (hidden when collapsed) so sidebar views
            keep their state while collapsed. */}
        <ErrorBoundary compact title="The sidebar crashed.">
        <aside hidden={!sidebarVisible} className="sidebar" style={{ width: leftWidth }}>
          {sidebarTitle[activity] && (
            <div className="side-header">
              <span className="side-title">{sidebarTitle[activity]}</span>
            </div>
          )}

              <div hidden={activity !== 'explorer'} className="tab-body">
                <Explorer
                  workspace={workspace}
                  activeFile={activeCodePath}
                  loading={explorerLoading}
                  projectInfo={projectInfo}
                  gitBadges={gitBadges}
                  onOpenFile={(node) => void openEditorFile(node.path)}
                  onOpenProject={() => void openProject()}
                  onCreateProject={() => setTemplatePickerOpen(true)}
                  onRefresh={() => void refreshExplorer()}
                  onNewFile={(dir) => void createEntry(dir, 'file')}
                  onNewFolder={(dir) => void createEntry(dir, 'directory')}
                  onRename={(node) => void renameEntry(node)}
                  onDelete={(node) => void deleteEntry(node)}
                  onCopyPath={(_path, copied) =>
                    setStatus(
                      copied
                        ? 'Path copied to clipboard'
                        : 'Copy is unavailable in this context.'
                    )
                  }
                />
              </div>

              <div hidden={activity !== 'search'} className="tab-body">
                <SearchPanel
                  workspaceRoot={workspace?.root ?? null}
                  onOpenMatch={(path, line) => void openEditorFile(path, line)}
                />
              </div>

              <div hidden={activity !== 'extensions'} className="tab-body">
                <ExtensionsPanel
                  workspaceRoot={workspace?.root ?? null}
                  defaultModel={settings.defaultModel}
                  terminalRunning={terminal.running}
                />
              </div>

              <div hidden={activity !== 'git'} className="tab-body">
                <GitPanel
                  workspaceRoot={workspace?.root ?? null}
                  onStatus={reportStatus}
                  onOpenFile={(path) => void openEditorFile(path)}
                />
              </div>

              <div hidden={activity !== 'run'} className="tab-body">
                <RunDebugSidebar
                  workspaceRoot={workspace?.root ?? null}
                  diagnostics={diagSummary}
                  onRunDiagnostics={() => runDiagnosticsNow()}
                  onOpenProblems={() => showBottom('problems')}
                  onOpenTerminal={() => showBottom('terminal')}
                  onOpenDebugConsole={() => showBottom('debug')}
                />
              </div>
        </aside>
        </ErrorBoundary>

        {sidebarVisible && (
          <ResizeHandle
            orientation="vertical"
            direction={1}
            label="Resize sidebar"
            value={leftWidth}
            min={PANEL_LIMITS.left.min}
            max={PANEL_LIMITS.left.max}
            onResize={resizeLeft}
            onResizeEnd={persistPanels}
          />
        )}

        <section className="center">
          {showEditor && (
            <div className="editor-groups">
              {workbench.groups.map((group) => {
                const list = groupTabs(workbench, group)
                const groupActive = group.activeId
                  ? (findTab(workbench.tabs, group.activeId) ?? null)
                  : null
                const groupCode =
                  groupActive && isCodeTab(groupActive) ? groupActive : null
                const groupMeta =
                  groupActive && isMetaTab(groupActive) ? groupActive : null
                const isActiveGroup = group.id === activeGroup.id

                return (
                  <div
                    key={group.id}
                    className={
                      isActiveGroup
                        ? 'editor-group active-group'
                        : 'editor-group'
                    }
                    onMouseDown={() =>
                      setWorkbench((previous) =>
                        focusGroup(previous, group.id)
                      )
                    }
                  >
                    <EditorPanel
                      groupId={group.id}
                      tabs={list}
                      activeTab={groupActive}
                      sessions={sessions}
                      onSelectTab={(id) => selectTab(group.id, id)}
                      onCloseTab={(id) => void closeTabById(id)}
                      onCloseOthers={(keepId) =>
                        void closeOtherTabsById(group.id, keepId)
                      }
                      onSplitRight={(id) => splitGroupFromTab(group.id, id)}
                      onCloseGroup={() => closeEditorGroup(group.id)}
                      canCloseGroup={workbench.groups.length > 1}
                      onNewMetaAI={() => newMetaAI()}
                      onRenameSession={(sessionId) =>
                        void renameSession(sessionId)
                      }
                      onDeleteSession={(sessionId) =>
                        void deleteSession(sessionId)
                      }
                      onCopyPath={(_path, copied) =>
                        setStatus(
                          copied
                            ? 'Path copied to clipboard'
                            : 'Copy is unavailable in this context.'
                        )
                      }
                      content={groupCode?.content ?? ''}
                      dirty={groupCode ? isTabDirty(groupCode) : false}
                      saving={saving}
                      pendingLine={
                        pendingReveal &&
                        groupCode &&
                        pendingReveal.path === groupCode.path
                          ? pendingReveal.line
                          : null
                      }
                      onChange={(value) => {
                        if (!groupCode) {
                          return
                        }

                        const id = groupCode.id

                        setWorkbench((previous) => ({
                          ...previous,
                          tabs: updateCodeTab(previous.tabs, id, {
                            content: value,
                          }),
                        }))
                      }}
                      onSave={() => void saveEditor()}
                      onRevealConsumed={() => setPendingReveal(null)}
                      meta={
                        groupMeta
                          ? metaContextFor(group, groupMeta.sessionId)
                          : null
                      }
                      panelActive={isActiveGroup}
                      registerApi={(api) => {
                        editorApi.current = api
                      }}
                      fontSize={fontSize}
                      theme={theme}
                      onCursorChange={
                        isActiveGroup
                          ? (line, column) => setCursor({ line, column })
                          : undefined
                      }
                      workspaceRoot={workspace?.root ?? null}
                      markers={diagnostics}
                      onExplainSelection={handleExplainSelection}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {/* Always mounted (hidden unless staged) so Intel and
              Platform sessions survive editor and home visits. */}
          <section hidden={!staged} className="editor-panel stage">
            <div className="stage-tabs" role="tablist" aria-label="Developer tools">
              {STAGE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={staged === tab.id}
                  className={
                    staged === tab.id ? 'panel-tab active' : 'panel-tab'
                  }
                  onClick={() => stageCenter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
              <span className="spacer" />
              <button
                className="panel-tab stage-close"
                onClick={unstageCenter}
                title="Back to editor or home"
                aria-label="Close tools stage"
              >
                ×
              </button>
            </div>

            <div className="stage-body">
              <div hidden={staged !== 'intel'} className="tab-body">
                <IntelligenceHub
                  workspaceRoot={workspace?.root ?? null}
                  defaultModel={settings.defaultModel}
                  onStatus={reportStatus}
                  onOpenConnections={() => showAside('knowledge')}
                  onOpenFile={(path, line) =>
                    void openEditorFile(
                      resolveAgainstRoot(workspace?.root ?? null, path),
                      line
                    )
                  }
                  onFilesChanged={(paths) =>
                    void handleAgentFilesChanged(
                      paths.map((entry) =>
                        resolveAgainstRoot(workspace?.root ?? null, entry)
                      )
                    )
                  }
                />
              </div>
              <div hidden={staged !== 'platform'} className="tab-body">
                <PlatformHub
                  workspaceRoot={workspace?.root ?? null}
                  onStatus={reportStatus}
                />
              </div>
              <div hidden={staged !== 'agent'} className="tab-body">
                <AgentWorkspace
                  workspaceRoot={workspace?.root ?? null}
                  defaultModel={settings.defaultModel}
                  activeFile={activeCodePath}
                  onStatus={reportStatus}
                  onOpenFile={(path, line) =>
                    void openEditorFile(
                      resolveAgainstRoot(workspace?.root ?? null, path),
                      line
                    )
                  }
                  onFilesChanged={(paths) =>
                    void handleAgentFilesChanged(
                      paths.map((entry) =>
                        resolveAgainstRoot(workspace?.root ?? null, entry)
                      )
                    )
                  }
                />
              </div>
            </div>
          </section>

          {!showEditor && !staged && (
            <section className="editor-panel">
              {workbench.tabs.length > 0 && (
                <div className="tabbar home-tabbar">
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => setCenterView('editor')}
                  >
                    ← Back to editor ({workbench.tabs.length} tab{workbench.tabs.length === 1 ? '' : 's'} open)
                  </button>
                </div>
              )}
              <WelcomePage
                mode={discoveryMode}
                onModeChange={setDiscoveryMode}
                workspaceRoot={workspace?.root ?? null}
                defaultModel={settings.defaultModel}
                activeFile={activeCodePath}
                fileName={
                  activeCodeTab ? baseName(activeCodeTab.path) : ''
                }
                fileContent={activeCodeTab?.content ?? ''}
                fileDirty={
                  activeCodeTab ? isTabDirty(activeCodeTab) : false
                }
                contextEnabled={settings.aiContextEnabled}
                chatResearchId={chatResearchId}
                onDetachChatResearch={() => setChatResearchId(null)}
                onOpenInAgent={handleDiscoveryOpenInAgent}
                onResearchImplement={handleDiscoveryResearchImplement}
                onResearchAsk={handleDiscoveryResearchAsk}
                onStatus={reportStatus}
                onOpenProviderSettings={openProviderSettings}
                onFilesChanged={(paths) => void handleAgentFilesChanged(paths)}
                confirmAllCommands={settings.confirmAllCommands}
                onToggleConfirmAll={() => void toggleConfirmAllCommands()}
                onOpenProject={() => void openProject()}
                chatSelect={chatSelect}
                researchRestore={researchRestore}
                newRequest={homeNewRequest}
                initialPrompt={homePrompt}
                onInitialPromptConsumed={() => setHomePrompt(null)}
                onOpenFile={(path) => void openEditorFile(path)}
              />
            </section>
          )}

          {/* Bottom dock: single mounts for Terminal, Problems,
              Output, Debug Console, and Tasks (Phase D1). Source
              Control lives in the sidebar; Run and Debug routes here.
              Always mounted (hidden when closed) so terminal runs,
              diagnostics, and output survive docking. */}
          {(
            <div hidden={!bottomOpen} className="bottom-dock">
              {!bottomMaximized && (
                <ResizeHandle
                  orientation="horizontal"
                  direction={-1}
                  label="Resize bottom panel"
                  value={bottomHeight}
                  min={PANEL_LIMITS.bottom.min}
                  max={PANEL_LIMITS.bottom.max}
                  onResize={resizeBottom}
                  onResizeEnd={persistPanels}
                />
              )}

              <ErrorBoundary compact title="The bottom panel crashed.">
              <aside
                className="bottom-panel"
                style={{
                  height: bottomMaximized
                    ? maximizedBottomHeight
                    : bottomHeight,
                }}
                aria-label="Bottom panel"
              >
                <div
                  className="bottom-tabs"
                  role="tablist"
                  aria-label="Bottom panel"
                >
                  {BOTTOM_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={bottomTab === tab.id}
                      className={
                        bottomTab === tab.id
                          ? 'panel-tab active'
                          : 'panel-tab'
                      }
                      onClick={() => toggleBottom(tab.id)}
                      title={
                        tab.id === 'problems' && problemTotal > 0
                          ? `${problemErrors} error(s), ${problemWarnings} warning(s)`
                          : bottomTab === tab.id
                            ? `Hide ${tab.label} (click again to collapse)`
                            : `Show ${tab.label}`
                      }
                    >
                      {tab.label}
                      {tab.id === 'problems' && problemTotal > 0 && (
                        <span
                          className="panel-tab-badge"
                          aria-label={`${problemErrors} errors, ${problemWarnings} warnings`}
                        >
                          {problemTotal}
                        </span>
                      )}
                    </button>
                  ))}
                  <span className="spacer" />
                  <button
                    className="panel-tab bottom-maximize"
                    onClick={() => setBottomMaximized((value) => !value)}
                    title={
                      bottomMaximized
                        ? 'Restore bottom panel size'
                        : 'Maximize bottom panel'
                    }
                    aria-label={
                      bottomMaximized
                        ? 'Restore bottom panel size'
                        : 'Maximize bottom panel'
                    }
                    aria-pressed={bottomMaximized}
                  >
                    {bottomMaximized ? 'Restore' : 'Maximize'}
                  </button>
                  <button
                    className="panel-tab bottom-collapse"
                    onClick={() => setBottomOpen(false)}
                    title="Close bottom panel (Ctrl+J toggles)"
                    aria-label="Close bottom panel"
                  >
                    ×
                  </button>
                </div>

                <div className="bottom-body">
                  <div hidden={bottomTab !== 'terminal'} className="tab-body">
                    <TerminalPanelView
                      controller={terminal}
                      workspaceRoot={workspace?.root ?? null}
                      focusRequest={terminalFocus}
                      theme={theme}
                      fontSize={terminalFontSize}
                      renderer={terminalRenderer}
                    />
                  </div>
                  <div hidden={bottomTab !== 'problems'} className="tab-body">
                    <ProblemsPanel
                      workspaceRoot={workspace?.root ?? null}
                      requireConfirmAll={settings.confirmAllCommands}
                      scripts={scripts}
                      onOpenFileAtLine={(path, line) =>
                        void openEditorFile(path, line)
                      }
                      onStatus={reportStatus}
                      pendingRun={diagnosticsRun}
                      onResult={(count, success) =>
                        setDiagSummary({ count, success })
                      }
                      onDiagnostics={(result) =>
                        setDiagnostics(result ? result.diagnostics : [])
                      }
                      onExplainDiagnostic={handleExplainDiagnostic}
                    />
                  </div>
                  <div hidden={bottomTab !== 'output'} className="tab-body">
                    <OutputPanel />
                  </div>
                  <div hidden={bottomTab !== 'debug'} className="tab-body">
                    <DebugConsolePanel />
                  </div>
                  <div hidden={bottomTab !== 'tasks'} className="tab-body">
                    <TasksPanel
                      workspaceRoot={workspace?.root ?? null}
                      onStatus={reportStatus}
                      onOpenFile={(path, line) => void openEditorFile(path, line)}
                    />
                  </div>
                </div>
              </aside>
              </ErrorBoundary>
            </div>
          )}
        </section>

        {asideOpen && (
          <ResizeHandle
            orientation="vertical"
            direction={-1}
            label="Resize auxiliary panel"
            value={asideWidth}
            min={PANEL_LIMITS.aside.min}
            max={PANEL_LIMITS.aside.max}
            onResize={resizeAside}
            onResizeEnd={() => undefined}
          />
        )}

        <ErrorBoundary title="Auxiliary panel">
          <AsidePanel
            open={asideOpen}
            width={asideWidth}
            title={
              asideActivity === 'knowledge'
                ? 'KNOWLEDGE'
                : asideActivity === 'history'
                  ? 'HISTORY'
                  : 'AI WORKSPACE'
            }
            onClose={() => setAsideOpen(false)}
          >
            <div
              hidden={asideActivity !== 'ai-workspace'}
              className="tab-body"
            >
              <AiWorkspaceHub
                onNewThread={() => newMetaAI()}
                onOpenChat={() => {
                  showHome()
                  setDiscoveryMode('chat')
                }}
                onOpenResearch={() => {
                  showHome()
                  setDiscoveryMode('research')
                }}
                onOpenAgentRuns={() => stageCenter('agent')}
                onOpenIntel={() => stageCenter('intel')}
                onOpenPlatform={() => stageCenter('platform')}
              />
            </div>

            <div hidden={asideActivity !== 'knowledge'} className="tab-body">
              <p className="side-subhead">CONNECTIONS</p>
              <ConnectionsPanel
                workspaceRoot={workspace?.root ?? null}
                defaultModel={settings.defaultModel}
                activeFileName={activeCodeTab ? baseName(activeCodeTab.path) : ''}
                activeFileContent={activeCodeTab?.content ?? ''}
                onStatus={reportStatus}
                onOpenSourceControl={() => showSidebar('git')}
                onCloneRepository={(url) => cloneRepository(url)}
                onCreateReport={(template) => void createReport(template)}
                onExportActiveFile={(template) => void exportActiveFile(template)}
                onImportSave={(text, fileName) => void importSave(text, fileName)}
              />
              <p className="side-subhead">MEMORY</p>
              <MemoryPanel
                workspaceRoot={workspace?.root ?? null}
                onStatus={reportStatus}
              />
            </div>

            <div hidden={asideActivity !== 'history'} className="tab-body">
              <HistoryPanel
                threads={threadRefs}
                recent={recent}
                corrupt={indexCorrupt}
                filter={historyFilter}
                onFilterChange={setHistoryFilter}
                onOpenThread={(thread) => void openThread(thread)}
                onNewThread={newThread}
                onOpenRecent={(root) => void openRecentPath(root)}
              />
            </div>
          </AsidePanel>
        </ErrorBoundary>
      </div>

      <StatusBar
        status={status}
        workspaceName={workspace ? baseName(workspace.root) : null}
        branch={gitBranch.branch}
        branchKnown={gitBranch.known}
        onBranchRefresh={() => {
          showSidebar('git')
          void refreshGitBranch()
        }}
        fileName={activeCodeTab ? baseName(activeCodeTab.path) : null}
        dirty={dirty}
        language={activeCodeTab ? detectLanguage(baseName(activeCodeTab.path)) : null}
        line={showEditor ? cursor.line : null}
        column={showEditor ? cursor.column : null}
        model={settings.defaultModel}
        providerLabel={providerStatus.label}
        providerOk={providerStatus.ok}
        onOpenProviderSettings={openProviderSettings}
        autoSave={autoSave}
        terminalRunning={terminal.running}
        diagnostics={diagSummary}
        onShowDiagnostics={() => showBottom('problems')}
        bottomOpen={bottomOpen}
        onToggleBottom={() => setBottomOpen((open) => !open)}
      />

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      <QuickOpen
        open={quickOpen}
        root={workspace?.root ?? ''}
        tree={workspace?.tree ?? []}
        onOpen={(path) => void openEditorFile(path)}
        onClose={() => setQuickOpen(false)}
      />

      <CommandPalette
        open={paletteOpen}
        commands={paletteCommands}
        onClose={() => setPaletteOpen(false)}
      />

      <TemplatePickerDialog
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onGenerated={(destination) => void openRecentPath(destination)}
        onStatus={reportStatus}
      />

      <SettingsModal
        open={settingsOpen}
        initial={settings}
        initialSection={settingsSection}
        onClose={() => setSettingsOpen(false)}
        onStatus={reportStatus}
        onSaved={(next) => {
          setSettings(next)
          reportStatus('Settings saved')
        }}
        fontSize={fontSize}
        onFontSizeChange={(size) => setFontSize(clampFontSize(size))}
        theme={theme}
        onThemeChange={(next) => setTheme(next)}
        autoSave={autoSave}
        onToggleAutoSave={() => void toggleAutoSave()}
        panelLeftWidth={leftWidth}
        panelBottomHeight={bottomHeight}
        onResetPanels={resetPanels}
        terminalFontSize={terminalFontSize}
        onTerminalFontSizeChange={(size) =>
          setTerminalFontSize(clampTerminalFontSize(size))
        }
        terminalRenderer={terminalRenderer}
        onTerminalRendererChange={setTerminalRenderer}
        accountWorkspaceRoot={workspace?.root ?? null}
        accountModel={settings.defaultModel}
        accountSummary={summary}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <ShortcutsDialog
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <DiagnosticsDialog
        open={diagnosticsOpen}
        onClose={() => setDiagnosticsOpen(false)}
        onStatus={reportStatus}
      />
    </main>
  )
}

function App() {
  return (
    <DialogProvider>
      <AppShell />
    </DialogProvider>
  )
}

export default App
