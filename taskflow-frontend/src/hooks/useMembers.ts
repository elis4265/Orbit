import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { memberApi } from '../api/client'
import type { MemberRole } from '../types'

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => memberApi.list(workspaceId),
    enabled: !!workspaceId,
  })
}

export function useInviteMember(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (email: string) => memberApi.invite(workspaceId, email),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', workspaceId] }),
  })
}

export function usePromoteMember(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      memberApi.promote(workspaceId, userId, role),
    onMutate: async ({ userId, role }) => {
      await qc.cancelQueries({ queryKey: ['members', workspaceId] })
      const prev = qc.getQueryData(['members', workspaceId])
      qc.setQueryData(['members', workspaceId], (old: { id: string; role: MemberRole }[] | undefined) =>
        old?.map((m) => (m.id === userId ? { ...m, role } : m))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['members', workspaceId], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['members', workspaceId] }),
  })
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => memberApi.remove(workspaceId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', workspaceId] }),
  })
}

export function useAcceptInvite() {
  return useMutation({
    mutationFn: (token: string) => memberApi.acceptInvite(token),
  })
}

export function useGetInviteMetadata() {
  return (token: string) => memberApi.getInviteMetadata(token)
}
