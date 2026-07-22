import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CalendarView from '../../src/components/CalendarView'
import type { Task } from '../../src/types'

// Pin "today" to 2026-06-15 so month-header and due-date assertions stay stable
const FIXED_DATE = new Date('2026-06-15T12:00:00Z')
beforeAll(() => vi.useFakeTimers({ now: FIXED_DATE }))
afterAll(() => vi.useRealTimers())

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    title: 'Test Task',
    description: null,
    status: 'todo',
    issue_type: 'task',
    priority: 3,
    position: 0,
    workspace_id: 'ws-1',
    board_id: 'b-1',
    assignee_id: null,
    due_date: null,
    parent_id: null,
    sprint_id: null,
    version: 1,
    sub_tasks: [],
    tags: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

describe('CalendarView', () => {
  it('renders month/year heading', () => {
    render(<CalendarView tasks={[]} onTaskClick={vi.fn()} />)
    expect(screen.getByText(/june 2026/i)).toBeInTheDocument()
  })

  it('renders day-of-week headers', () => {
    render(<CalendarView tasks={[]} onTaskClick={vi.fn()} />)
    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('renders task pill on due date', () => {
    const task = makeTask({ due_date: '2026-06-15T00:00:00Z', title: 'My Task' })
    render(<CalendarView tasks={[task]} onTaskClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'My Task' })).toBeInTheDocument()
  })

  it('does not render tasks without due_date', () => {
    const task = makeTask({ due_date: null, title: 'No Due Date Task' })
    render(<CalendarView tasks={[task]} onTaskClick={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'No Due Date Task' })).not.toBeInTheDocument()
  })

  it('clicking a task pill calls onTaskClick', () => {
    const onTaskClick = vi.fn()
    const task = makeTask({ due_date: '2026-06-15T00:00:00Z', title: 'Clickable Task' })
    render(<CalendarView tasks={[task]} onTaskClick={onTaskClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Clickable Task' }))
    expect(onTaskClick).toHaveBeenCalledWith(task)
  })

  it('navigates to previous month on clicking left arrow', () => {
    render(<CalendarView tasks={[]} onTaskClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText(/may 2026/i)).toBeInTheDocument()
  })

  it('navigates to next month on clicking right arrow', () => {
    render(<CalendarView tasks={[]} onTaskClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText(/july 2026/i)).toBeInTheDocument()
  })

  it('shows +N overflow for more than 3 tasks on same day', () => {
    const tasks = [1, 2, 3, 4].map(i =>
      makeTask({ id: `t-${i}`, title: `Task ${i}`, due_date: '2026-06-10T00:00:00Z' })
    )
    render(<CalendarView tasks={tasks} onTaskClick={vi.fn()} />)
    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })
})
