import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { attachmentApi } from '../api/client'

export function useAttachments(projectId: string, taskId: string) {
  return useQuery({
    queryKey: ['attachments', projectId, taskId],
    queryFn: () => attachmentApi.list(projectId, taskId),
    enabled: !!taskId,
  })
}

export function useUploadAttachment(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => attachmentApi.upload(projectId, taskId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', projectId, taskId] }),
  })
}

export function useDeleteAttachment(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => attachmentApi.delete(projectId, taskId, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', projectId, taskId] }),
  })
}

export function useDownloadAttachment(projectId: string, taskId: string) {
  return (attachmentId: string): Promise<Blob> =>
    attachmentApi.download(projectId, taskId, attachmentId)
}
