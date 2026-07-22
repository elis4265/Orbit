import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { statsApi, projectStatusApi, taskApi } from '../api/client'
import type { EstimationMethod } from '../types'

export function useTaskPrediction(projectId: string, taskId: string, enabled = true) {
  return useQuery({
    queryKey: ['task-prediction', projectId, taskId],
    queryFn: () => taskApi.getPrediction(projectId, taskId),
    enabled: !!projectId && !!taskId && enabled,
    staleTime: 60_000,
  })
}

export function useUpdateEstimationMethod(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (method: EstimationMethod) => projectStatusApi.updateEstimationMethod(projectId, method),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useVelocity(projectId: string, window?: number, enabled = true) {
  return useQuery({
    queryKey: ['velocity', projectId, window ?? 3],
    queryFn: () => statsApi.getVelocity(projectId, window),
    enabled: !!projectId && enabled,
    staleTime: 60_000,
  })
}

export function useSprintReport(projectId: string, sprintId: string | null) {
  return useQuery({
    queryKey: ['sprint-report', projectId, sprintId],
    queryFn: () => statsApi.getSprintReport(projectId, sprintId!),
    enabled: !!projectId && !!sprintId,
    staleTime: 60_000,
  })
}

export function useForecast(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['forecast', projectId],
    queryFn: () => statsApi.getForecast(projectId),
    enabled: !!projectId && enabled,
    staleTime: 60_000,
  })
}
