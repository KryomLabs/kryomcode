// Shared hunk-grouped diff view for the Agent Console. Both the
// run workspace and the plan panel render through here so diff
// presentation stays identical. Pure presentation over diffLines:
// hunk headers and line numbers are derived, never backend data.
import { diffLines, groupHunks } from '../../utils/diff'

const MAX_SHOWN_LINES = 300

function gutterMark(type: string): string {
  if (type === 'add') {
    return '+'
  }

  if (type === 'del') {
    return '−'
  }

  return ' '
}

export function DiffView({
  oldText,
  newText,
}: {
  oldText: string
  newText: string
}) {
  const { lines, truncated } = diffLines(oldText, newText)
  const hunks = groupHunks(lines)
  const shownCount = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0)

  if (hunks.length === 0) {
    return <div className="muted padded">No differences.</div>
  }

  let rendered = 0
  const cut = truncated || shownCount > MAX_SHOWN_LINES

  return (
    <div className="diff-view">
      {hunks.map((hunk, hunkIndex) => {
        if (rendered >= MAX_SHOWN_LINES) {
          return null
        }

        const take = hunk.lines.slice(0, MAX_SHOWN_LINES - rendered)
        rendered += take.length

        return (
          <div key={hunkIndex} className="diff-hunk">
            <div className="diff-hunk-header">
              @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
            </div>
            {take.map((line, lineIndex) => (
              <div key={lineIndex} className={`diff-line diff-${line.type}`}>
                <span className="diff-lineno" aria-hidden="true">
                  {line.oldNo ?? ''}
                </span>
                <span className="diff-lineno" aria-hidden="true">
                  {line.newNo ?? ''}
                </span>
                <span className="diff-gutter">{gutterMark(line.type)}</span>
                <span className="diff-text">{line.text || ' '}</span>
              </div>
            ))}
          </div>
        )
      })}
      {cut && <div className="muted padded">Diff truncated for display.</div>}
    </div>
  )
}
