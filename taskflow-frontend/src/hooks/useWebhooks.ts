import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { webhookApi } from '../api/client'
import type { OutboundWebhook, WebhookEvent, WebhookFormat } from '../types'

// REQ-144 — outbound webhooks
export function useWebhooks(projectId: string) {
  return useQuery({
    queryKey: ['webhooks', projectId],
    queryFn: () => webhookApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useCreateWebhook(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ url, events, format }: { url: string; events: WebhookEvent[]; format: WebhookFormat }) =>
      webhookApi.create(projectId, url, events, format),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', projectId] }),
  })
}

export function useUpdateWebhook(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<OutboundWebhook, 'url' | 'events' | 'enabled' | 'format'>> }) =>
      webhookApi.update(projectId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', projectId] }),
  })
}

export function useDeleteWebhook(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => webhookApi.delete(projectId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks', projectId] }),
  })
}
