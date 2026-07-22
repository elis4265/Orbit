import { useQuery } from '@tanstack/react-query'
import { projectTaskSearchApi, globalSearchApi } from '../api/client'

export function useSearch(projectId: string, q: string, limit = 10) {
  return useQuery({
    queryKey: ['search', projectId, q, limit],
    queryFn: () => projectTaskSearchApi.search(projectId, q, limit),
    enabled: !!projectId && q.length >= 2,
    staleTime: 10_000,
    placeholderData: [],
  })
}

/** Cross-project search across every project the user can access. */
export function useGlobalSearch(q: string, limit = 10) {
  return useQuery({
    queryKey: ['global-search', q, limit],
    queryFn: () => globalSearchApi.search(q, limit),
    enabled: q.length >= 2,
    staleTime: 10_000,
    placeholderData: [],
  })
}
