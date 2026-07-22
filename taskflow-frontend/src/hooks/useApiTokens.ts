import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tokenApi } from '../api/client'

// REQ-143 — personal API tokens
export function useApiTokens() {
  return useQuery({ queryKey: ['api-tokens'], queryFn: tokenApi.list })
}

export function useCreateApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ name, scope }: { name: string; scope: 'read' | 'write' }) => tokenApi.create(name, scope),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  })
}

export function useRevokeApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tokenApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  })
}
