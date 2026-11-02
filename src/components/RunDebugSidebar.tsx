// Run and Debug sidebar view (Phase A): diagnostics entry point
// composed of existing shell state and handlers. Live output stays
// in the bottom Problems panel; this view summarizes and routes.
export interface RunDebugSidebarProps {
  workspaceRoot: string | null
  diagnostics: { count: number; success: boolean } | null
  onRunDiagnostics: () => void
  onOpenProblems: () => void
  onOpenTerminal: () => void
  // Debug Console routing (Phase D1). Absent = no Debug row.
  onOpenDebugConsole?: () => void
}

export function RunDebugSidebar(props: RunDebugSidebarProps) {
  const summary = props.diagnostics

  return (
    <div className="aside-hub" role="group" aria-label="Run and Debug">
      {!props.workspaceRoot && (
        <p className="muted padded">
          Open a project folder to run diagnostics.
        </p>
      )}

      {props.workspaceRoot && (
        <button
          type="button"
          className="hub-row hub-action"
          onClick={props.onRunDiagnostics}
          title="Run diagnostics (F5)"
        >
          <span className="hub-label">▶ Run Diagnostics</span>
          <span className="muted hub-hint">F5</span>
        </button>
      )}

      <p className="side-subhead">STATUS</p>
      <p className="muted padded">
        {summary === null
          ? 'No diagnostics run yet.'
          : summary.success
            ? `${summary.count} problem${summary.count === 1 ? '' : 's'} — last run clean.`
            : `${summary.count} problem${summary.count === 1 ? '' : 's'} found.`}
      </p>

      <button
        type="button"
        className="hub-row"
        onClick={props.onOpenProblems}
      >
        <span className="hub-label">Open Problems</span>
        <span className="muted hub-hint">Bottom panel</span>
      </button>
      <button
        type="button"
        className="hub-row"
        onClick={props.onOpenTerminal}
      >
        <span className="hub-label">Open Terminal</span>
        <span className="muted hub-hint">Bottom panel</span>
      </button>
      {props.onOpenDebugConsole && (
        <button
          type="button"
          className="hub-row"
          onClick={props.onOpenDebugConsole}
        >
          <span className="hub-label">Open Debug Console</span>
          <span className="muted hub-hint">Bottom panel</span>
        </button>
      )}
    </div>
  )
}
