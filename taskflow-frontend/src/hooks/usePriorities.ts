import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { priorityApi } from '../api/client'

export function useProjectPriorities(projectId: string | undefined) {
  return useQuery({
    queryKey: ['priorities', projectId],
    queryFn: () => priorityApi.listItems(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

export function useGlobalPrioritySchemes() {
  return useQuery({
    queryKey: ['priority-schemes'],
    queryFn: () => priorityApi.listGlobalSchemes(),
    staleTime: 5 * 60_000,
  })
}

export function useCreatePriorityItem(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color: string }) =>
      priorityApi.createItem(projectId, name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priorities', projectId] }),
  })
}

export function useUpdatePriorityItem(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, name, color }: { itemId: string; name?: string; color?: string }) =>
      priorityApi.updateItem(projectId, itemId, { name, color }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priorities', projectId] }),
  })
}

export function useDeletePriorityItem(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (itemId: string) => priorityApi.deleteItem(projectId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priorities', projectId] }),
  })
}

export function useReorderPriorityItems(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => priorityApi.reorderItems(projectId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['priorities', projectId] }),
  })
}

export function useAssignPriorityScheme(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (schemeId: string) => priorityApi.assignScheme(projectId, schemeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['priorities', projectId] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
