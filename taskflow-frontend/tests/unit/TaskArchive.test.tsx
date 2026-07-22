// REQ-161 — archive/restore in the task ⋯ menu + archived view on Issues page
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TaskActionsMenu from '../../src/components/TaskActionsMenu'
import IssuesPage from '../../src/pages/IssuesPage'

const mockArchive = vi.fn().mockResolvedValue({})
const mockUnarchive = vi.fn().mockResolvedValue({})
const mockListArchived = vi.fn().mockResolvedValue([
  { id: 'a1', title: 'Dusty', project_key: 'EXP', sequence_number: 9, archived_at: '2026-01-01' },
])
vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return {
    ...actual,
    projectTaskApi: {
      ...actual.projectTaskApi,
      archive: (...a: unknown[]) => mockArchive(...a),
      unarchive: (...a: unknown[]) => mockUnarchive(...a),
      listArchived: (...a: unknown[]) => mockListArchived(...a),
    },
  }
})

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p1', name: 'X', key: 'EXP', owner_id: 'u1', created_at: '', mode: 'open' }] }),
}))
vi.mock('../../src/hooks/useTasks', () => ({ useProjectTasks: () => ({ data: [], isLoading: false }) }))
vi.mock('../../src/hooks/useProjectFilterFields', () => ({
  useProjectFilterFields: () => ({ filterFields: [], isCustomMode: false, members: [], allTags: [], projectStatuses: [], priorityItems: [] }),
}))
vi.mock('../../src/components/SmartFilterBar', () => ({ default: () => null }))

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('REQ-161 — archive UI', () => {
  it('done task offers Archive in the ⋯ menu', async () => {
    render(withQc(
      <TaskActionsMenu projectId="p1" taskId="t1" onActionDone={vi.fn()} taskStatus="done" archivedAt={null} />
    ))
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    fireEvent.click(screen.getByText('Archive task'))
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith('p1', 't1'))
  })

  it('open task offers no archive; archived task offers Restore', () => {
    const { unmount } = render(withQc(
      <TaskActionsMenu projectId="p1" taskId="t1" onActionDone={vi.fn()} taskStatus="todo" archivedAt={null} />
    ))
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    expect(screen.queryByText('Archive task')).not.toBeInTheDocument()
    unmount()

    render(withQc(
      <TaskActionsMenu projectId="p1" taskId="t1" onActionDone={vi.fn()} taskStatus="done" archivedAt="2026-01-01" />
    ))
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    expect(screen.getByText('Restore from archive')).toBeInTheDocument()
  })

  it('Issues page archived view lists and restores', async () => {
    render(withQc(
      <MemoryRouter initialEntries={['/projects/p1/issues']}>
        <Routes>
          <Route path="/projects/:workspaceId/issues" element={<IssuesPage />} />
        </Routes>
      </MemoryRouter>
    ))
    fireEvent.click(screen.getByRole('button', { name: /archived/i }))
    expect(await screen.findByText('Dusty')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /restore dusty/i }))
    await waitFor(() => expect(mockUnarchive).toHaveBeenCalledWith('p1', 'a1'))
  })
})
