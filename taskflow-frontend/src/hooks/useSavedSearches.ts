import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { savedSearchApi } from '../api/client'
import type { SavedSearchCreate, SavedSearchUpdate } from '../types'

const key = (projectId: string) => ['saved-searches', projectId]

export function useSavedSearches(projectId: string) {
  return useQuery({
    queryKey: key(projectId),
    queryFn: () => savedSearchApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useCreateSavedSearch(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SavedSearchCreate) => savedSearchApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  })
}

export function useUpdateSavedSearch(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ searchId, data }: { searchId: string; data: SavedSearchUpdate }) =>
      savedSearchApi.update(projectId, searchId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  })
}

export function useDeleteSavedSearch(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (searchId: string) => savedSearchApi.delete(projectId, searchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(projectId) }),
  })
}
