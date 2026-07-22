import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { releaseApi } from '../api/client'
import type { ReleaseCreate, ReleaseUpdate } from '../types'

export function useReleases(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => releaseApi.list(projectId),
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  })
}

export function useCreateRelease(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ReleaseCreate) => releaseApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  })
}

export function useUpdateRelease(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, data }: { releaseId: string; data: ReleaseUpdate }) =>
      releaseApi.update(projectId, releaseId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  })
}

export function useShipRelease(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ releaseId, body }: { releaseId: string; body?: { unfinished_action: 'keep' | 'backlog' | 'move'; target_release_id?: string | null } }) =>
      releaseApi.ship(projectId, releaseId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['releases', projectId] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    },
  })
}

export function useDeleteRelease(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (releaseId: string) => releaseApi.delete(projectId, releaseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  })
}
