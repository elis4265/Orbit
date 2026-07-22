import { useQuery } from '@tanstack/react-query'
import { statsApi } from '../api/client'

export function useProjectStats(
  workspaceId: string,
  params?: { board_id?: string; date_from?: string; date_to?: string },
) {
  return useQuery({
    queryKey: ['stats', workspaceId, params],
    queryFn: () => statsApi.getStats(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

export function useProjectBurndown(
  workspaceId: string,
  params?: { board_id?: string; start?: string; end?: string; unit?: string },
) {
  return useQuery({
    queryKey: ['stats-burndown', workspaceId, params],
    queryFn: () => statsApi.getBurndown(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

export function useProjectCFD(
  workspaceId: string,
  params?: { board_id?: string; date_from?: string; date_to?: string },
) {
  return useQuery({
    queryKey: ['stats-cfd', workspaceId, params],
    queryFn: () => statsApi.getCFD(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

export function useTimeInStatus(
  workspaceId: string,
  params?: { board_id?: string },
) {
  return useQuery({
    queryKey: ['stats-time-in-status', workspaceId, params],
    queryFn: () => statsApi.getTimeInStatus(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}

export function useCycleTime(
  workspaceId: string,
  params?: { board_id?: string; date_from?: string; date_to?: string },
) {
  return useQuery({
    queryKey: ['stats-cycle-time', workspaceId, params],
    queryFn: () => statsApi.getCycleTime(workspaceId, params),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}
