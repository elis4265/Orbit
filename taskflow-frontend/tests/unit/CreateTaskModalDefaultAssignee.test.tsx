import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CreateTaskModal from '../../src/components/CreateTaskModal'

// HW-18 — Assignee is pre-filled from the project default when the modal opens, and
// whatever the field shows at submit time is what the task is created with. Kept in its
// own file because these cases need useProjects/useMe/useMembers mocked with real data,
// while CreateTaskModal.test.tsx deliberately runs them empty.

const h = vi.hoisted(() => ({
  project: { id: 'p-1', default_assignee_mode: 'unassigned', default_assignee_id: null } as any,
  me: { id: 'user-me', username: 'me' } as any,
  members: [
    { id: 'user-me', username: 'me', email: 'me@orbit.test' },
    { id: 'user-x', username: 'xenia', email: 'xenia@orbit.test' },
  ] as any[],
}))

vi.mock('../../src/hooks/useProjects', () => ({ useProjects: () => ({ data: [h.project] }) }))
vi.mock('../../src/hooks/useAuth', () => ({ useMe: () => ({ data: h.me }) }))
vi.mock('../../src/hooks/useMembers', () => ({ useMembers: () => ({ data: h.members }) }))

vi.mock('../../src/components/LocalRichTextEditor', () => ({ default: () => null }))
vi.mock('../../src/hooks/useTasks', () => ({
  useAIBreakdown: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTasks: () => ({ data: [] }),
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../../src/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
  useTaskTags: () => ({ data: [] }),
  useApplyTag: () => ({ mutate: vi.fn() }),
  useRemoveTag: () => ({ mutate: vi.fn() }),
  useCreateTag: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('../../src/hooks/useAttachments', () => ({
  useAttachments: () => ({ data: [] }),
  useUploadAttachment: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
  useDeleteAttachment: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => () => Promise.resolve(new Blob()),
}))
vi.mock('../../src/api/client', () => ({
  attachmentApi: { upload: vi.fn().mockResolvedValue({}) },
  tagApi: { applyToTask: vi.fn().mockResolvedValue({}) },
}))
vi.mock('../../src/hooks/usePriorities', () => ({ useProjectPriorities: () => ({ data: [] }) }))

function render(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  })
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    projectId: 'p-1',
    boardId: 'b-1',
    ...overrides,
  } as any
}

const assigneeSelect = () =>
  screen.getByRole('combobox', { name: /assignee/i }) as HTMLSelectElement

function setMode(mode: string, defaultAssigneeId: string | null = null) {
  h.project = { id: 'p-1', default_assignee_mode: mode, default_assignee_id: defaultAssigneeId }
}

beforeEach(() => {
  setMode('unassigned')
  h.me = { id: 'user-me', username: 'me' }
})

describe('HW-18 — Assignee is pre-filled from the project default', () => {
  it('creator mode pre-selects the person opening the modal', async () => {
    setMode('creator')
    render(<CreateTaskModal {...props()} />)
    await waitFor(() => expect(assigneeSelect().value).toBe('user-me'))
  })

  it('member mode pre-selects the configured member', async () => {
    setMode('member', 'user-x')
    render(<CreateTaskModal {...props()} />)
    await waitFor(() => expect(assigneeSelect().value).toBe('user-x'))
  })

  it('unassigned mode leaves the field empty', async () => {
    render(<CreateTaskModal {...props()} />)
    await waitFor(() => expect(assigneeSelect().value).toBe(''))
  })

  it('does not pre-fill when editing an existing task', async () => {
    setMode('creator')
    const editTask = {
      id: 't-1', title: 'Existing', description: null, status: 'todo', issue_type: 'task',
      severity: null, priority_id: null, position: 0, project_id: 'p-1', assignee_id: null,
      due_date: null, version: 1,
    } as any
    render(<CreateTaskModal {...props({ editTask })} />)
    // an existing unassigned task stays unassigned — the default applies at birth only
    await waitFor(() => expect(screen.getByDisplayValue('Existing')).toBeInTheDocument())
    expect(assigneeSelect().value).toBe('')
  })
})

describe('HW-18 — what the field shows is what gets created', () => {
  it('submits the pre-filled default untouched', async () => {
    setMode('member', 'user-x')
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...props({ onSubmit })} />)
    await waitFor(() => expect(assigneeSelect().value).toBe('user-x'))
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Ship it' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ assignee_id: 'user-x' }), 'b-1',
      ),
    )
  })

  it('clearing the pre-filled default submits an explicit null, not an omission', async () => {
    // The regression this whole ticket exists to prevent: omitting the key lets the
    // server re-apply the default, silently refilling the field the creator emptied.
    setMode('creator')
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...props({ onSubmit })} />)
    await waitFor(() => expect(assigneeSelect().value).toBe('user-me'))
    fireEvent.change(assigneeSelect(), { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Nobody yet' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const payload = onSubmit.mock.calls[0][0]
    expect(payload.assignee_id).toBeNull()
    expect('assignee_id' in payload).toBe(true)
  })

  it('overriding the default with someone else submits that person', async () => {
    setMode('creator')
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...props({ onSubmit })} />)
    await waitFor(() => expect(assigneeSelect().value).toBe('user-me'))
    fireEvent.change(assigneeSelect(), { target: { value: 'user-x' } })
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'For Xenia' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ assignee_id: 'user-x' }), 'b-1',
      ),
    )
  })

  it('a manual choice survives the project loading in late', async () => {
    // useProjects can resolve after the modal opens; the pre-fill must never
    // overwrite a choice the creator has already made.
    render(<CreateTaskModal {...props()} />)
    fireEvent.change(assigneeSelect(), { target: { value: 'user-x' } })
    setMode('creator')
    await new Promise((r) => setTimeout(r, 0))
    expect(assigneeSelect().value).toBe('user-x')
  })
})
