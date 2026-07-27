import { useParams } from 'react-router-dom'
import { useProjects } from './useProjects'
import { resolveProjectId } from '../lib/projectResolve'
import type { Project } from '../types'

/**
 * Resolve the `:workspaceId` route param — which now carries the project KEY
 * (pretty URLs) but still accepts a raw UUID (legacy / post-auth redirects).
 * Returns the canonical project id, the URL segment (key), and the project.
 */
export function useResolvedProject() {
  const { workspaceId: param } = useParams<{ workspaceId: string }>()
  const { data } = useProjects()
  const projects: Project[] = Array.isArray(data) ? data : []
  // '' until the key resolves (projects loading) — a key must never be used as
  // the id: it would hit UUID-typed endpoints and 422 (queries gate on '').
  const projectId = resolveProjectId(param, projects)
  const project = projects.find((p) => p.id === projectId)
  const seg = project?.key ?? param ?? ''
  return { projectId, seg, project, projects }
}
