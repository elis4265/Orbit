import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customFieldApi } from '../api/client'
import type { CustomField, CustomFieldCreate } from '../types'

export function useCustomFields(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: () => customFieldApi.list(projectId),
    enabled: !!projectId && enabled,
    staleTime: 60_000,
  })
}

export function useCreateCustomField(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CustomFieldCreate) => customFieldApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', projectId] }),
  })
}

export function useUpdateCustomField(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fieldId, data }: { fieldId: string; data: Partial<CustomField> }) =>
      customFieldApi.update(projectId, fieldId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', projectId] }),
  })
}

export function useDeleteCustomField(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fieldId: string) => customFieldApi.delete(projectId, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields', projectId] }),
  })
}
