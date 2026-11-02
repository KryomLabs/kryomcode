// Minimal line diff for agent edit previews. Pure LCS with quadratic
// bounds: oversized inputs degrade to a truncated head preview that is
// clearly marked, never a fabricated full diff.

export interface DiffLine {
  type: 'same' | 'add' | 'del'
  text: string
}

export interface DiffResult {
  lines: DiffLine[]
  truncated: boolean
}

export interface HunkLine extends DiffLine {
  oldNo: number | null
  newNo: number | null
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: HunkLine[]
}

const MAX_CELLS = 4_000_000
const FALLBACK_LINES = 100

function fallback(a: string[], b: string[]): DiffResult {
  return {
    lines: [
      ...a.slice(0, FALLBACK_LINES).map((text) => ({ type: 'del' as const, text })),
      ...b.slice(0, FALLBACK_LINES).map((text) => ({ type: 'add' as const, text })),
    ],
    truncated: true,
  }
}

export function diffLines(oldText: string, newText: string): DiffResult {
  const a = oldText.split('\n')
  const b = newText.split('\n')

  if (a.length * b.length > MAX_CELLS) {
    return fallback(a, b)
  }

  const rows = a.length + 1
  const cols = b.length + 1
  const table = new Uint32Array(rows * cols)

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        table[i * cols + j] = table[(i + 1) * cols + (j + 1)] + 1
      } else {
        const skipA = table[(i + 1) * cols + j]
        const skipB = table[i * cols + (j + 1)]
        table[i * cols + j] = skipA >= skipB ? skipA : skipB
      }
    }
  }

  const lines: DiffLine[] = []
  let i = 0
  let j = 0

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (table[(i + 1) * cols + j] >= table[i * cols + (j + 1)]) {
      lines.push({ type: 'del', text: a[i] })
      i += 1
    } else {
      lines.push({ type: 'add', text: b[j] })
      j += 1
    }
  }

  while (i < a.length) {
    lines.push({ type: 'del', text: a[i] })
    i += 1
  }

  while (j < b.length) {
    lines.push({ type: 'add', text: b[j] })
    j += 1
  }

  return { lines, truncated: false }
}

// Groups flat diff lines into hunks with surrounding context and
// 1-based old/new line numbers. Pure presentation over diffLines:
// hunks with no changes are dropped, so identical inputs yield [].
export function groupHunks(lines: DiffLine[], context = 3): DiffHunk[] {
  const window = Number.isFinite(context) ? Math.max(0, Math.floor(context)) : 3
  const numbered: HunkLine[] = []
  let oldNo = 1
  let newNo = 1

  for (const line of lines) {
    if (line.type === 'same') {
      numbered.push({ ...line, oldNo, newNo })
      oldNo += 1
      newNo += 1
    } else if (line.type === 'del') {
      numbered.push({ ...line, oldNo, newNo: null })
      oldNo += 1
    } else {
      numbered.push({ ...line, oldNo: null, newNo })
      newNo += 1
    }
  }

  const hunks: DiffHunk[] = []
  const total = numbered.length
  let cursor = 0

  while (cursor < total) {
    // Next change at or after the cursor; a trailing same-run ends
    // the walk.
    let change = cursor

    while (change < total && numbered[change].type === 'same') {
      change += 1
    }

    if (change >= total) {
      break
    }

    // Leading context, clamped to the previous hunk so hunks never
    // overlap.
    const hunkStart = Math.max(cursor, change - window)

    // Extend through changes and short same-runs; a same-run longer
    // than the joined context windows separates two hunks.
    let scan = change
    let lastChange = change

    while (scan < total) {
      if (numbered[scan].type !== 'same') {
        lastChange = scan
        scan += 1
        continue
      }

      let runEnd = scan

      while (runEnd < total && numbered[runEnd].type === 'same') {
        runEnd += 1
      }

      if (runEnd - scan > window * 2) {
        break
      }

      scan = runEnd
    }

    const hunkEnd = Math.min(total, lastChange + 1 + window)
    const slice = numbered.slice(hunkStart, hunkEnd)
    const oldNums = slice
      .map((line) => line.oldNo)
      .filter((value): value is number => value !== null)
    const newNums = slice
      .map((line) => line.newNo)
      .filter((value): value is number => value !== null)
    // Pure-insertion (or pure-deletion) hunks have no own-side
    // numbers; anchor the range on the preceding line, 0 at file
    // start, per unified-diff convention.
    const prevOld = hunkStart > 0 ? (numbered[hunkStart - 1].oldNo ?? 0) : 0
    const prevNew = hunkStart > 0 ? (numbered[hunkStart - 1].newNo ?? 0) : 0

    hunks.push({
      oldStart: oldNums.length > 0 ? oldNums[0] : prevOld,
      oldCount: slice.filter((line) => line.type !== 'add').length,
      newStart: newNums.length > 0 ? newNums[0] : prevNew,
      newCount: slice.filter((line) => line.type !== 'del').length,
      lines: slice,
    })

    cursor = hunkEnd
  }

  return hunks
}
