import type { Project } from '../types'

/**
 * Client-side mirror of the server's admin gate (`get_admin_project`):
 * the owner is always admin (no members row needed), otherwise an
 * admin-role membership is required. Used to decide whether to RENDER
 * admin-only controls — the server remains the enforcement point.
 */
export function canManageProject(
  project: Project | undefined,
  userId: string | undefined,
  members: Array<{ id: string; role: string }>,
): boolean {
  if (!project || !userId) return false
  if (project.owner_id === userId) return true
  return members.some((m) => m.id === userId && m.role === 'admin')
}
