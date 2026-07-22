import { useQuery } from '@tanstack/react-query'
import { relatedApi } from '../api/client'
import type { IdentitySets } from '../lib/taskFilter'

// REQ-152: id sets backing the @related identity filters.
export function useRelatedToMe(projectId: string): IdentitySets | undefined {
  const { data } = useQuery({
    queryKey: ['related-to-me', projectId],
    queryFn: () => relatedApi.get(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  })
  if (!data) return undefined
  return { commented: new Set(data.commented), mentioned: new Set(data.mentioned) }
}
