import { useParams } from 'react-router-dom'
import { useProjects } from './useProjects'
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
  const project = projects.find(
    (p) => p.id === param || p.key?.toLowerCase() === param?.toLowerCase()
  )
  // Resolved id, or the raw param as a fallback (a UUID, or briefly a key while
  // projects load — it re-resolves to the id once they arrive).
  const projectId = project?.id ?? param ?? ''
  const seg = project?.key ?? param ?? ''
  return { projectId, seg, project, projects }
}
