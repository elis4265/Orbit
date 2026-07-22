/**
 * Pure command-palette matching. DB-free + side-effect-free → unit-testable.
 * The React component layers `run()` callbacks + live task search on top.
 */

export interface CommandItem {
  id: string
  title: string
  group: string
  keywords?: string[]
}

/**
 * Subsequence fuzzy match. Returns a score (higher = better) or `null` when not
 * every query char appears in `text`, in order. Rewards contiguous runs and
 * word-boundary hits; penalizes gaps and longer text (so tighter matches win).
 */
export function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  let ti = 0
  let score = 0
  let streak = 0
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]
    let found = -1
    for (let j = ti; j < t.length; j++) {
      if (t[j] === ch) { found = j; break }
    }
    if (found === -1) return null
    if (found === ti) {
      streak++
      score += 5 + streak            // contiguous run bonus, growing
    } else {
      streak = 0
      score -= (found - ti)          // gap penalty
    }
    if (found === 0 || ' -_/:'.includes(t[found - 1])) score += 10  // word-boundary bonus
    ti = found + 1
  }
  score -= t.length * 0.1            // prefer shorter haystacks on ties
  return score
}

/**
 * Score every command against its title + keywords, drop non-matches, and return
 * a STABLE sort by score desc (ties keep original order). Empty query → unchanged.
 */
export function filterCommands<T extends CommandItem>(commands: T[], query: string): T[] {
  const q = query.trim()
  if (!q) return commands
  const scored: { c: T; s: number; i: number }[] = []
  commands.forEach((c, i) => {
    const haystacks = [c.title, ...(c.keywords ?? [])]
    let best: number | null = null
    for (const h of haystacks) {
      const s = fuzzyScore(h, q)
      if (s !== null && (best === null || s > best)) best = s
    }
    if (best !== null) scored.push({ c, s: best, i })
  })
  return scored
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c)
}
