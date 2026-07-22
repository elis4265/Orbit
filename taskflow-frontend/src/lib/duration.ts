// REQ-147 — pure duration helpers for work logs. "1h 30m" ⇄ minutes.

const DURATION_RE = /^\s*(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i

/** Parse "2h", "30m", "1h 30m", "1.5h" or a bare minute count → minutes, or null. */
export function parseDuration(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const minutes = parseInt(trimmed, 10)
    return minutes > 0 ? minutes : null
  }
  const match = DURATION_RE.exec(trimmed)
  if (!match || (match[1] === undefined && match[2] === undefined)) return null
  const minutes = Math.round((match[1] ? parseFloat(match[1]) * 60 : 0) + (match[2] ? parseInt(match[2], 10) : 0))
  return minutes > 0 ? minutes : null
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
