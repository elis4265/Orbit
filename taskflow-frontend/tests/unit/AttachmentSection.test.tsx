import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AttachmentSection from '../../src/components/AttachmentSection'
import type { Attachment } from '../../src/types'

const mockUploadMutateAsync = vi.fn()
const mockDeleteMutate = vi.fn()
const mockDownloadAttachment = vi.fn()

vi.mock('../../src/hooks/useAttachments', () => ({
  useAttachments: () => ({ data: mockAttachments }),
  useUploadAttachment: () => ({
    mutateAsync: mockUploadMutateAsync,
    isPending: mockUploadPending,
    isError: mockUploadError,
    error: mockUploadErrorObj,
  }),
  useDeleteAttachment: () => ({ mutate: mockDeleteMutate }),
  useDownloadAttachment: () => mockDownloadAttachment,
}))

// Mutable state the mocks read at call-time
let mockAttachments: Attachment[] = []
let mockUploadPending = false
let mockUploadError = false
let mockUploadErrorObj: unknown = null

const att: Attachment = {
  id: 'att-1',
  task_id: 'task-1',
  filename: 'report.pdf',
  content_type: 'application/pdf',
  size_bytes: 2048,
  created_at: '',
}

const defaultProps = { workspaceId: 'ws-1', boardId: 'b-1', taskId: 'task-1' }

beforeEach(() => {
  mockAttachments = []
  mockUploadPending = false
  mockUploadError = false
  mockUploadErrorObj = null
  mockUploadMutateAsync.mockReset()
  mockDeleteMutate.mockReset()
  mockDownloadAttachment.mockReset()
})

// ── REQ-032: rendering ────────────────────────────────────────────────────────

describe('REQ-032 — Attachment rendering', () => {
  it('[REQ-032] renders "Attachments" section label', () => {
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('Attachments')).toBeInTheDocument()
  })

  it('[REQ-032] renders "Add file" button', () => {
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('Add file')).toBeInTheDocument()
  })

  it('[REQ-032] shows filename for each attachment', () => {
    mockAttachments = [att]
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('report.pdf')).toBeInTheDocument()
  })

  it('[REQ-032] shows formatted file size in KB', () => {
    mockAttachments = [att] // 2048 bytes = 2.0 KB
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
  })

  it('[REQ-032] renders no attachment rows when list is empty', () => {
    mockAttachments = []
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})

// ── REQ-032: upload ───────────────────────────────────────────────────────────

describe('REQ-032 — Upload', () => {
  it('[REQ-032] shows "Uploading…" label while upload is pending', () => {
    mockUploadPending = true
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
  })

  it('[REQ-032] upload button is disabled while upload is pending', () => {
    mockUploadPending = true
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByRole('button', { name: /uploading/i })).toBeDisabled()
  })

  it('[REQ-032] shows upload error message when upload fails', () => {
    mockUploadError = true
    mockUploadErrorObj = { response: { data: { error: { message: 'File too large.' } } } }
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('File too large.')).toBeInTheDocument()
  })

  it('[REQ-032] shows fallback error message when error has no message', () => {
    mockUploadError = true
    mockUploadErrorObj = {}
    render(<AttachmentSection {...defaultProps} />)
    expect(screen.getByText('Upload failed.')).toBeInTheDocument()
  })

  it('[REQ-032] selecting a file calls upload mutateAsync', async () => {
    mockUploadMutateAsync.mockResolvedValue(att)
    render(<AttachmentSection {...defaultProps} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(mockUploadMutateAsync).toHaveBeenCalledWith(file))
  })
})

// ── REQ-032: delete ───────────────────────────────────────────────────────────

describe('REQ-032 — Delete', () => {
  it('[REQ-032] clicking delete button calls deleteAttachment with attachment id', () => {
    mockAttachments = [att]
    render(<AttachmentSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: `Delete ${att.filename}` }))
    expect(mockDeleteMutate).toHaveBeenCalledWith('att-1')
  })
})

// ── REQ-032: download ─────────────────────────────────────────────────────────

describe('REQ-032 — Download', () => {
  it('[REQ-032] clicking download button fetches blob and triggers anchor download', async () => {
    mockAttachments = [att]
    const fakeBlob = new Blob(['hello'], { type: 'application/pdf' })
    mockDownloadAttachment.mockResolvedValue(fakeBlob)

    const fakeBlobUrl = 'blob:fake-object-url'
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue(fakeBlobUrl),
      revokeObjectURL: vi.fn(),
    })

    const anchorClick = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    let capturedAnchor: HTMLAnchorElement | null = null

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        capturedAnchor = el as HTMLAnchorElement
        vi.spyOn(capturedAnchor, 'click').mockImplementation(anchorClick)
      }
      return el
    })

    render(<AttachmentSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: `Download ${att.filename}` }))

    await waitFor(() => expect(anchorClick).toHaveBeenCalled())
    expect(capturedAnchor).not.toBeNull()
    expect(capturedAnchor!.href).toBe(fakeBlobUrl)
    expect(capturedAnchor!.download).toBe('report.pdf')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(fakeBlobUrl)

    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})
