import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { recurringApi } from '../api/client'
import type { RecurrenceCadence, RecurringTask } from '../types'

// REQ-148 — recurring tasks
export function useRecurringTasks(projectId: string) {
  return useQuery({
    queryKey: ['recurring-tasks', projectId],
    queryFn: () => recurringApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useCreateRecurringTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { template_id: string; cadence: RecurrenceCadence; weekday?: number; day_of_month?: number }) =>
      recurringApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-tasks', projectId] }),
  })
}

export function useUpdateRecurringTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<RecurringTask, 'cadence' | 'weekday' | 'day_of_month' | 'enabled'>> }) =>
      recurringApi.update(projectId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-tasks', projectId] }),
  })
}

export function useDeleteRecurringTask(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => recurringApi.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring-tasks', projectId] }),
  })
}
