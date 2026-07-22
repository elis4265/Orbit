import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { vcsApi } from '../api/client'
import type { VcsConnectionCreate } from '../types'

export function useProviders(enabled = true) {
  return useQuery({
    queryKey: ['vcs-providers'],
    queryFn: () => vcsApi.providers(),
    enabled,
    staleTime: 300_000,
  })
}

export function useVcsConnections(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['vcs-connections', projectId],
    queryFn: () => vcsApi.listConnections(projectId),
    enabled: enabled && !!projectId,
  })
}

export function useCreateVcsConnection(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: VcsConnectionCreate) => vcsApi.createConnection(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vcs-connections', projectId] }),
  })
}

export function useUpdateVcsConnection(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Record<string, string | null> }) =>
      vcsApi.updateConnection(projectId, id, settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vcs-connections', projectId] }),
  })
}

export function useDeleteVcsConnection(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => vcsApi.deleteConnection(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vcs-connections', projectId] }),
  })
}

export function useDevLinks(projectId: string, taskId: string, enabled = true) {
  return useQuery({
    queryKey: ['dev-links', projectId, taskId],
    queryFn: () => vcsApi.devLinks(projectId, taskId),
    enabled: enabled && !!projectId && !!taskId,
  })
}
