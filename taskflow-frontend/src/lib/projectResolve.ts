import type { Project } from '../types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value)
}

/**
 * Resolve a `/projects/:workspaceId` URL segment — a project KEY (pretty URLs)
 * or a raw UUID (legacy / post-auth redirects) — to the canonical project id.
 *
 * Returns '' while the segment cannot be resolved yet (projects still loading)
 * or resolves to nothing (unknown key). A key must NEVER be returned as the id:
 * every project-scoped endpoint takes a UUID path param, so an unresolved key
 * leaking into queries produces a wave of 422s and doomed WebSocket dials.
 */
export function resolveProjectId(param: string | undefined, projects: Project[]): string {
  if (!param) return ''
  const match = projects.find(
    (p) => p.id === param || p.key?.toLowerCase() === param.toLowerCase()
  )
  if (match) return match.id
  return isUuid(param) ? param : ''
}
