import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { worklogApi } from '../api/client'

// REQ-147 — work logs per task
export function useWorklogs(projectId: string, taskId: string) {
  return useQuery({
    queryKey: ['worklogs', projectId, taskId],
    queryFn: () => worklogApi.list(projectId, taskId),
    enabled: !!projectId && !!taskId,
  })
}

export function useLogWork(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ minutes, note }: { minutes: number; note?: string }) =>
      worklogApi.create(projectId, taskId, minutes, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worklogs', projectId, taskId] }),
  })
}

export function useDeleteWorklog(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (worklogId: string) => worklogApi.delete(projectId, taskId, worklogId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worklogs', projectId, taskId] }),
  })
}
