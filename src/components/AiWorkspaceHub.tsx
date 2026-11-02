// AI Workspace entry point (Phase A). A navigation hub over the
// EXISTING AI surfaces — every action routes to a real handler
// (home chat/research, agent runs, new session). No Phase B thread
// or composer internals live here.
export interface AiWorkspaceHubProps {
  onNewThread: () => void
  onOpenChat: () => void
  onOpenResearch: () => void
  onOpenAgentRuns: () => void
  onOpenIntel: () => void
  onOpenPlatform: () => void
}

export function AiWorkspaceHub(props: AiWorkspaceHubProps) {
  const entries: Array<{
    label: string
    hint: string
    run: () => void
  }> = [
    {
      label: 'New AI thread',
      hint: 'Start a Meta AI session tab',
      run: props.onNewThread,
    },
    {
      label: 'Open Chat',
      hint: 'Ask with project context',
      run: props.onOpenChat,
    },
    {
      label: 'Open Research',
      hint: 'Investigate with citations',
      run: props.onOpenResearch,
    },
    {
      label: 'Open Agent Runs',
      hint: 'Autonomous runs console',
      run: props.onOpenAgentRuns,
    },
    {
      label: 'Open Intelligence',
      hint: 'Index, planning, specialists',
      run: props.onOpenIntel,
    },
    {
      label: 'Open Platform',
      hint: 'Providers, skills, workflows',
      run: props.onOpenPlatform,
    },
  ]

  return (
    <div className="aside-hub" role="group" aria-label="AI Workspace">
      {entries.map((entry) => (
        <button
          key={entry.label}
          type="button"
          className="hub-row"
          onClick={entry.run}
        >
          <span className="hub-label">{entry.label}</span>
          <span className="muted hub-hint">{entry.hint}</span>
        </button>
      ))}
    </div>
  )
}
