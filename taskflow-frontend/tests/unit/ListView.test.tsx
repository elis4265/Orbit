import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ListView from '../../src/components/ListView'
import type { Task, ProjectMember, Tag } from '../../src/types'

vi.mock('../../src/components/IssueTypeBadge', () => ({
  default: ({ type }: { type: string }) => <span data-testid="issue-type-badge">{type}</span>,
  ISSUE_TYPE_BORDER: { epic: '', story: '', task: '', bug: '' },
}))
vi.mock('../../src/components/Avatar', () => ({
  default: ({ username, email }: { username?: string | null; email?: string }) => (
    <span data-testid="assignee-avatar">{username ?? email}</span>
  ),
}))
vi.mock('../../src/components/TagPill', () => ({
  default: ({ tag }: { tag: Tag }) => <span data-testid="tag-pill">{tag.name}</span>,
}))

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Fix the bug',
  description: null,
  status: 'todo',
  issue_type: 'task',
  priority_id: null,
  position: 0,
  workspace_id: 'ws-1',
  board_id: 'b-1',
  assignee_id: null,
  due_date: null,
  version: 1,
  sub_tasks: [],
  tags: [],
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
  ...overrides,
})

const member: ProjectMember = {
  id: 'u-1',
  email: 'alice@example.com',
  username: 'alice',
  role: 'member',
  joined_at: '',
  first_name: 'Alice',
  last_name: 'Smith',
  avatar_url: null,
  initials: 'AS',
}

describe('ListView', () => {
  it('renders all column headers', () => {
    render(<ListView tasks={[]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText('Key / Title')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Priority')).toBeInTheDocument()
    expect(screen.getByText('Assignee')).toBeInTheDocument()
    expect(screen.getByText('Due Date')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
  })

  it('shows empty state when tasks array is empty', () => {
    render(<ListView tasks={[]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
  })

  it('renders one row per task', () => {
    const tasks = [
      makeTask({ id: '1', title: 'First task' }),
      makeTask({ id: '2', title: 'Second task' }),
    ]
    render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText('First task')).toBeInTheDocument()
    expect(screen.getByText('Second task')).toBeInTheDocument()
  })

  it('shows status label', () => {
    render(<ListView tasks={[makeTask({ status: 'in_progress' })]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
  })

  it('shows todo status label', () => {
    render(<ListView tasks={[makeTask({ status: 'todo' })]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText('To Do')).toBeInTheDocument()
  })

  it('shows done status label', () => {
    render(<ListView tasks={[makeTask({ status: 'done' })]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows priority name when priorityMap is provided', () => {
    const item = { id: 'p2', scheme_id: 's1', name: 'Critical', color: '#FF6B00', position: 1 }
    render(<ListView tasks={[makeTask({ priority_id: 'p2' })]} memberMap={{}} onRowClick={vi.fn()} priorityMap={{ p2: item }} />)
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('shows issue type badge', () => {
    render(<ListView tasks={[makeTask({ issue_type: 'bug' })]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByTestId('issue-type-badge')).toBeInTheDocument()
    expect(screen.getByTestId('issue-type-badge').textContent).toBe('bug')
  })

  it('shows assignee avatar when member is assigned', () => {
    const task = makeTask({ assignee_id: 'u-1' })
    render(<ListView tasks={[task]} memberMap={{ 'u-1': member }} onRowClick={vi.fn()} />)
    expect(screen.getByTestId('assignee-avatar')).toBeInTheDocument()
    expect(screen.getByTestId('assignee-avatar').textContent).toBe('alice')
  })

  it('shows dash when no assignee', () => {
    render(<ListView tasks={[makeTask()]} memberMap={{}} onRowClick={vi.fn()} />)
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('calls onRowClick with task when row is clicked', () => {
    const onRowClick = vi.fn()
    const task = makeTask()
    render(<ListView tasks={[task]} memberMap={{}} onRowClick={onRowClick} />)
    fireEvent.click(screen.getByText('Fix the bug'))
    expect(onRowClick).toHaveBeenCalledWith(task)
  })

  it('shows formatted due date', () => {
    const task = makeTask({ due_date: '2026-12-25T00:00:00' })
    render(<ListView tasks={[task]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByText(/Dec 25/)).toBeInTheDocument()
  })

  it('shows tag pills for tagged tasks', () => {
    const tag: Tag = {
      id: 't-1', name: 'frontend', color: '#7c6af7',
      visibility: 'workspace', workspace_id: 'ws-1', owner_id: 'u-1', created_at: '',
    }
    render(<ListView tasks={[makeTask({ tags: [tag] })]} memberMap={{}} onRowClick={vi.fn()} />)
    expect(screen.getByTestId('tag-pill')).toBeInTheDocument()
    expect(screen.getByText('frontend')).toBeInTheDocument()
  })

  // HW-22: people refer to issues by number. YouTrack style — the key leads the
  // title line rather than occupying a column of its own.
  describe('issue key', () => {
    it('shows the key ahead of the title, on the title line', () => {
      const task = makeTask({ title: 'Issues need keys', project_key: 'HW', sequence_number: 22 })
      render(<ListView tasks={[task]} memberMap={{}} onRowClick={vi.fn()} />)
      const key = screen.getByTestId('issue-key')
      expect(key).toHaveTextContent('HW-22')
      expect(key.closest('td')).toHaveTextContent('HW-22Issues need keys')
    })

    it('does not add a Key column', () => {
      render(<ListView tasks={[]} memberMap={{}} onRowClick={vi.fn()} />)
      expect(screen.queryByText('Key')).not.toBeInTheDocument()
    })

    it('shows a key per row', () => {
      const tasks = [
        makeTask({ id: '1', title: 'First', project_key: 'HW', sequence_number: 22 }),
        makeTask({ id: '2', title: 'Second', project_key: 'HW', sequence_number: 7 }),
      ]
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      expect(screen.getByText('HW-22')).toBeInTheDocument()
      expect(screen.getByText('HW-7')).toBeInTheDocument()
    })

    it('renders no key element when the task carries no number', () => {
      render(<ListView tasks={[makeTask()]} memberMap={{}} onRowClick={vi.fn()} />)
      expect(screen.queryByTestId('issue-key')).not.toBeInTheDocument()
    })

    it('strikes the key through when the issue is done', () => {
      const task = makeTask({ status: 'done', project_key: 'HW', sequence_number: 22 })
      render(<ListView tasks={[task]} memberMap={{}} onRowClick={vi.fn()} />)
      expect(screen.getByTestId('issue-key').className).toContain('line-through')
    })

    it('leaves the key un-struck while the issue is open', () => {
      const task = makeTask({ status: 'in_progress', project_key: 'HW', sequence_number: 22 })
      render(<ListView tasks={[task]} memberMap={{}} onRowClick={vi.fn()} />)
      expect(screen.getByTestId('issue-key').className).not.toContain('line-through')
    })

    it('keeps the key visible while the title is being edited', () => {
      const task = makeTask({ title: 'Editable', project_key: 'HW', sequence_number: 22 })
      render(<ListView tasks={[task]} memberMap={{}} onRowClick={vi.fn()} onUpdateTask={vi.fn()} />)
      fireEvent.click(screen.getByText('Editable'))
      expect(screen.getByRole('textbox')).toHaveValue('Editable')
      expect(screen.getByTestId('issue-key')).toHaveTextContent('HW-22')
    })
  })

  describe('sorting', () => {
    // HW-25 / DD-1: the Title header sorts by issue number, not title text.
    // Sequence order is set so it never coincides with alphabetical order —
    // Zebra(1), Apple(2), Mango(3) — so the two can't be confused.
    const tasks = [
      makeTask({ id: '1', title: 'Zebra', project_key: 'HW', sequence_number: 1 }),
      makeTask({ id: '2', title: 'Apple', project_key: 'HW', sequence_number: 2 }),
      makeTask({ id: '3', title: 'Mango', project_key: 'HW', sequence_number: 3 }),
    ]

    it('sorts by issue number ascending on first click', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveTextContent('Zebra')  // HW-1
      expect(rows[1]).toHaveTextContent('Apple')  // HW-2
      expect(rows[2]).toHaveTextContent('Mango')  // HW-3
    })

    it('sorts by issue number descending on second click', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveTextContent('Mango')  // HW-3
      expect(rows[2]).toHaveTextContent('Zebra')  // HW-1
    })

    it('resets to original order on third click', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveTextContent('Zebra')
      expect(rows[1]).toHaveTextContent('Apple')
      expect(rows[2]).toHaveTextContent('Mango')
    })

    it('shows ascending sort indicator on active column', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      expect(screen.getByLabelText('sort ascending')).toBeInTheDocument()
    })

    it('shows descending sort indicator on second click', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      expect(screen.getByLabelText('sort descending')).toBeInTheDocument()
    })

    it('no sort indicator after reset', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      expect(screen.queryByLabelText('sort ascending')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('sort descending')).not.toBeInTheDocument()
    })

    it('sorts by status in logical order (todo → in_progress → done)', () => {
      const statusTasks = [
        makeTask({ id: '1', title: 'Done task', status: 'done' }),
        makeTask({ id: '2', title: 'Todo task', status: 'todo' }),
        makeTask({ id: '3', title: 'WIP task',  status: 'in_progress' }),
      ]
      render(<ListView tasks={statusTasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Status'))
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveTextContent('Todo task')
      expect(rows[1]).toHaveTextContent('WIP task')
      expect(rows[2]).toHaveTextContent('Done task')
    })

    it('sorts by due date ascending (earliest first, nulls last)', () => {
      const dateTasks = [
        makeTask({ id: '1', title: 'No date',   due_date: null }),
        makeTask({ id: '2', title: 'Far future', due_date: '2027-01-01T00:00:00' }),
        makeTask({ id: '3', title: 'Near future', due_date: '2026-06-01T00:00:00' }),
      ]
      render(<ListView tasks={dateTasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Due Date'))
      const rows = screen.getAllByRole('row').slice(1)
      expect(rows[0]).toHaveTextContent('Near future')
      expect(rows[1]).toHaveTextContent('Far future')
      expect(rows[2]).toHaveTextContent('No date')
    })

    it('switching sort field resets direction to ascending', () => {
      render(<ListView tasks={tasks} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title')) // now desc
      fireEvent.click(screen.getByText('Due Date')) // new field → asc
      expect(screen.getByLabelText('sort ascending')).toBeInTheDocument()
    })
  })
})

// ── REQ-157: multi-select ─────────────────────────────────────────────────────

describe('REQ-157 — ListView selection', () => {
  const three = [
    makeTask({ id: 'a', title: 'Alpha' }),
    makeTask({ id: 'b', title: 'Beta' }),
    makeTask({ id: 'c', title: 'Gamma' }),
  ]

  it('ctrl-click toggles selection instead of opening', () => {
    const onRowClick = vi.fn()
    const onSelectionChange = vi.fn()
    render(
      <ListView tasks={three} memberMap={{}} onRowClick={onRowClick}
                selectedIds={new Set()} onSelectionChange={onSelectionChange} />
    )
    fireEvent.click(screen.getByText('Beta').closest('tr')!, { ctrlKey: true })
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['b']))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('shift-click selects the range from the anchor', () => {
    const onSelectionChange = vi.fn()
    const { rerender } = render(
      <ListView tasks={three} memberMap={{}} onRowClick={vi.fn()}
                selectedIds={new Set()} onSelectionChange={onSelectionChange} />
    )
    fireEvent.click(screen.getByText('Alpha').closest('tr')!, { ctrlKey: true })
    rerender(
      <ListView tasks={three} memberMap={{}} onRowClick={vi.fn()}
                selectedIds={new Set(['a'])} onSelectionChange={onSelectionChange} />
    )
    fireEvent.click(screen.getByText('Gamma').closest('tr')!, { shiftKey: true })
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set(['a', 'b', 'c']))
  })

  it('plain click still opens the task', () => {
    const onRowClick = vi.fn()
    render(
      <ListView tasks={three} memberMap={{}} onRowClick={onRowClick}
                selectedIds={new Set()} onSelectionChange={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Alpha').closest('tr')!)
    expect(onRowClick).toHaveBeenCalled()
  })

  it('selected rows are marked', () => {
    render(
      <ListView tasks={three} memberMap={{}} onRowClick={vi.fn()}
                selectedIds={new Set(['b'])} onSelectionChange={vi.fn()} />
    )
    expect(screen.getByText('Beta').closest('tr')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Alpha').closest('tr')).toHaveAttribute('aria-selected', 'false')
  })

  // HW-25 — DD-1: the key leads the Title cell, so the Title header sorts by issue
  // number (creation order), not alphabetically. Input order and alphabetical order
  // are both made distinct from sequence order so the three can never be confused.
  describe('sorting by issue number (HW-25)', () => {
    const unsorted = [
      makeTask({ id: 'b', title: 'Apple', project_key: 'HW', sequence_number: 2 }),
      makeTask({ id: 'c', title: 'Mango', project_key: 'HW', sequence_number: 3 }),
      makeTask({ id: 'a', title: 'Zebra', project_key: 'HW', sequence_number: 1 }),
    ]

    const keyOrder = () =>
      screen.getAllByTestId('issue-key').map((el) => el.textContent)

    it('is unsorted until the Title header is clicked', () => {
      render(<ListView tasks={unsorted} memberMap={{}} onRowClick={vi.fn()} />)
      expect(keyOrder()).toEqual(['HW-2', 'HW-3', 'HW-1'])
    })

    it('first click sorts by issue number ascending, not by title text', () => {
      render(<ListView tasks={unsorted} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      // sequence asc → HW-1, HW-2, HW-3 (Zebra, Apple, Mango).
      // alphabetical would have been HW-2, HW-3, HW-1 (Apple, Mango, Zebra).
      expect(keyOrder()).toEqual(['HW-1', 'HW-2', 'HW-3'])
    })

    it('second click reverses to descending', () => {
      render(<ListView tasks={unsorted} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      fireEvent.click(screen.getByText('Key / Title'))
      expect(keyOrder()).toEqual(['HW-3', 'HW-2', 'HW-1'])
    })

    it('third click clears the sort, restoring the original order', () => {
      render(<ListView tasks={unsorted} memberMap={{}} onRowClick={vi.fn()} />)
      const title = screen.getByText('Key / Title')
      fireEvent.click(title)
      fireEvent.click(title)
      fireEvent.click(title)
      expect(keyOrder()).toEqual(['HW-2', 'HW-3', 'HW-1'])
    })

    it('never drops or adds a row while sorting', () => {
      render(<ListView tasks={unsorted} memberMap={{}} onRowClick={vi.fn()} />)
      fireEvent.click(screen.getByText('Key / Title'))
      expect(screen.getAllByTestId('issue-key')).toHaveLength(3)
    })
  })

})
