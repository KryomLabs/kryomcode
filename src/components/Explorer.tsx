// Professional file explorer (Level 3C, Phase 1): hierarchical tree
// with folder expand/collapse, selection, Git status badges, and a
// context menu for file operations. All mutations go through the
// existing validated filesystem IPC; this component only presents.
import { useEffect, useRef, useState } from 'react'
import { baseName, parentDir } from '../utils/paths'
import { copyText } from '../utils/clipboard'
import {
  FileIcon,
  FolderIcon,
  NewFileIcon,
  NewFolderIcon,
  OpenFolderIcon,
  PencilIcon,
  RefreshIcon,
  TrashIcon,
} from './FileIcons'

export type GitBadge = 'staged' | 'unstaged' | 'untracked'

export interface ExplorerProps {
  workspace: KryomWorkspace | null
  activeFile: string | null
  loading: boolean
  projectInfo: string | null
  gitBadges?: Record<string, GitBadge> | null
  onOpenFile: (node: KryomNode) => void
  onOpenProject: () => void
  onCreateProject: () => void
  onRefresh: () => void
  onNewFile: (dir: string) => void
  onNewFolder: (dir: string) => void
  onRename: (node: KryomNode) => void
  onDelete: (node: KryomNode) => void
  // Copy-path result (Phase E): the host reports it on the status
  // bar since the context menu has no feedback surface.
  onCopyPath?: (path: string, copied: boolean) => void
}

interface RowProps {
  node: KryomNode
  depth: number
  activeFile: string | null
  selected: string | null
  badges: Record<string, GitBadge> | null | undefined
  onSelect: (path: string) => void
  onOpenFile: (node: KryomNode) => void
  onRename: (node: KryomNode) => void
  onDelete: (node: KryomNode) => void
  onMenu: (event: React.MouseEvent, node: KryomNode) => void
}

function badgeLabel(badge: GitBadge): string {
  if (badge === 'staged') {
    return 'S'
  }

  if (badge === 'untracked') {
    return 'U'
  }

  return 'M'
}

function badgeTitle(badge: GitBadge): string {
  if (badge === 'staged') {
    return 'Staged Git change'
  }

  if (badge === 'untracked') {
    return 'Untracked file'
  }

  return 'Unstaged Git change'
}

function ExplorerRow(props: RowProps) {
  const { node } = props
  const isSelected = props.selected === node.path
  const isActive = props.activeFile === node.path
  const badge = props.badges?.[node.path] ?? null

  if (node.type === 'directory') {
    return (
      <div key={node.path}>
        <details open={props.depth === 0}>
          <summary
            className={`tree-row${isSelected ? ' selected' : ''}`}
            style={{ paddingLeft: 12 + props.depth * 14 }}
            onClick={() => props.onSelect(node.path)}
            onContextMenu={(event) => props.onMenu(event, node)}
          >
            <span className="tree-icon" aria-hidden="true">
              <FolderIcon />
            </span>{' '}
            <span className="tree-name">{node.name}</span>
          </summary>

          {(node.children ?? []).map((child) => (
            <ExplorerRow
              key={child.path}
              node={child}
              depth={props.depth + 1}
              activeFile={props.activeFile}
              selected={props.selected}
              badges={props.badges}
              onSelect={props.onSelect}
              onOpenFile={props.onOpenFile}
              onRename={props.onRename}
              onDelete={props.onDelete}
              onMenu={props.onMenu}
            />
          ))}
        </details>
      </div>
    )
  }

  return (
    <div
      key={node.path}
      className={`tree-row-wrap${isSelected ? ' selected' : ''}`}
      style={{ paddingLeft: 12 + props.depth * 14 }}
      onContextMenu={(event) => props.onMenu(event, node)}
    >
      <button
        className={`tree-row file-row${isActive ? ' selected' : ''}`}
        onClick={() => {
          props.onSelect(node.path)
          props.onOpenFile(node)
        }}
        title={node.path}
      >
        <span className="tree-icon" aria-hidden="true">
          <FileIcon name={node.name} />
        </span>{' '}
        <span className="tree-name">{node.name}</span>
        {badge && (
          <span
            className={`git-badge git-${badge}`}
            title={badgeTitle(badge)}
            aria-label={badgeTitle(badge)}
          >
            {badgeLabel(badge)}
          </span>
        )}
      </button>

      {isSelected && (
        <span className="row-actions">
          <button
            title={`Rename ${node.name}`}
            aria-label={`Rename ${node.name}`}
            onClick={() => props.onRename(node)}
          >
            <PencilIcon />
          </button>
          <button
            title={`Delete ${node.name}`}
            aria-label={`Delete ${node.name}`}
            onClick={() => props.onDelete(node)}
          >
            <TrashIcon />
          </button>
        </span>
      )}
    </div>
  )
}

export function Explorer(props: ExplorerProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    node: KryomNode
  } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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

  const selectedDir = (): string | null => {
    if (!props.workspace) {
      return null
    }

    if (!selected) {
      return props.workspace.root
    }

    if (selected === props.activeFile || !isDirectoryPath(selected)) {
      return parentDir(selected)
    }

    return selected
  }

  const isDirectoryPath = (target: string): boolean => {
    const find = (nodes: KryomNode[]): boolean =>
      nodes.some(
        (node) =>
          (node.path === target && node.type === 'directory') ||
          (node.children ? find(node.children) : false)
      )

    return props.workspace ? find(props.workspace.tree) : false
  }

  const findNode = (target: string): KryomNode | null => {
    const walk = (nodes: KryomNode[]): KryomNode | null => {
      for (const node of nodes) {
        if (node.path === target) {
          return node
        }

        if (node.children) {
          const found = walk(node.children)

          if (found) {
            return found
          }
        }
      }

      return null
    }

    return props.workspace ? walk(props.workspace.tree) : null
  }

  function openMenu(event: React.MouseEvent, node: KryomNode): void {
    event.preventDefault()
    event.stopPropagation()
    setSelected(node.path)
    // Clamped so the menu never renders off-viewport near edges.
    setMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 190)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 220)),
      node,
    })
  }

  async function copyPath(targetPath: string): Promise<void> {
    try {
      if (!(await copyText(targetPath))) throw new Error('clipboard write failed')
      props.onCopyPath?.(targetPath, true)
    } catch {
      props.onCopyPath?.(targetPath, false)
    } finally {
      setMenu(null)
    }
  }

  const selectedNode = selected ? findNode(selected) : null
  const targetDir = selectedDir()
  const menuDir = menu
    ? menu.node.type === 'directory'
      ? menu.node.path
      : parentDir(menu.node.path)
    : null

  return (
    <div className="explorer">
      <div className="explorer-head">
        <button
          type="button"
          className="explorer-open"
          onClick={props.onOpenProject}
          title="Open a project folder (Ctrl+Shift+O)"
        >
          <OpenFolderIcon />
          <span>Open Project</span>
        </button>
        <span className="spacer" />
        <button
          type="button"
          className="icon-btn"
          title="New file in selected folder"
          aria-label="New file in selected folder"
          disabled={!targetDir || props.loading}
          onClick={() => targetDir && props.onNewFile(targetDir)}
        >
          <NewFileIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="New folder in selected folder"
          aria-label="New folder in selected folder"
          disabled={!targetDir || props.loading}
          onClick={() => targetDir && props.onNewFolder(targetDir)}
        >
          <NewFolderIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Refresh explorer"
          aria-label="Refresh explorer"
          disabled={!props.workspace || props.loading}
          onClick={props.onRefresh}
        >
          <RefreshIcon />
        </button>
      </div>

      {!props.workspace ? (
        <div className="explorer-empty">
          <p className="explorer-empty-title">No project open</p>
          <p className="muted">
            Open a local project to browse and edit its files, or
            generate one from a built-in template.
          </p>
          <div className="explorer-empty-actions">
            <button
              type="button"
              className="primary-button"
              onClick={props.onOpenProject}
            >
              Open Project
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={props.onCreateProject}
            >
              Create Project
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="root-name">
            <span className="tree-icon" aria-hidden="true">
              <FolderIcon />
            </span>{' '}
            <span className="tree-name">{baseName(props.workspace.root)}</span>
          </div>

          {props.projectInfo && (
            <div className="project-info">{props.projectInfo}</div>
          )}

          {selectedNode && selectedNode.type === 'directory' && (
            <div className="explorer-actions">
              <button onClick={() => props.onRename(selectedNode)}>
                Rename folder
              </button>
              <button onClick={() => props.onDelete(selectedNode)}>
                Delete folder
              </button>
            </div>
          )}

          <div className="tree">
            {props.workspace.tree.map((node) => (
              <ExplorerRow
                key={node.path}
                node={node}
                depth={0}
                activeFile={props.activeFile}
                selected={selected}
                badges={props.gitBadges}
                onSelect={setSelected}
                onOpenFile={props.onOpenFile}
                onRename={props.onRename}
                onDelete={props.onDelete}
                onMenu={openMenu}
              />
            ))}

            {props.workspace.tree.length === 0 && (
              <p className="muted padded">This folder is empty.</p>
            )}
          </div>
        </>
      )}

      {menu && (
        <div
          ref={menuRef}
          className="tab-context-menu"
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.node.type === 'file' && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null)
                props.onOpenFile(menu.node)
              }}
            >
              Open
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              if (menuDir) {
                props.onNewFile(menuDir)
              }
            }}
          >
            New file
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              if (menuDir) {
                props.onNewFolder(menuDir)
              }
            }}
          >
            New folder
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              props.onRename(menu.node)
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-danger"
            onClick={() => {
              setMenu(null)
              props.onDelete(menu.node)
            }}
          >
            Delete
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void copyPath(menu.node.path)}
          >
            Copy path
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenu(null)
              props.onRefresh()
            }}
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
