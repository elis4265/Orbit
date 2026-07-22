import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tagApi } from '../api/client'
import type { TagVisibility } from '../types'

export function useTags(projectId: string) {
  return useQuery({
    queryKey: ['tags', projectId],
    queryFn: () => tagApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useCreateTag(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, color, visibility }: { name: string; color?: string; visibility?: TagVisibility }) =>
      tagApi.create(projectId, name, color, visibility),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', projectId] }),
  })
}

export function useUpdateTag(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tagId, data }: { tagId: string; data: { name?: string; color?: string; visibility?: TagVisibility } }) =>
      tagApi.update(projectId, tagId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', projectId] }),
  })
}

export function useDeleteTag(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => tagApi.delete(projectId, tagId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', projectId] }),
  })
}

export function useTaskTags(projectId: string, taskId: string) {
  return useQuery({
    queryKey: ['task-tags', projectId, taskId],
    queryFn: () => tagApi.listTaskTags(projectId, taskId),
    enabled: !!projectId && !!taskId,
  })
}

export function useApplyTag(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => tagApi.applyToTask(projectId, taskId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-tags', projectId, taskId] })
      qc.invalidateQueries({ queryKey: ['activity', projectId, taskId] })
    },
  })
}

export function useRemoveTag(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tagId: string) => tagApi.removeFromTask(projectId, taskId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-tags', projectId, taskId] })
      qc.invalidateQueries({ queryKey: ['activity', projectId, taskId] })
    },
  })
}
