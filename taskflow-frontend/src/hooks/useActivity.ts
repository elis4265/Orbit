import { useQuery } from '@tanstack/react-query'
import { activityApi, ProjectActivityFilters } from '../api/client'

export function useTaskActivity(
  projectId: string,
  taskId: string,
  actions?: string[],
) {
  return useQuery({
    queryKey: ['activity', projectId, taskId, actions],
    queryFn: () => activityApi.list(projectId, taskId, 100, actions),
    enabled: !!projectId && !!taskId,
    staleTime: 30_000,
  })
}

export function useProjectActivity(
  projectId: string,
  filters: ProjectActivityFilters = {},
  limit = 50,
  offset = 0,
) {
  return useQuery({
    queryKey: ['workspace-activity', projectId, filters, limit, offset],
    queryFn: () => activityApi.listWorkspace(projectId, filters, limit, offset),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}
