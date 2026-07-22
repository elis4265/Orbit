// REQ-164 — promote a child task from the subtask section
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SubtaskSection from '../../src/components/SubtaskSection'
import type { Task } from '../../src/types'

const parent = {
  id: 'parent-1', title: 'Parent', status: 'todo', issue_type: 'story', priority_id: null,
  position: 0, workspace_id: 'p1', assignee_id: null, due_date: null, version: 1,
  sub_tasks: [], tags: [], sequence_number: 1, project_key: 'PRM', created_at: '', updated_at: '',
} as unknown as Task

const child = { ...parent, id: 'child-1', title: 'Checklist item', parent_id: 'parent-1', sequence_number: 2 }

vi.mock('../../src/hooks/useTasks', () => ({
  useTasks: vi.fn(() => ({ data: [] })),
  useCreateTask: () => ({ mutateAsync: vi.fn() }),
  useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('../../src/components/CreateTaskModal', () => ({ default: () => null }))

const mockPromote = vi.fn().mockResolvedValue({ id: 'child-1' })
vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return {
    ...actual,
    subtaskApi: { ...actual.subtaskApi, promote: (...args: unknown[]) => mockPromote(...args) },
  }
})

import { useTasks } from '../../src/hooks/useTasks'

beforeEach(() => vi.clearAllMocks())

describe('REQ-164 — subtask promotion UI', () => {
  it('promote button calls the promote endpoint for the child', async () => {
    vi.mocked(useTasks).mockReturnValue({ data: [parent, child] } as ReturnType<typeof useTasks>)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <SubtaskSection task={parent} projectId="p1" boardId="b1" onOpenTask={vi.fn()} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /promote checklist item/i }))
    await waitFor(() => expect(mockPromote).toHaveBeenCalledWith('p1', 'parent-1', 'child-1'))
  })

  it('promote does not open the child task', async () => {
    vi.mocked(useTasks).mockReturnValue({ data: [parent, child] } as ReturnType<typeof useTasks>)
    const onOpenTask = vi.fn()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <SubtaskSection task={parent} projectId="p1" boardId="b1" onOpenTask={onOpenTask} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /promote checklist item/i }))
    await waitFor(() => expect(mockPromote).toHaveBeenCalled())
    expect(onOpenTask).not.toHaveBeenCalled()
  })
})
