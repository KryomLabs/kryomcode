import { useEffect } from 'react'

export interface ShortcutsDialogProps {
  open: boolean
  onClose: () => void
}

interface ShortcutRow {
  keys: string
  action: string
}

// Every row below mirrors a registered native accelerator (see
// electron/menu.cjs) or an in-app key handler. Do not add rows for
// shortcuts that are not actually wired.
const SECTIONS: Array<{ title: string; rows: ShortcutRow[] }> = [
  {
    title: 'Files',
    rows: [
      { keys: 'Ctrl+N', action: 'New file in the open project' },
      { keys: 'Ctrl+O', action: 'Open a single file' },
      { keys: 'Ctrl+Shift+O', action: 'Open a project folder' },
      { keys: 'Ctrl+S', action: 'Save the active file' },
      { keys: 'Ctrl+Shift+S', action: 'Save the active file as…' },
      { keys: 'Ctrl+W', action: 'Close the active editor tab' },
    ],
  },
  {
    title: 'Editor tabs',
    rows: [
      { keys: 'Ctrl+Tab', action: 'Next open tab' },
      { keys: 'Ctrl+Shift+Tab', action: 'Previous open tab' },
      { keys: '← / →', action: 'Move between tabs (tab strip focused)' },
      { keys: 'Home / End', action: 'First / last tab (tab strip focused)' },
      { keys: 'Ctrl+G', action: 'Go to line…' },
      { keys: 'Ctrl+F', action: 'Find in the active file' },
      { keys: 'Ctrl+H', action: 'Find and replace in the active file' },
    ],
  },
  {
    title: 'Navigate',
    rows: [
      { keys: 'Ctrl+P', action: 'Go to file…' },
      { keys: 'Alt+← / Alt+→', action: 'Back / forward in file history' },
      { keys: 'F8 / Shift+F8', action: 'Next / previous problem in the editor' },
      { keys: 'Shift+Alt+→ / ←', action: 'Expand / shrink selection' },
    ],
  },
  {
    title: 'Views and panels',
    rows: [
      { keys: 'Ctrl+Shift+E', action: 'Explorer' },
      { keys: 'Ctrl+Shift+F', action: 'Search' },
      { keys: 'Ctrl+Shift+G', action: 'Source Control' },
      { keys: 'Ctrl+Shift+D', action: 'Run and Debug' },
      { keys: 'Ctrl+Shift+X', action: 'Extensions' },
      { keys: 'Ctrl+Shift+A', action: 'AI Workspace' },
      { keys: 'Ctrl+Shift+K', action: 'Knowledge' },
      { keys: 'Ctrl+Shift+H', action: 'History' },
      { keys: 'Ctrl+Shift+M', action: 'New AI thread' },
      { keys: 'Ctrl+Shift+P', action: 'Command palette' },
      { keys: 'Ctrl+,', action: 'Open Settings' },
      { keys: 'Ctrl+\\', action: 'Split editor right' },
      { keys: 'Ctrl+1', action: 'Focus the editor' },
      { keys: 'Ctrl+B', action: 'Toggle the sidebar' },
      { keys: 'Ctrl+`', action: 'Toggle the Terminal tab' },
      { keys: 'Ctrl+J', action: 'Toggle the bottom panel' },
      { keys: 'Ctrl+Shift+J', action: 'Toggle the Problems tab' },
    ],
  },
  {
    title: 'Run and terminal',
    rows: [
      { keys: 'F5', action: 'Run diagnostics' },
      { keys: '↑ / ↓', action: 'Command history (terminal input focused)' },
    ],
  },
  {
    title: 'Composers and dialogs',
    rows: [
      { keys: 'Ctrl+Enter', action: 'Send from any AI composer' },
      { keys: 'Esc', action: 'Close the topmost dialog or palette' },
    ],
  },
]

export function ShortcutsDialog(props: ShortcutsDialogProps) {
  useEffect(() => {
    if (!props.open) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        props.onClose()
      }
    }

    document.addEventListener('keydown', onKey)

    return () => document.removeEventListener('keydown', onKey)
  }, [props.open, props.onClose])

  if (!props.open) {
    return null
  }

  return (
    <div
      className="dialog-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose()
        }
      }}
    >
      <div
        className="dialog shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <h2>Keyboard shortcuts</h2>

        {SECTIONS.map((section) => (
          <section key={section.title} className="shortcuts-section">
            <h3>{section.title}</h3>
            <dl className="shortcuts-list">
              {section.rows.map((row) => (
                <div key={row.keys} className="shortcuts-row">
                  <dt>
                    <kbd>{row.keys}</kbd>
                  </dt>
                  <dd>{row.action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <div className="dialog-actions">
          <button
            type="button"
            className="primary-button"
            onClick={props.onClose}
            autoFocus
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
