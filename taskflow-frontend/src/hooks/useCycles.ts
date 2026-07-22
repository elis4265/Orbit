import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cycleApi } from '../api/client'
import type { CycleConfigUpdate } from '../types'

export function useCycleConfig(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['cycle-config', projectId],
    queryFn: () => cycleApi.getConfig(projectId),
    enabled: !!projectId && enabled,
  })
}

export function useUpdateCycleConfig(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CycleConfigUpdate) => cycleApi.putConfig(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycle-config', projectId] })
      qc.invalidateQueries({ queryKey: ['cycles', projectId] })
    },
  })
}

export function useCycles(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['cycles', projectId],
    queryFn: () => cycleApi.list(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}
