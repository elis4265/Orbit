import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { boardApi } from '../api/client'
import type { BoardFilterConfig } from '../types'

export function useBoards(workspaceId: string) {
  return useQuery({
    queryKey: ['boards', workspaceId],
    queryFn: () => boardApi.list(workspaceId),
    enabled: !!workspaceId && !!localStorage.getItem('access_token'),
  })
}

export function useCreateBoard(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => boardApi.create(workspaceId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards', workspaceId] }),
  })
}

export function useRenameBoard(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => boardApi.rename(workspaceId, id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards', workspaceId] }),
  })
}

export function useUpdateBoardFilter(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ boardId, filterConfig }: { boardId: string; filterConfig: BoardFilterConfig | null }) =>
      boardApi.updateFilter(workspaceId, boardId, filterConfig),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards', workspaceId] }),
  })
}

export function useDeleteBoard(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => boardApi.delete(workspaceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boards', workspaceId] }),
  })
}
