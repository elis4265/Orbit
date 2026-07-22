import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sprintApi } from '../api/client'
import type { SprintCreate, SprintUpdate, SprintCompleteRequest } from '../types'

export function useSprints(projectId: string, boardId: string, enabled = true) {
  return useQuery({
    queryKey: ['sprints', projectId, boardId],
    queryFn: () => sprintApi.list(projectId, boardId),
    enabled: enabled && !!projectId && !!boardId,
    staleTime: 30_000,
  })
}

export function useCreateSprint(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SprintCreate) => sprintApi.create(projectId, boardId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', projectId, boardId] }),
  })
}

export function useUpdateSprint(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sprintId, data }: { sprintId: string; data: SprintUpdate }) =>
      sprintApi.update(projectId, boardId, sprintId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', projectId, boardId] }),
  })
}

export function useActivateSprint(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sprintId: string) => sprintApi.activate(projectId, boardId, sprintId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', projectId, boardId] }),
  })
}

export function useCloseSprint(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sprintId: string) => sprintApi.close(projectId, boardId, sprintId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', projectId, boardId] }),
  })
}

export function useCompleteSprint(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sprintId, body }: { sprintId: string; body: SprintCompleteRequest }) =>
      sprintApi.complete(projectId, boardId, sprintId, body),
    onSuccess: () => {
      // Completing a sprint reassigns tasks' sprint_id, so refresh task lists too.
      qc.invalidateQueries({ queryKey: ['sprints', projectId, boardId] })
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    },
  })
}

export function useDeleteSprint(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sprintId: string) => sprintApi.delete(projectId, boardId, sprintId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints', projectId, boardId] }),
  })
}
