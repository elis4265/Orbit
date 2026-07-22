import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskTemplateApi } from '../api/client'
import type { TaskTemplateCreate } from '../types'

export function useTaskTemplates(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['task-templates', projectId],
    queryFn: () => taskTemplateApi.list(projectId),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
  })
}

export function useCreateTaskTemplate(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskTemplateCreate) => taskTemplateApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-templates', projectId] }),
  })
}

export function useDeleteTaskTemplate(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string) => taskTemplateApi.delete(projectId, templateId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-templates', projectId] }),
  })
}
