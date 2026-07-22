import { useEffect } from 'react'
import { Paperclip, X } from 'lucide-react'

export interface Preview {
  url: string
  filename: string
  contentType: string
  textContent?: string
}

export function isImage(ct: string) { return ct.startsWith('image/') }
export function isPdf(ct: string) { return ct === 'application/pdf' }
export function isVideo(ct: string) { return ct.startsWith('video/') }
export function isText(ct: string) {
  return ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/xml' ||
    ct === 'application/javascript' ||
    ct === 'application/x-yaml' ||
    ct === 'application/yaml'
}

export function PreviewModal({ preview, onClose }: { preview: Preview; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl w-full max-h-[90vh] bg-gray-900 rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="text-sm text-gray-200 truncate">{preview.filename}</span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors ml-3 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-auto max-h-[80vh] flex items-center justify-center bg-gray-950 p-4">
          {isImage(preview.contentType) && (
            <img src={preview.url} alt={preview.filename} className="max-w-full max-h-[75vh] object-contain rounded" />
          )}
          {isPdf(preview.contentType) && (
            <iframe src={preview.url} title={preview.filename} className="w-full h-[75vh] rounded" />
          )}
          {isVideo(preview.contentType) && (
            <video src={preview.url} controls className="max-w-full max-h-[75vh] rounded" />
          )}
          {isText(preview.contentType) && (
            <pre className="w-full max-h-[75vh] overflow-auto text-xs text-gray-300 whitespace-pre-wrap break-words font-mono p-2">
              {preview.textContent ?? ''}
            </pre>
          )}
          {!isImage(preview.contentType) && !isPdf(preview.contentType) && !isVideo(preview.contentType) && !isText(preview.contentType) && (
            <div className="text-center py-12 space-y-3">
              <Paperclip size={32} className="text-gray-600 mx-auto" />
              <p className="text-sm text-gray-400">No preview available for this file type.</p>
              <a
                href={preview.url}
                download={preview.filename}
                className="text-xs text-brand hover:underline"
              >
                Download instead
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
