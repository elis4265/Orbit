import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SubtaskSection from '../../src/components/SubtaskSection'
import type { Task } from '../../src/types'

// REQ-164 added useQueryClient to SubtaskSection — renders need a provider
function render(node: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const mockUpdate = vi.fn().mockResolvedValue({})
let mockTasks: Partial<Task>[] = []

vi.mock('../../src/hooks/useTasks', () => ({
  useTasks: () => ({ data: mockTasks }),
  useCreateTask: () => ({ mutateAsync: vi.fn() }),
  useUpdateTask: () => ({ mutateAsync: mockUpdate }),
}))
vi.mock('../../src/components/CreateTaskModal', () => ({ default: () => null }))

const epic = { id: 'e1', title: 'Epic', issue_type: 'epic', project_key: 'ORB', sequence_number: 1 } as Task

beforeEach(() => {
  mockUpdate.mockClear()
  mockTasks = [
    epic,
    { id: 't2', title: 'Login bug', issue_type: 'bug', project_key: 'ORB', sequence_number: 2, version: 3, parent_id: null },
    { id: 'e2', title: 'Other epic', issue_type: 'epic', project_key: 'ORB', sequence_number: 3, version: 1 },
  ]
})

describe('SubtaskSection — add existing task to epic', () => {
  it('attaches an existing task as a child via parent_id update', async () => {
    render(<SubtaskSection task={epic} projectId="p1" boardId="b1" onOpenTask={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Existing/i }))
    fireEvent.change(screen.getByPlaceholderText(/search a task/i), { target: { value: 'login' } })
    fireEvent.click(screen.getByRole('button', { name: /Login bug/ }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith({
      taskId: 't2', data: { parent_id: 'e1', version: 3 },
    }))
  })

  it('excludes epics and self from the candidate list', () => {
    render(<SubtaskSection task={epic} projectId="p1" boardId="b1" onOpenTask={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Existing/i }))
    expect(screen.queryByRole('button', { name: /Other epic/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Login bug/ })).toBeInTheDocument()
  })
})
