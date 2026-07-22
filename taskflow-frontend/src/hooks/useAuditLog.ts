import { useQuery } from '@tanstack/react-query'
import { auditApi, type AuditLogFilters } from '../api/client'

export function useAuditLog(
  workspaceId: string,
  filters: AuditLogFilters = {},
  limit = 50,
  offset = 0,
) {
  return useQuery({
    queryKey: ['audit-log', workspaceId, filters, limit, offset],
    queryFn: () => auditApi.list(workspaceId, filters, limit, offset),
    enabled: !!workspaceId,
    staleTime: 30_000,
  })
}
