import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projectApi } from '../api/client'
import type { DefaultAssigneeMode, ProjectMode } from '../types'

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: projectApi.list,
    enabled: !!localStorage.getItem('access_token'),
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, mode }: { name: string; mode?: ProjectMode }) =>
      projectApi.create(name, mode ?? 'open'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useRenameProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => projectApi.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useUpdateHideDoneAfterDays() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: number | null }) =>
      projectApi.updateHideDoneAfterDays(id, days),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['tasks', id] })
    },
  })
}

// REQ-161: days after completion before auto-archive (null = manual only)
export function useUpdateAutoArchiveAfterDays() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, days }: { id: string; days: number | null }) =>
      projectApi.updateAutoArchiveAfterDays(id, days),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['tasks', id] })
    },
  })
}

// HW-18: default assignee for newly created tasks
export function useUpdateDefaultAssignee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode, assigneeId }: {
      id: string
      mode: DefaultAssigneeMode
      assigneeId: string | null
    }) => projectApi.updateDefaultAssignee(id, mode, assigneeId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
