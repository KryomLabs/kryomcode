// Bottom-panel tab ids (Phase D1). The single list of panel
// destinations plus the validated restore helper — the shell keeps
// owning the state, this module only names the ids so the restore
// path and its tests share one contract.

export type BottomTab =
  | 'terminal'
  | 'problems'
  | 'output'
  | 'debug'
  | 'tasks'

export const BOTTOM_TAB_IDS: BottomTab[] = [
  'terminal',
  'problems',
  'output',
  'debug',
  'tasks',
]

// Restores the persisted active panel. Unknown, retired, or missing
// values fall back to the terminal; nothing throws on corrupt input.
export function parseBottomTab(raw: string | null): BottomTab {
  return raw !== null &&
    (BOTTOM_TAB_IDS as string[]).includes(raw)
    ? (raw as BottomTab)
    : 'terminal'
}
