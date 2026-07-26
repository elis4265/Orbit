import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskApi, projectTaskApi } from '../api/client'
import type { Task, TaskCreate, TaskUpdate, TaskStatus } from '../types'

const key = (projectId: string, boardId: string) => ['tasks', projectId, boardId]

export function useTask(projectId: string, taskId: string, enabled = true) {
  return useQuery({
    queryKey: ['task', projectId, taskId],
    queryFn: () => taskApi.getById(projectId, taskId),
    enabled: !!projectId && !!taskId && enabled,
    staleTime: 30_000,
  })
}

export function useTasks(projectId: string, boardId: string, includeOldDone = false) {
  return useQuery({
    queryKey: [...key(projectId, boardId), includeOldDone ? 'all-done' : 'default'],
    queryFn: () => taskApi.list(projectId, boardId, undefined, includeOldDone),
    enabled: !!projectId && !!boardId,
  })
}

// sprintId='none' → backlog; sprintId=<uuid> → sprint tasks; undefined → all
export function useProjectTasks(projectId: string, sprintId?: string) {
  return useQuery({
    queryKey: ['project-tasks', projectId, sprintId ?? '__all__'],
    queryFn: () => projectTaskApi.list(projectId, sprintId),
    enabled: !!projectId,
    staleTime: 30_000,
  })
}

export function useCreateTask(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskCreate) => taskApi.create(projectId, boardId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key(projectId, boardId) }); qc.invalidateQueries({ queryKey: ['project-tasks', projectId] }) },
  })
}

export function useUpdateTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: TaskUpdate }) =>
      taskApi.update(projectId, taskId, data),
    onSuccess: (updated: Task) => {
      // Patch caches before invalidating — else the board re-syncs from stale data and the card flashes back.
      const patch = (old: Task[] | undefined) =>
        old?.map((t) => (t.id === updated.id ? updated : t))
      qc.setQueriesData({ queryKey: ['tasks', projectId] }, patch)
      qc.setQueriesData({ queryKey: ['project-tasks', projectId] }, patch)
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    },
  })
}

export function useDeleteTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => taskApi.delete(projectId, taskId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['project-tasks', projectId] }) },
  })
}

export function useAIBreakdown(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (taskId: string) => taskApi.aiBreakdown(projectId, taskId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['project-tasks', projectId] }) },
  })
}

export function useReorderTasks(projectId: string, boardId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tasks: { id: string; position: number }[]) =>
      taskApi.reorder(projectId, boardId, tasks),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key(projectId, boardId) }); qc.invalidateQueries({ queryKey: ['project-tasks', projectId] }) },
  })
}

// REQ-157: routes through the validated bulk endpoint (per-row report; the old
// silent repo-level endpoint was removed).
export function useBulkUpdateTasks(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    // HW-21: custom_status_id lets the mobile "Move to" sheet target custom statuses;
    // the bulk endpoint already resolves it to the fixed enum server-side.
    mutationFn: ({ task_ids, ...changes }: { task_ids: string[]; status?: TaskStatus; custom_status_id?: string }) =>
      taskApi.bulkEdit(projectId, task_ids, changes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); qc.invalidateQueries({ queryKey: ['project-tasks', projectId] }) },
  })
}
