// Unified editor tab strip (Level 3C, Phase 2). Code files and Meta
// AI sessions share ONE strip: every tab is a WorkbenchTab, and a
// Meta AI tab behaves exactly like a normal editor tab (select,
// close, close-others, split). Roving-tabindex keyboard support is
// preserved: arrows move and select, Home/End jump, and the active
// tab scrolls into view. A context menu carries the tab actions.
import { useEffect, useRef, useState } from 'react'
import { baseName } from '../utils/paths'
import { copyText } from '../utils/clipboard'
import {
  isCodeTab,
  isExtensionTab,
  isMetaTab,
  isTabDirty,
  type WorkbenchTab,
} from '../state/workbench-tabs'
import type { MetaSession } from '../state/meta-sessions'
import { FileIcon } from './FileIcons'
import { MetaMark } from './MetaMark'

export interface EditorTabsProps {
  tabs: WorkbenchTab[]
  activeId: string | null
  sessions: Record<string, MetaSession>
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (keepId: string) => void
  onSplitRight: (id: string) => void
  onNewMetaAI: () => void
  onRenameSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  // Tab-strip copy result (Phase E): success and denial both
  // report so the host can confirm on the status bar.
  onCopyPath?: (path: string, copied: boolean) => void
}

function tabLabel(
  tab: WorkbenchTab,
  sessions: Record<string, MetaSession>
): string {
  if (isCodeTab(tab)) {
    return baseName(tab.path)
  }

  if (isMetaTab(tab)) {
    return `Meta AI — ${sessions[tab.sessionId]?.title ?? 'New Task'}`
  }

  return tab.title
}

function tabTitle(
  tab: WorkbenchTab,
  sessions: Record<string, MetaSession>
): string {
  if (isCodeTab(tab)) {
    return tab.path
  }

  if (isMetaTab(tab)) {
    const session = sessions[tab.sessionId]

    return session
      ? `Meta AI session "${session.title}" (${session.messages.length} message(s))`
      : 'Meta AI session'
  }

  return `${tab.extensionId} · ${tab.viewId}`
}

export function EditorTabs(props: EditorTabsProps) {
  const labelRefs = useRef(new Map<string, HTMLButtonElement>())
  const stripRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const prevCount = useRef(props.tabs.length)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
    null
  )

  useEffect(() => {
    if (props.activeId) {
      labelRefs.current
        .get(props.activeId)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [props.activeId, props.tabs.length])

  // Closing a tab unmounts its focused close button; move focus back
  // to the newly active tab instead of stranding it on the page body.
  useEffect(() => {
    if (props.tabs.length < prevCount.current) {
      const active = document.activeElement

      if (active && !stripRef.current?.contains(active) && props.activeId) {
        labelRefs.current.get(props.activeId)?.focus()
      }
    }

    prevCount.current = props.tabs.length
  })

  useEffect(() => {
    if (!menu) {
      return
    }

    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenu(null)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
      }
    }

    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  function focusTab(index: number) {
    const tab = props.tabs[index]

    if (!tab) {
      return
    }

    props.onSelect(tab.id)
    labelRefs.current.get(tab.id)?.focus()
  }

  function onLabelKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusTab((index + 1) % props.tabs.length)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusTab((index - 1 + props.tabs.length) % props.tabs.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusTab(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusTab(props.tabs.length - 1)
    }
  }

  function openMenu(event: React.MouseEvent, id: string) {
    event.preventDefault()
    event.stopPropagation()
    props.onSelect(id)
    // Clamped so the menu never renders off-viewport near edges.
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 220)),
      id,
    })
  }

  const menuTab = menu ? (props.tabs.find((tab) => tab.id === menu.id) ?? null) : null

  async function copyPath(targetPath: string) {
    try {
      if (!(await copyText(targetPath))) throw new Error('clipboard write failed')
      props.onCopyPath?.(targetPath, true)
    } catch {
      props.onCopyPath?.(targetPath, false)
    } finally {
      setMenu(null)
    }
  }

  return (
    <div
      ref={stripRef}
      className="editor-tabs"
      role="tablist"
      aria-label="Open editors"
    >
      {props.tabs.map((tab, index) => {
        const name = tabLabel(tab, props.sessions)
        const active = tab.id === props.activeId
        const dirty = isTabDirty(tab)

        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            aria-label={`${name}${dirty ? ', unsaved changes' : ''}`}
            title={tabTitle(tab, props.sessions)}
            className={
              active
                ? `editor-tab active editor-tab-${tab.kind}`
                : `editor-tab editor-tab-${tab.kind}`
            }
            onContextMenu={(event) => openMenu(event, tab.id)}
          >
            <button
              ref={(element) => {
                if (element) {
                  labelRefs.current.set(tab.id, element)
                } else {
                  labelRefs.current.delete(tab.id)
                }
              }}
              className="tab-label"
              onClick={() => props.onSelect(tab.id)}
              onKeyDown={(event) => onLabelKeyDown(event, index)}
              tabIndex={active ? 0 : -1}
            >
              <span className="tab-file-icon" aria-hidden="true">
                {isCodeTab(tab) ? (
                  <FileIcon name={name} />
                ) : isMetaTab(tab) ? (
                  <MetaMark size={13} />
                ) : (
                  <span className="tab-ext-glyph" aria-hidden="true">
                    ▦
                  </span>
                )}
              </span>
              <span className="tab-name-text">{name}</span>
              {dirty && (
                <span className="tab-dirty" aria-hidden="true">
                  •
                </span>
              )}
            </button>
            <button
              className="tab-close"
              aria-label={`Close ${name}${dirty ? ' (unsaved changes)' : ''}`}
              title={`Close ${name}`}
              onClick={(event) => {
                event.stopPropagation()
                props.onClose(tab.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}

      <span className="spacer" />

      <button
        type="button"
        className="tabs-meta-ai"
        onClick={props.onNewMetaAI}
        title="New Meta AI session (Ctrl+Shift+M)"
        aria-label="New Meta AI session"
      >
        <MetaMark size={15} gradient />
      </button>

      {props.tabs.length > 1 && (
        <button
          type="button"
          className="tabs-close-others"
          onClick={() => props.activeId && props.onCloseOthers(props.activeId)}
        >
          Close others
        </button>
      )}

      {menu && menuTab && (
        <div
          ref={menuRef}
          className="tab-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              props.onClose(menu.id)
            }}
          >
            Close
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              props.onCloseOthers(menu.id)
            }}
          >
            Close others
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              props.onSplitRight(menu.id)
            }}
          >
            Split right
          </button>
          {isCodeTab(menuTab) && (
            <button
              type="button"
              role="menuitem"
              onClick={() => void copyPath(menuTab.path)}
            >
              Copy path
            </button>
          )}
          {isMetaTab(menuTab) && props.onRenameSession && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null)
                props.onRenameSession?.(menuTab.sessionId)
              }}
            >
              Rename session
            </button>
          )}
          {isMetaTab(menuTab) && props.onDeleteSession && (
            <button
              type="button"
              role="menuitem"
              className="menu-danger"
              onClick={() => {
                setMenu(null)
                props.onDeleteSession?.(menuTab.sessionId)
              }}
            >
              Delete session
            </button>
          )}
        </div>
      )}
    </div>
  )
}
