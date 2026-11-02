// Shared subsequence fuzzy matching (Phase A). Extracted from
// QuickOpen so the command palette ranks with the same behavior:
// name/label matches beat path/detail matches, earlier and denser
// matches beat scattered ones. Returns -1 on no match.

export function fuzzyScore(query: string, target: string): number {
  let qi = 0
  let score = 0
  let lastHit = -1

  for (let ti = 0; ti < target.length && qi < query.length; ti += 1) {
    if (target[ti] === query[qi]) {
      score += lastHit === ti - 1 ? 2 : 1
      lastHit = ti
      qi += 1
    }
  }

  return qi === query.length ? score : -1
}

export interface RankedItem<T> {
  item: T
  score: number
}

// Rank items by (label, detail) using the shared fuzzy score. Label
// matches weigh 3x, mirroring the file-name weighting in QuickOpen.
export function rankFuzzy<T>(
  items: T[],
  query: string,
  labelOf: (item: T) => string,
  detailOf: (item: T) => string,
  maxShown: number
): T[] {
  const q = query.trim().toLowerCase()

  if (!q) {
    return items.slice(0, maxShown)
  }

  const scored: Array<RankedItem<T>> = []

  for (const item of items) {
    const labelScore = fuzzyScore(q, labelOf(item).toLowerCase())
    const detailScore = fuzzyScore(q, detailOf(item).toLowerCase())

    if (labelScore < 0 && detailScore < 0) {
      continue
    }

    scored.push({
      item,
      score:
        Math.max(labelScore * 3, detailScore) * 1000 -
        labelOf(item).length,
    })
  }

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, maxShown).map((entry) => entry.item)
}
