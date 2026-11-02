// groupHunks tests (Phase C): hunk splitting, context windows,
// and 1-based old/new line numbers over diffLines output.
import { describe, expect, it } from 'vitest'
import { diffLines, groupHunks, type DiffLine } from './diff'

function hunksFor(oldText: string, newText: string, context?: number) {
  return groupHunks(diffLines(oldText, newText).lines, context)
}

describe('groupHunks', () => {
  it('returns no hunks for identical inputs', () => {
    expect(hunksFor('a\nb\nc', 'a\nb\nc')).toEqual([])
  })

  it('returns no hunks for an empty line list', () => {
    expect(groupHunks([] as DiffLine[])).toEqual([])
  })

  it('groups a single change with header ranges and line numbers', () => {
    const hunks = hunksFor('a\nb\nc', 'a\nB\nc')

    expect(hunks).toHaveLength(1)

    const [hunk] = hunks
    expect(hunk.oldStart).toBe(1)
    expect(hunk.oldCount).toBe(3)
    expect(hunk.newStart).toBe(1)
    expect(hunk.newCount).toBe(3)
    expect(hunk.lines.map((line) => [line.type, line.oldNo, line.newNo])).toEqual([
      ['same', 1, 1],
      ['del', 2, null],
      ['add', null, 2],
      ['same', 3, 3],
    ])
  })

  it('splits distant changes into hunks with trimmed context', () => {
    const oldText = Array.from({ length: 20 }, (_, i) => `${i + 1}`).join('\n')
    const changed = Array.from({ length: 20 }, (_, i) =>
      i === 4 ? '5x' : i === 17 ? '18x' : `${i + 1}`
    ).join('\n')
    const hunks = hunksFor(oldText, changed)

    expect(hunks).toHaveLength(2)
    expect([hunks[0].oldStart, hunks[0].oldCount]).toEqual([2, 7])
    expect([hunks[0].newStart, hunks[0].newCount]).toEqual([2, 7])
    expect([hunks[1].oldStart, hunks[1].oldCount]).toEqual([15, 6])
    expect([hunks[1].newStart, hunks[1].newCount]).toEqual([15, 6])
    // Leading context of the second hunk never overlaps the first.
    expect(hunks[0].lines).toHaveLength(8)
    expect(hunks[1].lines).toHaveLength(7)
  })

  it('merges nearby changes into one hunk', () => {
    const hunks = hunksFor('a\nb\nc\nd\ne', 'a\nB\nc\nD\ne')

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines.some((line) => line.type === 'same')).toBe(true)
  })

  it('honors a zero context window', () => {
    const hunks = hunksFor('a\nb\nc', 'a\nB\nc', 0)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines.map((line) => line.type)).toEqual(['del', 'add'])
  })

  it('clamps a negative context window to zero', () => {
    const hunks = hunksFor('a\nb\nc', 'a\nB\nc', -2)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines.map((line) => line.type)).toEqual(['del', 'add'])
  })

  it('handles changes at the start and end of the file', () => {
    const hunks = hunksFor('a\nb\nc', 'A\nb\nC')

    expect(hunks).toHaveLength(1)
    expect(hunks[0].oldStart).toBe(1)
    expect(hunks[0].lines[0]).toMatchObject({ type: 'del', oldNo: 1 })
  })

  it('anchors mid-file insertions on the preceding line', () => {
    const hunks = hunksFor('a\nb\nc', 'a\nb\nX\nc', 0)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].oldStart).toBe(2)
    expect(hunks[0].oldCount).toBe(0)
    expect(hunks[0].newStart).toBe(3)
    expect(hunks[0].newCount).toBe(1)
  })

  it('falls back to the default window for non-finite context', () => {
    const hunks = hunksFor('a\nb\nc', 'a\nB\nc', NaN)

    expect(hunks).toHaveLength(1)
    expect(hunks[0].lines).toHaveLength(4)
  })

  it('numbers pure additions against the new file', () => {
    const hunks = hunksFor('', 'a\nb')

    expect(hunks).toHaveLength(1)

    const adds = hunks[0].lines.filter((line) => line.type === 'add')
    expect(adds).toHaveLength(2)
    expect(adds.map((line) => line.newNo)).toEqual([1, 2])
    expect(adds.every((line) => line.oldNo === null)).toBe(true)
  })
})
