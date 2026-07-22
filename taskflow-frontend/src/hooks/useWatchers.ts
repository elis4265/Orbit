import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { watcherApi } from '../api/client'

export function useWatchStatus(projectId: string, taskId: string) {
  return useQuery({
    queryKey: ['watch-status', projectId, taskId],
    queryFn: () => watcherApi.status(projectId, taskId),
    staleTime: 30_000,
  })
}

export function useWatchTask(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => watcherApi.watch(projectId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watch-status', projectId, taskId] })
    },
  })
}

export function useUnwatchTask(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => watcherApi.unwatch(projectId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watch-status', projectId, taskId] })
    },
  })
}
