import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LinkedIssuesSection from '../../src/components/LinkedIssuesSection'
import type { Task } from '../../src/types'

const mockAddLink = vi.fn()
const mockRemoveLink = vi.fn()

vi.mock('../../src/hooks/useTaskLinks', () => ({
  useTaskLinks: vi.fn(() => ({ data: [], isLoading: false })),
  useAddTaskLink: () => ({ mutateAsync: mockAddLink, isPending: false }),
  useRemoveTaskLink: () => ({ mutate: mockRemoveLink }),
  useTaskSearch: vi.fn(() => ({ data: [] })),
}))

import { useTaskLinks, useTaskSearch } from '../../src/hooks/useTaskLinks'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'My Task',
    description: null,
    status: 'todo',
    issue_type: 'task',
    priority: 3,
    position: 0,
    workspace_id: 'ws-1',
    board_id: 'board-1',
    assignee_id: null,
    due_date: null,
    parent_id: null,
    parent: null,
    version: 1,
    sub_tasks: [],
    tags: [],
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const BASE_PROPS = { workspaceId: 'ws-1', boardId: 'board-1' }

function renderSection(task: Task) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <LinkedIssuesSection {...BASE_PROPS} task={task} />
    </QueryClientProvider>
  )
}

describe('LinkedIssuesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTaskLinks).mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskLinks>)
    vi.mocked(useTaskSearch).mockReturnValue({ data: [] } as ReturnType<typeof useTaskSearch>)
  })

  // ── empty state ────────────────────────────────────────────────────────────

  it('renders empty state when no links, no parent, no sub_tasks', () => {
    renderSection(makeTask())
    expect(screen.getByText('No linked issues.')).toBeTruthy()
  })

  // ── task links ─────────────────────────────────────────────────────────────

  it('renders outgoing link group (Is blocker of)', () => {
    vi.mocked(useTaskLinks).mockReturnValue({
      data: [{
        id: 'link-1', source_id: 'task-1', target_id: 'task-2',
        link_type: 'blocks', display_type: 'Is blocker of',
        linked_task: { id: 'task-2', title: 'Fix bug', status: 'todo' },
        created_at: '',
      }],
      isLoading: false,
    } as ReturnType<typeof useTaskLinks>)
    renderSection(makeTask())
    expect(screen.getByText('Is blocker of')).toBeTruthy()
    expect(screen.getByText('Fix bug')).toBeTruthy()
  })

  it('renders incoming link group (Is blocked by)', () => {
    vi.mocked(useTaskLinks).mockReturnValue({
      data: [{
        id: 'link-2', source_id: 'task-3', target_id: 'task-1',
        link_type: 'blocks', display_type: 'Is blocked by',
        linked_task: { id: 'task-3', title: 'Deploy', status: 'in_progress' },
        created_at: '',
      }],
      isLoading: false,
    } as ReturnType<typeof useTaskLinks>)
    renderSection(makeTask())
    expect(screen.getByText('Is blocked by')).toBeTruthy()
    expect(screen.getByText('Deploy')).toBeTruthy()
  })

  it('outgoing header has outgoing data-direction; incoming header has incoming', () => {
    vi.mocked(useTaskLinks).mockReturnValue({
      data: [
        { id: 'l1', source_id: 'task-1', target_id: 'task-2', link_type: 'blocks', display_type: 'Is blocker of', linked_task: { id: 'task-2', title: 'A', status: 'todo' }, created_at: '' },
        { id: 'l2', source_id: 'task-3', target_id: 'task-1', link_type: 'blocks', display_type: 'Is blocked by', linked_task: { id: 'task-3', title: 'B', status: 'todo' }, created_at: '' },
      ],
      isLoading: false,
    } as ReturnType<typeof useTaskLinks>)
    renderSection(makeTask())
    expect(screen.getByTestId('link-group-Is blocker of').dataset.direction).toBe('outgoing')
    expect(screen.getByTestId('link-group-Is blocked by').dataset.direction).toBe('incoming')
  })

  // ── HW-22: issue keys when linking ─────────────────────────────────────────

  describe('issue keys', () => {
    it('shows the key on a linked issue row', () => {
      vi.mocked(useTaskLinks).mockReturnValue({
        data: [{
          id: 'link-1', source_id: 'task-1', target_id: 'task-2',
          link_type: 'blocks', display_type: 'Is blocker of',
          linked_task: { id: 'task-2', title: 'Fix bug', status: 'todo', sequence_number: 22, project_key: 'HW' },
          created_at: '',
        }],
        isLoading: false,
      } as ReturnType<typeof useTaskLinks>)
      renderSection(makeTask())
      expect(screen.getByText('HW-22')).toBeTruthy()
      expect(screen.getByText('Fix bug')).toBeTruthy()
    })

    it('shows keys in the search dropdown so a task can be picked by number', () => {
      vi.mocked(useTaskSearch).mockReturnValue({
        data: [
          { id: 't-2', title: 'Login broken', status: 'todo', sequence_number: 22, project_key: 'HW' },
          { id: 't-3', title: 'Signup broken', status: 'todo', sequence_number: 7, project_key: 'HW' },
        ],
      } as ReturnType<typeof useTaskSearch>)
      renderSection(makeTask())
      fireEvent.click(screen.getByText('Add'))
      fireEvent.change(screen.getByPlaceholderText('Search tasks…'), { target: { value: 'broken' } })
      expect(screen.getByText('HW-22')).toBeTruthy()
      expect(screen.getByText('HW-7')).toBeTruthy()
    })

    it('shows the parent key on the Child of row, borrowing the project key', () => {
      const task = makeTask({
        project_key: 'HW',
        parent_id: 'p1',
        parent: { id: 'p1', title: 'Epic Title', issue_type: 'epic', status: 'todo', sequence_number: 4 },
      })
      renderSection(task)
      expect(screen.getByText('HW-4')).toBeTruthy()
    })

    it('strikes the key through on a done linked issue', () => {
      vi.mocked(useTaskLinks).mockReturnValue({
        data: [{
          id: 'link-2', source_id: 'task-1', target_id: 'task-2',
          link_type: 'blocks', display_type: 'Is blocker of',
          linked_task: { id: 'task-2', title: 'Shipped', status: 'done', sequence_number: 3, project_key: 'HW' },
          created_at: '',
        }],
        isLoading: false,
      } as ReturnType<typeof useTaskLinks>)
      renderSection(makeTask())
      expect(screen.getByTestId('issue-key').className).toContain('line-through')
    })

    it('renders a link with no number as title only, with no stray key', () => {
      vi.mocked(useTaskLinks).mockReturnValue({
        data: [{
          id: 'link-9', source_id: 'task-1', target_id: 'gone',
          link_type: 'duplicates', display_type: 'Is duplicate of',
          linked_task: { id: 'gone', title: '[deleted]', status: 'todo' },
          created_at: '',
        }],
        isLoading: false,
      } as ReturnType<typeof useTaskLinks>)
      renderSection(makeTask())
      expect(screen.getByText('[deleted]')).toBeTruthy()
      expect(screen.queryByText(/^-?undefined/)).toBeNull()
    })
  })

  // ── hierarchy: Child of ────────────────────────────────────────────────────

  it('shows "Child of" group with parent task title when task.parent is set', () => {
    const task = makeTask({
      parent_id: 'parent-task-id',
      parent: { id: 'parent-task-id', title: 'Epic Title', board_id: 'board-1', issue_type: 'epic', status: 'in_progress' },
    })
    renderSection(task)
    expect(screen.getByTestId('link-group-Child of')).toBeTruthy()
    expect(screen.getByText('Epic Title')).toBeTruthy()
  })

  it('"Child of" header has incoming direction', () => {
    const task = makeTask({
      parent_id: 'p1',
      parent: { id: 'p1', title: 'Parent Epic', board_id: 'board-1', issue_type: 'epic', status: 'todo' },
    })
    renderSection(task)
    expect(screen.getByTestId('link-group-Child of').dataset.direction).toBe('incoming')
  })

  it('does not show "Child of" group when task.parent is null', () => {
    renderSection(makeTask({ parent_id: null, parent: null }))
    expect(screen.queryByTestId('link-group-Child of')).toBeNull()
  })

  // ── hierarchy: Parent of ───────────────────────────────────────────────────

  it('shows "Parent of" group with sub_task titles when task.sub_tasks is non-empty', () => {
    const task = makeTask({
      sub_tasks: [
        { id: 'st-1', title: 'Child Story', is_completed: false, task_id: 'task-1', created_at: '' },
        { id: 'st-2', title: 'Child Bug', is_completed: true, task_id: 'task-1', created_at: '' },
      ],
    })
    renderSection(task)
    expect(screen.getByTestId('link-group-Parent of')).toBeTruthy()
    expect(screen.getByText('Child Story')).toBeTruthy()
    expect(screen.getByText('Child Bug')).toBeTruthy()
  })

  it('"Parent of" header has outgoing direction', () => {
    const task = makeTask({
      sub_tasks: [{ id: 'st-1', title: 'Child', is_completed: false, task_id: 'task-1', created_at: '' }],
    })
    renderSection(task)
    expect(screen.getByTestId('link-group-Parent of').dataset.direction).toBe('outgoing')
  })

  it('does not show "Parent of" group when task.sub_tasks is empty', () => {
    renderSection(makeTask({ sub_tasks: [] }))
    expect(screen.queryByTestId('link-group-Parent of')).toBeNull()
  })

  it('empty state hidden when only parent/sub_tasks present (no task links)', () => {
    const task = makeTask({
      parent: { id: 'p1', title: 'Epic', board_id: 'board-1', issue_type: 'epic', status: 'todo' },
    })
    renderSection(task)
    expect(screen.queryByText('No linked issues.')).toBeNull()
  })

  // ── add form ───────────────────────────────────────────────────────────────

  it('shows add form when Add is clicked', () => {
    renderSection(makeTask())
    fireEvent.click(screen.getByText(/Add/i))
    expect(screen.getByPlaceholderText('Search tasks…')).toBeTruthy()
    expect(screen.getByDisplayValue('Is blocker of')).toBeTruthy()
  })

  it('shows all link type options in select', () => {
    renderSection(makeTask())
    fireEvent.click(screen.getByText(/Add/i))
    const select = screen.getByDisplayValue('Is blocker of') as HTMLSelectElement
    const values = Array.from(select.options).map(o => o.value)
    expect(values).toContain('depends_on')
    expect(values).toContain('duplicates')
    expect(values).toContain('relates_to')
  })

  it('cancels adding on X click', () => {
    renderSection(makeTask())
    fireEvent.click(screen.getByText(/Add/i))
    expect(screen.getByPlaceholderText('Search tasks…')).toBeTruthy()
    const allButtons = screen.getAllByRole('button')
    const cancelBtn = allButtons[allButtons.length - 1]
    fireEvent.click(cancelBtn)
    expect(screen.queryByPlaceholderText('Search tasks…')).toBeNull()
  })

  it('calls removeLink.mutate when remove button clicked on a link row', () => {
    vi.mocked(useTaskLinks).mockReturnValue({
      data: [{
        id: 'link-99', source_id: 'task-1', target_id: 'task-2',
        link_type: 'relates_to', display_type: 'Is related to',
        linked_task: { id: 'task-2', title: 'Other task', status: 'done' },
        created_at: '',
      }],
      isLoading: false,
    } as ReturnType<typeof useTaskLinks>)
    renderSection(makeTask())
    const allButtons = screen.getAllByRole('button')
    const removeBtn = allButtons[allButtons.length - 1]
    fireEvent.click(removeBtn)
    expect(mockRemoveLink).toHaveBeenCalledWith('link-99')
  })

  it('shows search results in dropdown when typing', async () => {
    vi.mocked(useTaskSearch).mockReturnValue({
      data: [{ id: 'task-9', title: 'Alpha task', status: 'todo', board_id: 'board-1' }],
    } as ReturnType<typeof useTaskSearch>)
    renderSection(makeTask())
    fireEvent.click(screen.getByText(/Add/i))
    const input = screen.getByPlaceholderText('Search tasks…')
    fireEvent.change(input, { target: { value: 'alp' } })
    fireEvent.focus(input)
    await waitFor(() => { expect(screen.getByText('Alpha task')).toBeTruthy() })
  })

  it('shows loading state', () => {
    vi.mocked(useTaskLinks).mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useTaskLinks>)
    renderSection(makeTask())
    expect(screen.getByText('Loading…')).toBeTruthy()
  })

  it('renders the Linked Issues header', () => {
    renderSection(makeTask())
    expect(screen.getByText('Linked Issues')).toBeTruthy()
  })
})
