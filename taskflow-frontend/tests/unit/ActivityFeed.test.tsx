import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ActivityFeed from '../../src/components/ActivityFeed'
import type { ActivityEntry } from '../../src/types'

const mockExportBlob = vi.fn()

vi.mock('../../src/api/client', () => ({
  activityApi: {
    list: vi.fn().mockResolvedValue([]),
    exportBlob: (...args: unknown[]) => mockExportBlob(...args),
  },
}))

vi.mock('../../src/hooks/useActivity', () => ({
  useTaskActivity: vi.fn(),
}))

import { useTaskActivity } from '../../src/hooks/useActivity'
const mockUseTaskActivity = vi.mocked(useTaskActivity)

function makeEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: 1,
    entity_type: 'task',
    entity_id: 'task-1',
    entity_name: 'My Task',
    workspace_id: 'ws-1',
    actor_id: 'user-1',
    actor_name: 'alice',
    action: 'task_created',
    field: null,
    old_value: null,
    new_value: null,
    meta: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

function renderFeed() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ActivityFeed projectId="ws-1" taskId="task-1" />
    </QueryClientProvider>
  )
}

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockUseTaskActivity.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no entries', () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('renders actor name and action label for task_created', () => {
    mockUseTaskActivity.mockReturnValue({ data: [makeEntry()], isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText(/created this task/i)).toBeInTheDocument()
  })

  it('renders old_value → new_value for field changes', () => {
    mockUseTaskActivity.mockReturnValue({
      data: [makeEntry({ action: 'status_changed', field: 'status', old_value: 'todo', new_value: 'in_progress' })],
      isLoading: false,
    } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText('todo')).toBeInTheDocument()
    expect(screen.getByText('in_progress')).toBeInTheDocument()
  })

  it('renders filename for attachment_added', () => {
    mockUseTaskActivity.mockReturnValue({
      data: [makeEntry({ action: 'attachment_added', meta: { filename: 'photo.png', size_bytes: 1024 } })],
      isLoading: false,
    } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText('photo.png')).toBeInTheDocument()
    expect(screen.getByText(/added an attachment/i)).toBeInTheDocument()
  })

  it('renders snippet for comment_added', () => {
    mockUseTaskActivity.mockReturnValue({
      data: [makeEntry({ action: 'comment_added', meta: { snippet: 'Great work!' } })],
      isLoading: false,
    } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText('Great work!')).toBeInTheDocument()
  })

  it('renders tag name for tag_applied', () => {
    mockUseTaskActivity.mockReturnValue({
      data: [makeEntry({ action: 'tag_applied', meta: { tag_name: 'bug', tag_color: '#ff0000' } })],
      isLoading: false,
    } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText('bug')).toBeInTheDocument()
    expect(screen.getByText(/applied a tag/i)).toBeInTheDocument()
  })

  it('triggers CSV export on button click', async () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    mockExportBlob.mockResolvedValue(new Blob(['a,b'], { type: 'text/csv' }))

    const createObjectURL = vi.fn(() => 'blob:url')
    const revokeObjectURL = vi.fn()
    global.URL.createObjectURL = createObjectURL
    global.URL.revokeObjectURL = revokeObjectURL

    renderFeed()
    fireEvent.click(screen.getByTitle('Export as CSV'))

    await waitFor(() => {
      expect(mockExportBlob).toHaveBeenCalledWith('ws-1', 'task-1', 'csv')
    })
  })

  it('triggers JSON export on button click', async () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    mockExportBlob.mockResolvedValue(new Blob(['[]'], { type: 'application/json' }))

    const createObjectURL = vi.fn(() => 'blob:url')
    const revokeObjectURL = vi.fn()
    global.URL.createObjectURL = createObjectURL
    global.URL.revokeObjectURL = revokeObjectURL

    renderFeed()
    fireEvent.click(screen.getByTitle('Export as JSON'))

    await waitFor(() => {
      expect(mockExportBlob).toHaveBeenCalledWith('ws-1', 'task-1', 'json')
    })
  })

  it('renders category toggle buttons', () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()
    expect(screen.getByText('History')).toBeInTheDocument()
    expect(screen.getByText('Comments')).toBeInTheDocument()
    expect(screen.getByText('Attachments')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Subtasks')).toBeInTheDocument()
  })

  it('passes filtered actions when a category is toggled off', () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()

    // Toggle off "Comments" category
    fireEvent.click(screen.getByText('Comments'))

    // Hook should have been called with actions param (not undefined) after toggle
    const calls = mockUseTaskActivity.mock.calls
    const lastCall = calls[calls.length - 1]
    // 3rd arg is actions[]
    expect(lastCall[2]).toBeDefined()
    expect(lastCall[2]).not.toContain('comment_added')
  })

  it('passes undefined actions when all categories enabled', () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()

    const firstCall = mockUseTaskActivity.mock.calls[0]
    expect(firstCall[2]).toBeUndefined()
  })

  it('sort toggle changes label', () => {
    mockUseTaskActivity.mockReturnValue({ data: [], isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()

    expect(screen.getByText(/newest/i)).toBeInTheDocument()
    fireEvent.click(screen.getByTitle(/showing newest first/i))
    expect(screen.getByText(/oldest/i)).toBeInTheDocument()
  })

  it('reverses entry order when newest-first is toggled off', () => {
    const entries = [
      makeEntry({ id: 1, actor_name: 'first', created_at: '2026-01-01T00:00:00Z' }),
      makeEntry({ id: 2, actor_name: 'second', created_at: '2026-01-02T00:00:00Z' }),
    ]
    mockUseTaskActivity.mockReturnValue({ data: entries, isLoading: false } as ReturnType<typeof useTaskActivity>)
    renderFeed()

    // Default: newest first → reversed → 'second' appears before 'first' in DOM
    const names = screen.getAllByText(/first|second/).map(el => el.textContent)
    expect(names[0]).toBe('second')

    fireEvent.click(screen.getByTitle(/showing newest first/i))

    const namesAfter = screen.getAllByText(/first|second/).map(el => el.textContent)
    expect(namesAfter[0]).toBe('first')
  })
})
