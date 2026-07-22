import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskLinkApi, projectTaskSearchApi } from '../api/client'
import type { TaskLinkCreate } from '../types'

export function useTaskLinks(projectId: string, taskId: string) {
  return useQuery({
    queryKey: ['task-links', projectId, taskId],
    queryFn: () => taskLinkApi.list(projectId, taskId),
    enabled: !!projectId && !!taskId,
    staleTime: 30_000,
  })
}

export function useAddTaskLink(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskLinkCreate) => taskLinkApi.add(projectId, taskId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-links', projectId, taskId] }),
  })
}

export function useRemoveTaskLink(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (linkId: string) => taskLinkApi.remove(projectId, taskId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-links', projectId, taskId] }),
  })
}

export function useActiveBlockers(projectId: string, taskId: string) {
  const { data: links = [] } = useTaskLinks(projectId, taskId)
  return links.filter(l => l.display_type === 'Is blocked by' && l.linked_task.status !== 'done')
    .map(l => l.linked_task)
}

export function useTaskSearch(projectId: string, q: string) {
  return useQuery({
    queryKey: ['task-search', projectId, q],
    queryFn: () => projectTaskSearchApi.search(projectId, q),
    enabled: !!projectId && q.length >= 1,
    staleTime: 5_000,
  })
}
