// REQ-159 — Issues page: single-filter surface + export dialog (DD-051)
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import IssuesPage from '../../src/pages/IssuesPage'

const TASKS = [
  {
    id: 't1', title: 'Fix login', status: 'todo', issue_type: 'bug', priority_id: null,
    position: 0, workspace_id: 'p1', assignee_id: null, due_date: null, version: 1,
    sub_tasks: [], tags: [], sequence_number: 1, project_key: 'EXP',
    created_at: '', updated_at: '',
  },
  {
    id: 't2', title: 'Ship docs', status: 'done', issue_type: 'task', priority_id: null,
    position: 1, workspace_id: 'p1', assignee_id: null, due_date: null, version: 1,
    sub_tasks: [], tags: [], sequence_number: 2, project_key: 'EXP',
    created_at: '', updated_at: '',
  },
]

vi.mock('../../src/hooks/useTasks', () => ({
  useProjectTasks: () => ({ data: TASKS, isLoading: false }),
}))
vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p1', name: 'Exportia', key: 'EXP', owner_id: 'u1', created_at: '', mode: 'open' }] }),
}))
vi.mock('../../src/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))
vi.mock('../../src/hooks/useTags', () => ({ useTags: () => ({ data: [] }) }))
vi.mock('../../src/hooks/useProjectStatuses', () => ({ useProjectStatuses: () => ({ data: [] }) }))
vi.mock('../../src/hooks/usePriorities', () => ({ useProjectPriorities: () => ({ data: [] }) }))

const mockExportCsv = vi.fn().mockResolvedValue('key,title\nEXP-1,Fix login\n')
vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return {
    ...actual,
    taskApi: { ...actual.taskApi, exportCsv: (...args: unknown[]) => mockExportCsv(...args) },
  }
})

vi.mock('../../src/lib/csvExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/csvExport')>()
  return { ...actual, downloadCsv: vi.fn() }
})

import { downloadCsv } from '../../src/lib/csvExport'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/p1/issues']}>
        <Routes>
          <Route path="/projects/:workspaceId/issues" element={<IssuesPage />} />
          <Route path="/projects/:workspaceId/export" element={<div data-testid="export-page-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('REQ-159 — IssuesPage', () => {
  it('lists all project tasks with a count', () => {
    renderPage()
    expect(screen.getByText('Fix login')).toBeInTheDocument()
    expect(screen.getByText('Ship docs')).toBeInTheDocument()
    expect(screen.getByText(/2 issues/i)).toBeInTheDocument()
  })

  it('Export view downloads a client-side CSV of current rows', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /export view/i }))
    expect(downloadCsv).toHaveBeenCalled()
    const [, csv] = vi.mocked(downloadCsv).mock.calls[0]
    expect(csv).toContain('Fix login')
    expect(csv).toContain('Ship docs')
  })

  it('Export all navigates to the Export & Import page (REQ-166)', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /export all/i }))
    expect(screen.getByTestId('export-page-probe')).toBeInTheDocument()
  })
})
