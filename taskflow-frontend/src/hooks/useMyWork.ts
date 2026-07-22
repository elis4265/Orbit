import { useQuery } from '@tanstack/react-query'
import { userApi } from '../api/client'
import type { MyWorkFacet } from '../types'

// REQ-142: the caller's tasks across all accessible projects, by facet.
export function useMyWork(facet: MyWorkFacet) {
  return useQuery({
    queryKey: ['my-work', facet],
    queryFn: () => userApi.myTasks(facet),
    staleTime: 30_000,
  })
}
