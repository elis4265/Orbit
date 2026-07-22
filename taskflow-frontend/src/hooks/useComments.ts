import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { commentApi } from '../api/client'

function _key(projectId: string, taskId: string) {
  return ['comments', projectId, taskId]
}

export function useComments(projectId: string, taskId: string) {
  return useQuery({
    queryKey: _key(projectId, taskId),
    queryFn: () => commentApi.list(projectId, taskId),
    enabled: !!taskId,
  })
}

export function useCreateComment(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (content: string) => commentApi.create(projectId, taskId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: _key(projectId, taskId) }),
  })
}

export function useEditComment(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      commentApi.edit(projectId, taskId, commentId, content),
    onSuccess: (_, { commentId }) => {
      qc.invalidateQueries({ queryKey: _key(projectId, taskId) })
      qc.invalidateQueries({ queryKey: ['comment-history', projectId, taskId, commentId] })
    },
  })
}

export function useDeleteComment(projectId: string, taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => commentApi.delete(projectId, taskId, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: _key(projectId, taskId) }),
  })
}

export function useCommentHistory(projectId: string, taskId: string, commentId: string | null) {
  return useQuery({
    queryKey: ['comment-history', projectId, taskId, commentId],
    queryFn: () => commentApi.history(projectId, taskId, commentId!),
    enabled: !!commentId,
  })
}

export function useCommentAttachments(projectId: string, taskId: string, commentId: string) {
  return useQuery({
    queryKey: ['comment-attachments', projectId, taskId, commentId],
    queryFn: () => commentApi.listAttachments(projectId, taskId, commentId),
    enabled: !!commentId,
  })
}

export function useUploadCommentAttachment(projectId: string, taskId: string, commentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => commentApi.uploadAttachment(projectId, taskId, commentId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comment-attachments', projectId, taskId, commentId] }),
  })
}

export function useDeleteCommentAttachment(projectId: string, taskId: string, commentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) => commentApi.deleteAttachment(projectId, taskId, commentId, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comment-attachments', projectId, taskId, commentId] }),
  })
}
