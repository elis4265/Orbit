import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emoteApi } from '../api/client'

export function useEmotes(projectId: string) {
  return useQuery({
    queryKey: ['emotes', projectId],
    queryFn: () => emoteApi.list(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

export function useCreateEmote(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) =>
      emoteApi.create(projectId, name, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emotes', projectId] }),
  })
}

export function useDeleteEmote(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (emoteId: string) => emoteApi.delete(projectId, emoteId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emotes', projectId] })
      // Reactions using the emote were cascade-deleted server-side.
      qc.invalidateQueries({ queryKey: ['comments'] })
    },
  })
}
