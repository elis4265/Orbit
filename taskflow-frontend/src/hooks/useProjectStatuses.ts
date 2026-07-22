import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectStatusApi } from '../api/client'
import type { CreationStatusPolicy, ProjectMode, ProjectStatusCreate, ProjectStatusUpdate } from '../types'

export function useProjectStatuses(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-statuses', projectId],
    queryFn: () => projectStatusApi.listStatuses(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

export function useCreateProjectStatus(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ProjectStatusCreate) => projectStatusApi.createStatus(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-statuses', projectId] }),
  })
}

export function useUpdateProjectStatus(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ statusId, data }: { statusId: string; data: ProjectStatusUpdate }) =>
      projectStatusApi.updateStatus(projectId, statusId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-statuses', projectId] }),
  })
}

export function useDeleteProjectStatus(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (statusId: string) => projectStatusApi.deleteStatus(projectId, statusId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-statuses', projectId] }),
  })
}

export function useReorderProjectStatuses(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => projectStatusApi.reorderStatuses(projectId, orderedIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-statuses', projectId] }),
  })
}

export function useProjectTransitions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-transitions', projectId],
    queryFn: () => projectStatusApi.listTransitions(projectId!),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

export function useCreateTransition(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fromId, toId, requireRole, issueType }: { fromId: string; toId: string; requireRole?: string; issueType?: string | null }) =>
      projectStatusApi.createTransition(projectId, fromId, toId, requireRole, issueType),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-transitions', projectId] }),
  })
}

export function useDeleteTransition(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => projectStatusApi.deleteTransition(projectId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-transitions', projectId] }),
  })
}

export function useUpdateCreationPolicy(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (policy: CreationStatusPolicy) =>
      projectStatusApi.updateCreationPolicy(projectId, policy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateProjectMode(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ mode, enforceBlockLinks }: { mode: ProjectMode; enforceBlockLinks?: boolean }) =>
      projectStatusApi.updateMode(projectId, mode, enforceBlockLinks),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['project-statuses', projectId] })
    },
  })
}
