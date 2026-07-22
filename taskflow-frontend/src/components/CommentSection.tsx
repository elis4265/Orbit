import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2, Paperclip, Clock, X } from 'lucide-react'
import {
  useComments,
  useCreateComment,
  useEditComment,
  useDeleteComment,
  useCommentHistory,
  useCommentAttachments,
  useUploadCommentAttachment,
  useDeleteCommentAttachment,
} from '../hooks/useComments'
import { commentApi } from '../api/client'
import { PreviewModal, isText, type Preview } from './PreviewModal'
import LocalRichTextEditor from './LocalRichTextEditor'
import type { Comment, CommentHistoryEntry, Attachment } from '../types'
import RichContent from './RichContent'
import CommentReactions from './CommentReactions'

interface Props {
  projectId: string
  taskId: string
  currentUserId: string
  isAdmin?: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── history modal ────────────────────────────────────────────────────────────

function HistoryModal({
  projectId, taskId, commentId, onClose,
}: {
  projectId: string
  taskId: string
  commentId: string
  onClose: () => void
}) {
  const { data: history = [], isLoading } = useCommentHistory(projectId, taskId, commentId)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <span className="text-sm font-medium text-gray-200">Edit history</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && history.length === 0 && (
            <p className="text-sm text-gray-500">No edit history.</p>
          )}
          {history.map((entry: CommentHistoryEntry) => (
            <div key={entry.id} className="border border-gray-800 rounded-lg p-3 space-y-1">
              <p className="text-xs text-gray-500">{formatTime(entry.edited_at)}</p>
              <RichContent html={entry.content} className="prose prose-invert prose-sm max-w-none text-gray-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── comment attachments ──────────────────────────────────────────────────────

function CommentAttachments({
  projectId, taskId, commentId, canDelete,
}: {
  projectId: string
  taskId: string
  commentId: string
  canDelete: boolean
}) {
  const { data: attachments = [] } = useCommentAttachments(projectId, taskId, commentId)
  const remove = useDeleteCommentAttachment(projectId, taskId, commentId)
  const [preview, setPreview] = useState<Preview | null>(null)

  async function fetchBlob(att: Attachment): Promise<Blob> {
    return commentApi.downloadAttachment(projectId, taskId, commentId, att.id)
  }

  async function handlePreview(att: Attachment) {
    const blob = await fetchBlob(att)
    const url = URL.createObjectURL(blob)
    const textContent = isText(att.content_type) ? await blob.text() : undefined
    setPreview({ url, filename: att.filename, contentType: att.content_type, textContent })
  }

  async function handleDownload(att: Attachment) {
    const blob = await fetchBlob(att)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  if (attachments.length === 0) return null

  return (
    <div className="mt-2">
      {preview && <PreviewModal preview={preview} onClose={closePreview} />}
      <div className="flex flex-wrap gap-2">
        {attachments.map((att) => (
          <div key={att.id} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1 text-xs text-gray-300 group">
            <button
              onClick={() => handlePreview(att)}
              className="hover:text-white truncate max-w-[120px]"
              title="Click to preview"
            >
              {att.filename}
            </button>
            <span className="text-gray-600">{formatBytes(att.size_bytes)}</span>
            <button
              onClick={() => handleDownload(att)}
              className="text-gray-600 hover:text-brand opacity-0 group-hover:opacity-100 transition-opacity"
              title="Download"
            >
              <Paperclip size={10} />
            </button>
            {canDelete && (
              <button
                onClick={() => remove.mutate(att.id)}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── single comment ───────────────────────────────────────────────────────────

function CommentItem({
  comment,
  projectId,
  taskId,
  currentUserId,
  isAdmin,
}: {
  comment: Comment
  projectId: string
  taskId: string
  currentUserId: string
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const editComment = useEditComment(projectId, taskId)
  const deleteComment = useDeleteComment(projectId, taskId)
  const uploadAttachment = useUploadCommentAttachment(projectId, taskId, comment.id)

  const isAuthor = comment.author_id === currentUserId
  const canEdit = isAuthor
  const canDelete = isAuthor || isAdmin

  async function handleSave(html: string) {
    await editComment.mutateAsync({ commentId: comment.id, content: html })
    setEditing(false)
  }

  return (
    <div className="group">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full bg-brand/30 flex items-center justify-center text-xs text-brand flex-shrink-0 mt-0.5">
          {comment.author_id ? comment.author_id.slice(0, 2).toUpperCase() : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">{formatTime(comment.created_at)}</span>
            {comment.edited_at && (
              <button
                onClick={() => setShowHistory(true)}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                title="View edit history"
              >
                <Clock size={10} />
                edited
              </button>
            )}
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-gray-600 hover:text-gray-300 transition-colors"
                  aria-label="Edit comment"
                >
                  <Pencil size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => deleteComment.mutate(comment.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  aria-label="Delete comment"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <LocalRichTextEditor
              workspaceId={projectId}
              initialContent={comment.content}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
              onAttach={(file) => uploadAttachment.mutate(file)}
              saveLabel="Save"
              minHeight="60px"
            />
          ) : (
            <RichContent html={comment.content} className="prose prose-invert prose-sm max-w-none text-gray-300" />
          )}

          <CommentAttachments
            projectId={projectId}
            taskId={taskId}
            commentId={comment.id}
            canDelete={isAuthor}
          />

          <CommentReactions projectId={projectId} taskId={taskId} comment={comment} />
        </div>
      </div>

      {showHistory && (
        <HistoryModal
          projectId={projectId}
          taskId={taskId}
          commentId={comment.id}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}

// ─── composer ─────────────────────────────────────────────────────────────────

function CommentComposer({
  projectId, taskId,
}: {
  projectId: string
  taskId: string
}) {
  const [key, setKey] = useState(0)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const create = useCreateComment(projectId, taskId)
  const qc = useQueryClient()

  async function handlePost(html: string) {
    const comment = await create.mutateAsync(html)
    const files = [...pendingFiles]
    setPendingFiles([])
    if (files.length > 0) {
      await Promise.all(
        files.map((f) =>
          commentApi.uploadAttachment(projectId, taskId, comment.id, f).catch(() => {})
        )
      )
      qc.invalidateQueries({ queryKey: ['comment-attachments', projectId, taskId, comment.id] })
    }
    setKey((k) => k + 1)
  }

  return (
    <div>
      <LocalRichTextEditor
        key={key}
        workspaceId={projectId}
        placeholder="Add a comment… (Ctrl+Enter to post)"
        onSave={handlePost}
        onAttach={(file) => setPendingFiles((prev) => [...prev, file])}
        canPostEmpty={pendingFiles.length > 0}
        saveLabel={create.isPending ? 'Posting…' : 'Post'}
        minHeight="60px"
        autoFocus={false}
      />
      {pendingFiles.length > 0 && (
        <ul className="mt-2 space-y-1">
          {pendingFiles.map((f, i) => (
            <li key={i} className="flex items-center gap-2 group bg-gray-800 rounded-lg px-3 py-1.5">
              <Paperclip size={11} className="text-gray-500 flex-shrink-0" />
              <span className="flex-1 text-xs text-gray-300 truncate">{f.name}</span>
              <span className="text-[10px] text-gray-500 flex-shrink-0">
                {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
              <button
                type="button"
                onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                aria-label={`Remove ${f.name}`}
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── main export ──────────────────────────────────────────────────────────────

export default function CommentSection({ projectId, taskId, currentUserId, isAdmin = false }: Props) {
  const { data: comments = [], isLoading } = useComments(projectId, taskId)

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 font-medium">
        Comments {comments.length > 0 && <span className="text-gray-600">({comments.length})</span>}
      </p>

      {isLoading && <p className="text-sm text-gray-600">Loading comments…</p>}

      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          projectId={projectId}
          taskId={taskId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
        />
      ))}

      <CommentComposer projectId={projectId} taskId={taskId} />
    </div>
  )
}
