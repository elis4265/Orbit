import { useRef, useState } from 'react'
import { Paperclip, Trash2, Download } from 'lucide-react'
import { useAttachments, useUploadAttachment, useDeleteAttachment, useDownloadAttachment } from '../hooks/useAttachments'
import { PreviewModal, isText, type Preview } from './PreviewModal'

interface Props {
  projectId: string
  taskId: string
}

function getUploadError(error: unknown): string {
  return (error as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message ?? 'Upload failed.'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AttachmentSection({ projectId, taskId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { data: attachments = [] } = useAttachments(projectId, taskId)
  const upload = useUploadAttachment(projectId, taskId)
  const remove = useDeleteAttachment(projectId, taskId)
  const download = useDownloadAttachment(projectId, taskId)
  const [preview, setPreview] = useState<Preview | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await upload.mutateAsync(file)
  }

  async function handleDownload(attachmentId: string, filename: string) {
    const blob = await download(attachmentId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handlePreview(attachmentId: string, filename: string, contentType: string) {
    const blob = await download(attachmentId)
    const url = URL.createObjectURL(blob)
    const textContent = isText(contentType) ? await blob.text() : undefined
    setPreview({ url, filename, contentType, textContent })
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  return (
    <div className="pt-2">
      {preview && <PreviewModal preview={preview} onClose={closePreview} />}

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">Attachments</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
          className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Paperclip size={12} />
          {upload.isPending ? 'Uploading…' : 'Add file'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {upload.isError && (
        <p className="text-xs text-red-400 mb-2">{getUploadError(upload.error)}</p>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 group bg-gray-800 rounded-lg px-3 py-2">
              <Paperclip size={12} className="text-gray-500 flex-shrink-0" />
              <button
                type="button"
                onClick={() => handlePreview(a.id, a.filename, a.content_type)}
                className="flex-1 text-sm text-gray-200 truncate text-left hover:text-brand transition-colors"
              >
                {a.filename}
              </button>
              <span className="text-xs text-gray-500 flex-shrink-0">{formatBytes(a.size_bytes)}</span>
              <button
                type="button"
                onClick={() => handleDownload(a.id, a.filename)}
                className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-brand transition-all"
                aria-label={`Download ${a.filename}`}
              >
                <Download size={13} />
              </button>
              <button
                type="button"
                onClick={() => remove.mutate(a.id)}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                aria-label={`Delete ${a.filename}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
