import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TaskDetailModal from '../../src/components/TaskDetailModal'
import type { Task } from '../../src/types'

const mockUpdateTask = vi.fn()
const mockDeleteTask = vi.fn()

const mockTasksData: { data: import('../../src/types').Task[] } = { data: [] }
// Backs useProjectTasks — the source of incompleteChildCount for the epic gate.
const mockProjectTasksData: { data: import('../../src/types').Task[] } = { data: [] }

vi.mock('../../src/hooks/useTasks', () => ({
  useUpdateTask: () => ({ mutateAsync: mockUpdateTask }),
  useDeleteTask: () => ({ mutateAsync: mockDeleteTask }),
  useAIBreakdown: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTasks: () => mockTasksData,
  useProjectTasks: () => ({ data: mockProjectTasksData.data, isLoading: false }),
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('../../src/hooks/useAttachments', () => ({
  useAttachments: () => ({ data: [] }),
  useUploadAttachment: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDeleteAttachment: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => () => Promise.resolve(new Blob()),
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useMe: () => ({ data: { id: 'user-1', email: 'test@example.com', username: 'testuser', is_verified: true, created_at: '' } }),
  useLogin: () => ({ mutateAsync: vi.fn() }),
  useRegister: () => ({ mutateAsync: vi.fn() }),
  useLogout: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../src/hooks/useComments', () => ({
  useComments: () => ({ data: [], isLoading: false }),
  useCreateComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEditComment: () => ({ mutateAsync: vi.fn() }),
  useDeleteComment: () => ({ mutate: vi.fn() }),
  useCommentHistory: () => ({ data: [], isLoading: false }),
  useCommentAttachments: () => ({ data: [] }),
  useUploadCommentAttachment: () => ({ mutate: vi.fn() }),
  useDeleteCommentAttachment: () => ({ mutate: vi.fn() }),
}))

vi.mock('../../src/components/DescriptionEditor', () => ({
  default: ({ taskId }: { workspaceId: string; boardId: string; taskId: string; currentUser: { id: string; name: string } }) => (
    <div data-testid="desc-editor" data-task-id={taskId}>
      <span>Collaborative editor</span>
    </div>
  ),
}))

vi.mock('../../src/hooks/useMembers', () => ({
  useMembers: () => ({ data: [
    { id: 'user-1', email: 'test@example.com', username: 'testuser', role: 'admin', joined_at: '' },
  ] }),
  useInviteMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMember: () => ({ mutate: vi.fn() }),
  usePromoteMember: () => ({ mutate: vi.fn() }),
}))

vi.mock('../../src/hooks/useWatchers', () => ({
  useWatchStatus: () => ({ data: { watching: false } }),
  useWatchTask: () => ({ mutate: vi.fn() }),
  useUnwatchTask: () => ({ mutate: vi.fn() }),
}))

vi.mock('../../src/hooks/useTags', () => ({
  useTags: () => ({ data: [] }),
  useTaskTags: () => ({ data: [] }),
  useApplyTag: () => ({ mutate: vi.fn() }),
  useRemoveTag: () => ({ mutate: vi.fn() }),
  useCreateTag: () => ({ mutateAsync: vi.fn() }),
}))

vi.mock('../../src/hooks/useActivity', () => ({
  useTaskActivity: () => ({ data: [], isLoading: false }),
}))

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p-1', name: 'Test Project', mode: 'open', enforce_block_links: false, key: 'TP', next_sequence: 1, owner_id: 'user-1', created_at: '' }] }),
}))

vi.mock('../../src/hooks/useProjectStatuses', () => ({
  useProjectStatuses: () => ({ data: [] }),
  useProjectTransitions: () => ({ data: [] }),
}))

vi.mock('../../src/hooks/usePriorities', () => ({
  useProjectPriorities: () => ({ data: [] }),
}))

vi.mock('../../src/components/ActivityFeed', () => ({
  default: () => <div data-testid="activity-feed">Activity Feed</div>,
}))

vi.mock('../../src/components/TimeSpentSection', () => ({
  default: () => <div data-testid="time-spent-section" />,
}))

vi.mock('../../src/components/LinkedIssuesSection', () => ({
  default: () => <div data-testid="linked-issues-section">Linked Issues</div>,
}))

vi.mock('../../src/hooks/useTaskLinks', () => ({
  useTaskLinks: vi.fn(() => ({ data: [], isLoading: false })),
  useActiveBlockers: vi.fn(() => []),
  useAddTaskLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveTaskLink: () => ({ mutate: vi.fn() }),
  useTaskSearch: () => ({ data: [] }),
}))

import { useActiveBlockers } from '../../src/hooks/useTaskLinks'

vi.mock('../../src/components/LocalRichTextEditor', () => ({
  default: ({ onSave, onCancel, saveLabel, placeholder }: {
    initialContent?: string
    placeholder?: string
    onSave: (html: string) => void
    onCancel?: () => void
    saveLabel?: string
  }) => (
    <div data-testid="rich-text-editor">
      <div data-testid="rte-content" data-placeholder={placeholder} />
      <button onClick={() => onSave('<p>test</p>')}>{saveLabel ?? 'Save'}</button>
      {onCancel && <button onClick={onCancel}>Cancel</button>}
    </div>
  ),
}))

const TASK: Task = {
  id: 'task-1',
  title: 'Fix the login bug',
  description: 'Steps to reproduce: open login page',
  status: 'todo',
  issue_type: 'task',
  severity: null,
  priority_id: null,
  position: 0,
  project_id: 'p-1',
  assignee_id: null,
  due_date: '2026-07-01T00:00:00Z',
  parent_id: null,
  sprint_id: null,
  custom_status_id: null,
  version: 1,
  sequence_number: 1,
  project_key: 'TP',
  sub_tasks: [],
  tags: [],
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

function renderModal(overrides: Partial<Task> = {}) {
  const onClose = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TaskDetailModal
        task={{ ...TASK, ...overrides }}
        projectId="p-1"
        boardId="board-1"
        currentUserId="user-1"
        onClose={onClose}
      />
    </QueryClientProvider>
  )
  return { onClose }
}

beforeEach(() => {
  mockUpdateTask.mockReset()
  mockDeleteTask.mockReset()
})

describe('TaskDetailModal — read-only view', () => {
  it('displays title, status and priority as text', () => {
    renderModal()
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('Not set')).toBeInTheDocument()
  })

  it('renders the collaborative description editor after clicking description area', () => {
    renderModal()
    fireEvent.click(screen.getByText('Steps to reproduce: open login page'))
    expect(screen.getByTestId('desc-editor')).toBeInTheDocument()
  })

  it('closes on X button click', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on backdrop click', () => {
    const { onClose } = renderModal()
    const backdrop = document.querySelector('.fixed.inset-0')!
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape key', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TaskDetailModal — title inline editing', () => {
  it('clicking title shows an input pre-filled with current value', async () => {
    renderModal()
    fireEvent.click(screen.getByText('Fix the login bug'))
    const input = screen.getByDisplayValue('Fix the login bug')
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('Enter saves the new title', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, title: 'New title', version: 2 })
    renderModal()
    fireEvent.click(screen.getByText('Fix the login bug'))
    const input = screen.getByDisplayValue('Fix the login bug')
    await userEvent.clear(input)
    await userEvent.type(input, 'New title')
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'New title' }) })
    ))
  })

  it('Escape cancels and restores original title', async () => {
    renderModal()
    fireEvent.click(screen.getByText('Fix the login bug'))
    const input = screen.getByDisplayValue('Fix the login bug')
    await userEvent.clear(input)
    await userEvent.type(input, 'Changed')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByText('Fix the login bug')).toBeInTheDocument()
    expect(mockUpdateTask).not.toHaveBeenCalled()
  })

  it('blur saves the title', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, version: 2 })
    renderModal()
    fireEvent.click(screen.getByText('Fix the login bug'))
    const input = screen.getByDisplayValue('Fix the login bug')
    await userEvent.clear(input)
    await userEvent.type(input, 'Blurred title')
    fireEvent.blur(input)
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalled())
  })
})


describe('TaskDetailModal — metadata field editing', () => {
  it('clicking status shows a dropdown', () => {
    renderModal()
    fireEvent.click(screen.getByText('To Do'))
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('changing status saves immediately', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, status: 'in_progress', version: 2 })
    renderModal()
    fireEvent.click(screen.getByText('To Do'))
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'in_progress' } })
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'in_progress' }) })
    ))
  })

  it('clicking priority shows a dropdown', () => {
    renderModal()
    fireEvent.click(screen.getByText('Not set'))
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('delete button calls deleteTask and closes', async () => {
    mockDeleteTask.mockResolvedValue(undefined)
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /delete task/i }))
    await waitFor(() => expect(mockDeleteTask).toHaveBeenCalledWith('task-1'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TaskDetailModal — blocker warning', () => {
  it('shows warning banner when there are unresolved blockers', () => {
    vi.mocked(useActiveBlockers).mockReturnValue([
      { id: 'task-99', title: 'Deploy infra', status: 'in_progress' },
    ])
    renderModal()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/blocked by/i)).toBeInTheDocument()
    expect(screen.getByText(/Deploy infra/)).toBeInTheDocument()
  })

  it('does not show warning when all blockers are resolved', () => {
    vi.mocked(useActiveBlockers).mockReturnValue([])
    renderModal()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

// ── REQ-CHILD: Parent link in sidebar ────────────────────────────────────────

describe('REQ-CHILD — parent task link in sidebar', () => {
  it('[REQ-CHILD] shows parent link when task has a parent', () => {
    renderModal({
      parent_id: 'parent-1',
      parent: { id: 'parent-1', title: 'Epic Task', issue_type: 'epic', status: 'in_progress', sequence_number: 5 },
    })
    expect(screen.getByTestId('parent-task-link')).toBeInTheDocument()
    expect(screen.getByText('TP-5')).toBeInTheDocument()
    expect(screen.getByText('Epic Task')).toBeInTheDocument()
  })

  it('[REQ-CHILD] does not show parent link when task has no parent', () => {
    renderModal({ parent_id: null, parent: null })
    expect(screen.queryByTestId('parent-task-link')).not.toBeInTheDocument()
  })

  it('[REQ-CHILD] clicking parent link calls onOpenTask with parent id', () => {
    const onOpenTask = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <TaskDetailModal
          task={{ ...TASK, parent_id: 'parent-1', parent: { id: 'parent-1', title: 'Epic Task', issue_type: 'epic', status: 'in_progress', sequence_number: 5 } }}
          projectId="p-1"
          boardId="board-1"
          currentUserId="user-1"
          onClose={vi.fn()}
          onOpenTask={onOpenTask}
        />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByTestId('parent-task-link'))
    expect(onOpenTask).toHaveBeenCalledWith('parent-1')
  })
})

// ── REQ-EPIC-GATE: Enforced mode blocks Epic completion when children incomplete ─

describe('REQ-EPIC-GATE — Epic completion gate in Enforced mode', () => {
  beforeEach(() => { mockTasksData.data = []; mockProjectTasksData.data = [] })

  it('[REQ-EPIC-GATE] gate dialog is not visible on initial render (not triggered yet)', () => {
    mockProjectTasksData.data = [{ ...TASK, id: 'child-1', parent_id: TASK.id, status: 'todo' as const }]
    renderModal({ issue_type: 'epic' })
    expect(screen.queryByText(/incomplete child task/i)).not.toBeInTheDocument()
  })

  it('[REQ-EPIC-GATE] selecting Done on an Epic with incomplete children shows the gate instead of saving', () => {
    mockProjectTasksData.data = [
      { ...TASK, id: 'child-1', parent_id: TASK.id, status: 'todo' as const },
      { ...TASK, id: 'child-2', parent_id: TASK.id, status: 'in_progress' as const },
    ]
    renderModal({ issue_type: 'epic' })
    fireEvent.click(screen.getByText('To Do'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } })
    expect(screen.getByText(/2 incomplete child tasks/i)).toBeInTheDocument()
    expect(mockUpdateTask).not.toHaveBeenCalled()
  })

  it('[REQ-EPIC-GATE] confirming the gate saves status done', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, issue_type: 'epic', status: 'done', version: 2 })
    mockProjectTasksData.data = [{ ...TASK, id: 'child-1', parent_id: TASK.id, status: 'todo' as const }]
    renderModal({ issue_type: 'epic' })
    fireEvent.click(screen.getByText('To Do'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } })
    fireEvent.click(screen.getByRole('button', { name: /complete anyway/i }))
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) })
    ))
  })

  it('[REQ-EPIC-GATE] cancelling the gate saves nothing', () => {
    mockProjectTasksData.data = [{ ...TASK, id: 'child-1', parent_id: TASK.id, status: 'todo' as const }]
    renderModal({ issue_type: 'epic' })
    fireEvent.click(screen.getByText('To Do'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockUpdateTask).not.toHaveBeenCalled()
    expect(screen.queryByText(/incomplete child task/i)).not.toBeInTheDocument()
  })

  it('[REQ-EPIC-GATE] gate dialog is not shown for non-Epic tasks regardless of children', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, status: 'done', version: 2 })
    mockProjectTasksData.data = [{ ...TASK, id: 'child-1', parent_id: TASK.id, status: 'todo' as const }]
    renderModal({ issue_type: 'task' })
    fireEvent.click(screen.getByText('To Do'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } })
    expect(screen.queryByText(/incomplete child task/i)).not.toBeInTheDocument()
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalled())
  })

  it('[REQ-EPIC-GATE] no incomplete children counted when all children are done', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, issue_type: 'epic', status: 'done', version: 2 })
    mockProjectTasksData.data = [{ ...TASK, id: 'child-1', parent_id: TASK.id, status: 'done' as const }]
    renderModal({ issue_type: 'epic' })
    fireEvent.click(screen.getByText('To Do'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'done' } })
    expect(screen.queryByText(/incomplete child task/i)).not.toBeInTheDocument()
    await waitFor(() => expect(mockUpdateTask).toHaveBeenCalled())
  })
})

// ── REQ-IT04: Issue type in TaskDetailModal sidebar ───────────────────────────

describe('REQ-IT04 — issue type sidebar display and editing', () => {
  it('[REQ-IT04] shows issue type badge label in sidebar (header + sidebar both render badge)', () => {
    renderModal()
    // Badge appears in header AND sidebar — both are expected
    expect(screen.getAllByText('Task').length).toBeGreaterThanOrEqual(1)
  })

  it('[REQ-IT04] clicking the sidebar type button opens the type dropdown', () => {
    renderModal()
    // The sidebar button wraps the badge; its accessible name is "Task"
    fireEvent.click(screen.getByRole('button', { name: /^Task$/i }))
    expect(screen.getByRole('combobox', { name: /issue type/i })).toBeInTheDocument()
  })

  it('[REQ-IT04] changing type dropdown saves immediately', async () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, issue_type: 'bug', version: 2 })
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^Task$/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /issue type/i }), { target: { value: 'bug' } })
    await waitFor(() =>
      expect(mockUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ issue_type: 'bug' }) })
      )
    )
  })

  it('[REQ-IT04] escape on type dropdown cancels without saving', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^Task$/i }))
    const select = screen.getByRole('combobox', { name: /issue type/i })
    fireEvent.keyDown(select, { key: 'Escape' })
    expect(mockUpdateTask).not.toHaveBeenCalled()
    expect(screen.queryByRole('combobox', { name: /issue type/i })).not.toBeInTheDocument()
  })

  it('[REQ-IT04] shows bug badge when task.issue_type is bug', () => {
    renderModal({ issue_type: 'bug' })
    expect(screen.getAllByText('Bug').length).toBeGreaterThanOrEqual(1)
  })
})

// ── REQ-SEV-SIDEBAR: Severity picker in sidebar for Bug tasks ─────────────────

describe('REQ-SEV-SIDEBAR — severity picker visible in sidebar for Bug', () => {
  it('[REQ-SEV-SIDEBAR] severity field not shown for task type', () => {
    renderModal({ issue_type: 'task' })
    expect(screen.queryByText('Severity')).not.toBeInTheDocument()
  })

  it('[REQ-SEV-SIDEBAR] severity field shown for bug type', () => {
    renderModal({ issue_type: 'bug', severity: null })
    expect(screen.getByText('Severity')).toBeInTheDocument()
  })

  it('[REQ-SEV-SIDEBAR] severity field shown for bug with existing severity', () => {
    renderModal({ issue_type: 'bug', severity: 'high' as import('../../src/types').SeverityLevel })
    expect(screen.getByText('Severity')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('[REQ-SEV-SIDEBAR] severity field not shown for epic type', () => {
    renderModal({ issue_type: 'epic' })
    expect(screen.queryByText('Severity')).not.toBeInTheDocument()
  })
})

// ── REQ-STORY-GATE: Story gate in Enforced mode ──────────────────────────────

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: vi.fn(() => ({ data: [{ id: 'p-1', name: 'Test Project', mode: 'open', key: 'TP', next_sequence: 1, owner_id: 'user-1', created_at: '' }] })),
}))

import { useProjects } from '../../src/hooks/useProjects'

describe('REQ-STORY-GATE — Story gate dialog in Enforced mode', () => {
  it('[REQ-STORY-GATE] story gate not shown on initial render', () => {
    vi.mocked(useProjects).mockReturnValue({ data: [{ id: 'p-1', name: 'Test Project', mode: 'enforced' as import('../../src/types').ProjectMode, key: 'TP', owner_id: 'user-1', created_at: '', updated_at: '' }] } as ReturnType<typeof useProjects>)
    renderModal({ issue_type: 'story', parent_id: null })
    expect(screen.queryByText(/epic required/i)).not.toBeInTheDocument()
  })

  it('[REQ-STORY-GATE] gate not shown for non-Story task types', () => {
    vi.mocked(useProjects).mockReturnValue({ data: [{ id: 'p-1', name: 'Test Project', mode: 'enforced' as import('../../src/types').ProjectMode, key: 'TP', owner_id: 'user-1', created_at: '', updated_at: '' }] } as ReturnType<typeof useProjects>)
    renderModal({ issue_type: 'task', parent_id: null })
    expect(screen.queryByText(/epic required/i)).not.toBeInTheDocument()
  })

  it('[REQ-STORY-GATE] gate not shown in Open mode even for orphan Story', () => {
    vi.mocked(useProjects).mockReturnValue({ data: [{ id: 'p-1', name: 'Test Project', mode: 'open' as import('../../src/types').ProjectMode, key: 'TP', owner_id: 'user-1', created_at: '', updated_at: '' }] } as ReturnType<typeof useProjects>)
    renderModal({ issue_type: 'story', parent_id: null })
    expect(screen.queryByText(/epic required/i)).not.toBeInTheDocument()
  })
})

// ── Mobile sheet: full-screen below md, stacked columns ──────────────────────
// jsdom has no real viewport, so these are class-contract assertions: the mobile
// base classes must be present and every desktop behaviour must be md:-scoped.

describe('TaskDetailModal — mobile full-screen sheet', () => {
  it('the panel is a full-bleed sheet below md and the centered dialog from md up', () => {
    renderModal()
    const panel = screen.getByTestId('task-detail-panel')

    // mobile: whole viewport, square corners, no border
    expect(panel.className).toContain('w-full')
    expect(panel.className).toContain('h-full')
    expect(panel.className).toContain('max-w-none')
    expect(panel.className).toContain('max-h-none')
    expect(panel.className).toContain('rounded-none')
    expect(panel.className).toContain('border-0')

    // desktop unchanged
    expect(panel.className).toContain('md:max-w-3xl')
    expect(panel.className).toContain('md:max-h-[90vh]')
    expect(panel.className).toContain('md:rounded-2xl')
    expect(panel.className).toContain('md:border')
    expect(panel.className).toContain('md:h-auto')
  })

  it('drops the backdrop padding below md so the sheet reaches the edges', () => {
    renderModal()
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    expect(backdrop.className).toContain('p-0')
    expect(backdrop.className).toContain('md:p-4')
  })

  it('stacks content above the info rail below md and scrolls as one flow', () => {
    renderModal()
    const body = screen.getByTestId('task-detail-body')
    expect(body.className).toContain('flex-col')
    expect(body.className).toContain('md:flex-row')
    // one vertical scroll container on mobile; per-column scrolling from md up
    expect(body.className).toContain('overflow-y-auto')
    expect(body.className).toContain('md:overflow-hidden')
    expect(body.className).toContain('min-h-0')
  })

  it('the info rail is full-width below md and only 208px from md up', () => {
    renderModal()
    const rail = screen.getByTestId('task-detail-rail')
    expect(rail.className).toContain('w-full')
    expect(rail.className).toContain('md:w-52')
    expect(rail.className).not.toMatch(/(^|\s)w-52(\s|$)/)   // never a fixed column on mobile
    expect(rail.className).toContain('md:flex-shrink-0')
    // the left border becomes a top divider once stacked
    expect(rail.className).toContain('border-t')
    expect(rail.className).toContain('md:border-l')
  })

  it('renders content before the rail in DOM order so it stacks content-first', () => {
    renderModal()
    const body = screen.getByTestId('task-detail-body')
    const rail = screen.getByTestId('task-detail-rail')
    expect(body.firstElementChild).not.toBe(rail)
    expect(body.lastElementChild).toBe(rail)
  })
})

// ── REQ-SP-CUSTOM: custom story-points input commits before the modal closes ─

vi.mock('../../src/components/PlanningPoker', () => ({
  default: () => <div data-testid="planning-poker" />,
}))

describe('REQ-SP-CUSTOM — custom story-points input', () => {
  function renderWithPoints(overrides: Partial<Task> = {}) {
    vi.mocked(useProjects).mockReturnValue({ data: [{
      id: 'p-1', name: 'Test Project', mode: 'open' as import('../../src/types').ProjectMode,
      estimation_method: 'story_points' as import('../../src/types').EstimationMethod,
      key: 'TP', owner_id: 'user-1', created_at: '', updated_at: '',
    }] } as ReturnType<typeof useProjects>)
    return renderModal(overrides)
  }

  it('[REQ-SP-CUSTOM] commits the typed value on blur', () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, estimate: 7, version: 2 })
    renderWithPoints()
    const input = screen.getByTitle('Custom story points')
    fireEvent.change(input, { target: { value: '7' } })
    fireEvent.blur(input)
    expect(mockUpdateTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      data: expect.objectContaining({ estimate: 7 }),
    })
  })

  it('[REQ-SP-CUSTOM] Escape while typing commits the pending value before the modal closes', () => {
    mockUpdateTask.mockResolvedValue({ ...TASK, estimate: 4, version: 2 })
    const { onClose } = renderWithPoints()
    const input = screen.getByTitle('Custom story points')
    input.focus()
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockUpdateTask).toHaveBeenCalledWith({
      taskId: 'task-1',
      data: expect.objectContaining({ estimate: 4 }),
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('[REQ-SP-CUSTOM] Escape with an empty input saves nothing and closes', () => {
    const { onClose } = renderWithPoints()
    const input = screen.getByTitle('Custom story points')
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockUpdateTask).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
