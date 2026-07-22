import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CreateTaskModal from '../../src/components/CreateTaskModal'
import type { Task, IssueType, SeverityLevel } from '../../src/types'

function render(ui: React.ReactElement, options?: Parameters<typeof rtlRender>[1]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return rtlRender(ui, { wrapper: Wrapper, ...options })
}

vi.mock('../../src/components/LocalRichTextEditor', () => ({ default: () => null }))

vi.mock('../../src/hooks/useTasks', () => ({
  useAIBreakdown: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTasks: () => ({ data: [] }),
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../src/hooks/useMembers', () => ({
  useMembers: () => ({ data: [] }),
}))

// HW-18: the modal reads the project's default assignee. No project here means no
// pre-fill, which is what every case below assumes. Pre-fill has its own suite in
// CreateTaskModalDefaultAssignee.test.tsx.
vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({ data: [] }),
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useMe: () => ({ data: null }),
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

vi.mock('../../src/hooks/usePriorities', () => ({
  useProjectPriorities: () => ({ data: [] }),
}))

const baseTask: Task = {
  id: 'task-1',
  title: 'Fix the bug',
  description: null,
  status: 'todo',
  issue_type: 'task',
  severity: null,
  priority_id: null,
  position: 0,
  project_id: 'p-1',
  assignee_id: null,
  due_date: null,
  parent_id: null,
  sprint_id: null,
  custom_status_id: null,
  version: 1,
  sequence_number: 1,
  project_key: 'TP',
  sub_tasks: [],
  tags: [],
  created_at: '',
  updated_at: '',
}


function newTaskProps(overrides: Partial<Parameters<typeof CreateTaskModal>[0]> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    projectId: 'p-1',
    boardId: 'b-1',
    ...overrides,
  }
}

function modalProps(overrides: Partial<Task> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onSubmit: vi.fn().mockResolvedValue(undefined),
    projectId: 'p-1',
    boardId: 'b-1',
    editTask: { ...baseTask, ...overrides },
  }
}


// ── REQ-IT01: Type picker renders ────────────────────────────────────────────

describe('REQ-IT01 — Issue type picker renders', () => {
  it('[REQ-IT01] type selector shows all 4 options', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    const select = screen.getByRole('combobox', { name: /issue type/i })
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toContain('epic')
    expect(options).toContain('story')
    expect(options).toContain('task')
    expect(options).toContain('bug')
    expect(options).toHaveLength(4)
  })

  it('[REQ-IT01] default selected type is task', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    const select = screen.getByRole('combobox', { name: /issue type/i }) as HTMLSelectElement
    expect(select.value).toBe('task')
  })
})

// ── REQ-IT02: issue_type sent in submit payload ───────────────────────────────

describe('REQ-IT02 — issue_type sent in submit payload', () => {
  it('[REQ-IT02] selecting bug submits issue_type: bug', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...newTaskProps()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Login crashes' } })
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'bug' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ issue_type: 'bug' }), 'b-1')
    )
  })

  it('[REQ-IT02] selecting epic submits issue_type: epic', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...newTaskProps()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Auth overhaul' } })
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'epic' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ issue_type: 'epic' }), 'b-1')
    )
  })

  it('[REQ-IT02] default submit sends issue_type: task', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...newTaskProps()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Fix button' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ issue_type: 'task' }), 'b-1')
    )
  })
})

// ── REQ-IT03: Edit mode pre-fills issue_type ─────────────────────────────────

describe('REQ-IT03 — edit mode pre-fills issue_type', () => {
  it('[REQ-IT03] shows bug when editTask.issue_type is bug', () => {
    render(<CreateTaskModal {...modalProps({ issue_type: 'bug' as IssueType })} />)
    const select = screen.getByRole('combobox', { name: /issue type/i }) as HTMLSelectElement
    expect(select.value).toBe('bug')
  })

  it('[REQ-IT03] shows epic when editTask.issue_type is epic', () => {
    render(<CreateTaskModal {...modalProps({ issue_type: 'epic' as IssueType })} />)
    const select = screen.getByRole('combobox', { name: /issue type/i }) as HTMLSelectElement
    expect(select.value).toBe('epic')
  })

  it('[REQ-IT03] shows story when editTask.issue_type is story', () => {
    render(<CreateTaskModal {...modalProps({ issue_type: 'story' as IssueType })} />)
    const select = screen.getByRole('combobox', { name: /issue type/i }) as HTMLSelectElement
    expect(select.value).toBe('story')
  })
})

// ── REQ-SEV01: Severity picker appears only for Bug ──────────────────────────

describe('REQ-SEV01 — severity picker visible only for Bug', () => {
  it('[REQ-SEV01] severity picker not shown when type is task', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    expect(screen.queryByRole('combobox', { name: /severity/i })).toBeNull()
  })

  it('[REQ-SEV01] severity picker appears after switching to bug', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'bug' } })
    expect(screen.getByRole('combobox', { name: /severity/i })).toBeTruthy()
  })

  it('[REQ-SEV01] severity picker disappears after switching back to task', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'bug' } })
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'task' } })
    expect(screen.queryByRole('combobox', { name: /severity/i })).toBeNull()
  })

  it('[REQ-SEV01] severity picker shows for epic and story — not shown', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'epic' } })
    expect(screen.queryByRole('combobox', { name: /severity/i })).toBeNull()
  })
})

// ── REQ-SEV02: Severity sent in submit payload ───────────────────────────────

describe('REQ-SEV02 — severity sent in submit payload', () => {
  it('[REQ-SEV02] selected severity is included in submit payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...newTaskProps()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Login crashes' } })
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'bug' } })
    fireEvent.change(screen.getByRole('combobox', { name: /severity/i }), { target: { value: 'critical' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }), 'b-1')
    )
  })

  it('[REQ-SEV02] no severity in payload when not set', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...newTaskProps()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Login crashes' } })
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'bug' } })
    // don't set severity
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)
    await waitFor(() => {
      const arg = onSubmit.mock.calls[0][0]
      expect(arg.severity === undefined || arg.severity === null || arg.severity === '').toBe(true)
    })
  })

  it('[REQ-SEV02] edit mode pre-fills severity from editTask', () => {
    render(<CreateTaskModal {...modalProps({ issue_type: 'bug' as IssueType, severity: 'high' as SeverityLevel })} />)
    const select = screen.getByRole('combobox', { name: /severity/i }) as HTMLSelectElement
    expect(select.value).toBe('high')
  })
})

// ── Mobile sheet: full-screen below md, sticky action footer ─────────────────
// jsdom has no real viewport, so these are class-contract assertions.

describe('CreateTaskModal — mobile full-screen sheet', () => {
  it('is a full-bleed sheet below md and the centered dialog from md up', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    const panel = screen.getByTestId('create-task-panel')

    expect(panel.className).toContain('w-full')
    expect(panel.className).toContain('h-full')
    expect(panel.className).toContain('max-w-none')
    expect(panel.className).toContain('max-h-none')
    expect(panel.className).toContain('rounded-none')
    expect(panel.className).toContain('border-0')
    expect(panel.className).toContain('mx-0')

    expect(panel.className).toContain('md:max-w-md')
    expect(panel.className).toContain('md:max-h-[90vh]')
    expect(panel.className).toContain('md:rounded-2xl')
    expect(panel.className).toContain('md:border')
    expect(panel.className).toContain('md:mx-4')
    expect(panel.className).toContain('md:h-auto')
  })

  it('keeps the form body as the single vertical scroll region', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    const form = screen.getByPlaceholderText('Task title').closest('form')!
    const scroller = form.parentElement as HTMLElement
    expect(scroller.className).toContain('overflow-y-auto')
    expect(scroller.className).toContain('flex-1')
    expect(scroller.className).toContain('min-h-0')
  })

  it('pins Cancel/Create to the bottom below md and inlines them from md up', () => {
    render(<CreateTaskModal {...newTaskProps()} />)
    const footer = screen.getByRole('button', { name: /^cancel$/i }).parentElement as HTMLElement

    expect(footer).toContainElement(screen.getByRole('button', { name: /create task/i }))
    expect(footer.className).toContain('sticky')
    expect(footer.className).toContain('bottom-0')
    expect(footer.className).toContain('md:static')
    expect(footer.className).toContain('md:bg-transparent')
    expect(footer.className).toContain('md:border-t-0')
  })
})

describe('HW-10 — no resolvable board (Backlog)', () => {
  // Backlog passes boardId=undefined; with no boards the picker isn't rendered,
  // so nothing stops the submit and the old code stranded the spinner on forever.
  function backlogProps(overrides = {}) {
    return {
      open: true,
      onClose: vi.fn(),
      onSubmit: vi.fn().mockResolvedValue(undefined),
      projectId: 'p-1',
      boardId: undefined,
      boards: [],
      ...overrides,
    }
  }

  it('[HW-10] submitting with no board shows an error instead of hanging', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<CreateTaskModal {...backlogProps()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Orphan task' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)

    expect(await screen.findByText(/no board yet/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('[HW-10] submit button does not get stuck in the loading state', async () => {
    render(<CreateTaskModal {...backlogProps()} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Orphan task' } })
    fireEvent.submit(screen.getByPlaceholderText('Task title').closest('form')!)

    await screen.findByText(/no board yet/i)
    const submit = screen.getByRole('button', { name: /create task/i }) as HTMLButtonElement
    expect(submit).not.toBeDisabled()
    expect(screen.queryByRole('button', { name: /creating…/i })).not.toBeInTheDocument()
  })
})

