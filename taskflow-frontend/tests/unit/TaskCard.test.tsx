import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import TaskCard from '../../src/components/TaskCard'
import type { Task, PriorityItem } from '../../src/types'

const task: Task = {
  id: 'task-1',
  title: 'Fix the bug',
  description: 'It is very broken',
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
  created_at: '',
  updated_at: '',
  sequence_number: 7,
  project_key: 'ORB',
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <DndContext>
      <SortableContext items={['task-1']}>{children}</SortableContext>
    </DndContext>
  )
}

describe('TaskCard', () => {
  it('renders title and description', () => {
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByText('Fix the bug')).toBeInTheDocument()
    expect(screen.getByText('It is very broken')).toBeInTheDocument()
  })

  it('shows priority badge when priorityItem prop is passed', () => {
    const priorityItem: PriorityItem = { id: 'p1', scheme_id: 's1', name: 'Major', color: '#FFC200', position: 2 }
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} priorityItem={priorityItem} />, { wrapper: Wrapper })
    expect(screen.getByText('Major')).toBeInTheDocument()
  })

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn()
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={onClick} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByText('Fix the bug'))
    expect(onClick).toHaveBeenCalledWith(task)
  })

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn()
    render(<TaskCard task={task} onDelete={onDelete} onClick={vi.fn()} />, { wrapper: Wrapper })
    fireEvent.click(screen.getByLabelText('Delete task'))
    expect(onDelete).toHaveBeenCalledWith('task-1')
  })

  it('shows due date when set', () => {
    const withDate = { ...task, due_date: '2026-12-31T00:00:00' }
    render(<TaskCard task={withDate} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByText(/31/)).toBeInTheDocument()
  })

  it('shows assignee avatar with first letter and tooltip when assignee is provided', () => {
    const assignee = { id: 'u-2', email: 'alice@example.com', username: 'alice', role: 'member' as const, joined_at: '', first_name: null, last_name: null, avatar_url: null, initials: 'A' }
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} assignee={assignee} />, { wrapper: Wrapper })
    const avatar = screen.getByTitle('alice')
    expect(avatar).toBeInTheDocument()
    expect(avatar.textContent).toBe('A')
  })

  it('does not render avatar when assignee is absent', () => {
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.queryByTestId('assignee-avatar')).not.toBeInTheDocument()
  })

  // REQ-SEQ05
  it('shows project key and sequence number as identifier', () => {
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByText('ORB-7')).toBeInTheDocument()
  })

  it('identifier is in top-left before the title', () => {
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    const identifier = screen.getByText('ORB-7')
    const title = screen.getByText('Fix the bug')
    expect(identifier.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('issue type badge is present', () => {
    render(<TaskCard task={task} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    // IssueTypeBadge renders an svg icon — verify the wrapper is in the DOM
    expect(document.querySelector('[data-issue-type]')).toBeInTheDocument()
  })

  it('renders identifier with different sequence numbers correctly', () => {
    const task42 = { ...task, sequence_number: 42, project_key: 'PROJ' }
    render(<TaskCard task={task42} onDelete={vi.fn()} onClick={vi.fn()} />, { wrapper: Wrapper })
    expect(screen.getByText('PROJ-42')).toBeInTheDocument()
  })
})
