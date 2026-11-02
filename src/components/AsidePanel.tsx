// Right-side auxiliary dock (Phase A shell). Renders the active
// aside destination; content stays mounted while hidden so panel
// state survives switching, mirroring the sidebar and bottom panel.
import type { ReactNode } from 'react'

export interface AsidePanelProps {
  open: boolean
  width: number
  title: string
  onClose: () => void
  children: ReactNode
}

export function AsidePanel(props: AsidePanelProps) {
  return (
    <aside
      hidden={!props.open}
      className="aside"
      style={{ width: props.width }}
      aria-label="Auxiliary panel"
    >
      <div className="side-header">
        <span className="side-title">{props.title}</span>
        <span className="spacer" />
        <button
          type="button"
          className="mini-btn"
          onClick={props.onClose}
          title="Close auxiliary panel"
          aria-label="Close auxiliary panel"
        >
          ×
        </button>
      </div>
      <div className="tab-body">{props.children}</div>
    </aside>
  )
}
