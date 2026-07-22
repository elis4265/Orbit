// Last-visited project memory (localStorage). Written by AppShell whenever a
// /projects/… URL is visited; read wherever a project must be picked without
// one in the URL (post-login landing at '/', global pages' nav context).
// Survives logout by design — it's a per-browser convenience, not auth state.
import type { Project } from '../types'

export const LAST_PROJECT_KEY = 'orbit.lastProjectSeg'

/** Resolve a stored segment (key or id) against the user's project list. */
export function resolveLastProject(
  projects: Project[],
  stored: string | null
): Project | undefined {
  if (!stored) return undefined
  return projects.find(
    (p) => p.id === stored || p.key?.toLowerCase() === stored.toLowerCase()
  )
}

/** Where to land with no project in the URL: last visited if it still exists, else the first. */
export function landingProject(
  projects: Project[],
  stored: string | null
): Project | undefined {
  return resolveLastProject(projects, stored) ?? projects[0]
}

export function readLastProjectSeg(): string | null {
  return localStorage.getItem(LAST_PROJECT_KEY)
}

export function rememberProjectSeg(seg: string): void {
  localStorage.setItem(LAST_PROJECT_KEY, seg)
}
