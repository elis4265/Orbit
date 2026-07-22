// REQ-166 — dedicated Export & Import page
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ExportImportPage from '../../src/pages/ExportImportPage'

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [
      { id: 'p1', name: 'Exportia', key: 'EXP', owner_id: 'u1', created_at: '', mode: 'open' },
      { id: 'p2', name: 'Otherland', key: 'OTH', owner_id: 'u1', created_at: '', mode: 'open' },
    ],
  }),
}))

vi.mock('../../src/components/ImportSection', () => ({
  default: () => <div data-testid="import-section">csv-import-stub</div>,
}))

const TASKS = [
  { id: 't1', title: 'One', status: 'todo', issue_type: 'task', priority_id: null, position: 0, workspace_id: 'p1', assignee_id: null, due_date: null, version: 1, sub_tasks: [], tags: [], created_at: '', updated_at: '' },
  { id: 't2', title: 'Two', status: 'done', issue_type: 'task', priority_id: null, position: 1, workspace_id: 'p1', assignee_id: null, due_date: null, version: 1, sub_tasks: [], tags: [], created_at: '', updated_at: '' },
]

vi.mock('../../src/hooks/useTasks', () => ({
  useProjectTasks: () => ({ data: TASKS }),
}))
vi.mock('../../src/hooks/useProjectFilterFields', () => ({
  useProjectFilterFields: () => ({
    filterFields: [], isCustomMode: false, members: [], allTags: [], projectStatuses: [], priorityItems: [],
  }),
}))
// Stub the filter bar with a button that applies a status=done filter
vi.mock('../../src/components/SmartFilterBar', () => ({
  default: ({ onFiltersChange }: { onFiltersChange: (f: unknown[]) => void }) => (
    <button
      onClick={() => onFiltersChange([
        { instanceId: 'x', fieldId: 'status', fieldLabel: 'Status', value: 'done', label: 'Done', negate: false },
      ])}
    >
      apply-done-filter
    </button>
  ),
}))

const mockExportCsv = vi.fn().mockResolvedValue('key,title\nEXP-1,X\n')
const mockJiraImport = vi.fn().mockResolvedValue({ created: 2, errors: [{ entity: 'row 4', error: 'missing Summary' }] })
const mockTrelloImport = vi.fn().mockResolvedValue({ created: 5, errors: [] })
vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return {
    ...actual,
    taskApi: { ...actual.taskApi, exportCsv: (...args: unknown[]) => mockExportCsv(...args) },
    trackerImportApi: {
      jira: (...args: unknown[]) => mockJiraImport(...args),
      trello: (...args: unknown[]) => mockTrelloImport(...args),
    },
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
      <MemoryRouter initialEntries={['/projects/p1/export']}>
        <Routes>
          <Route path="/projects/:workspaceId/export" element={<ExportImportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('REQ-166 — ExportImportPage', () => {
  it('renders export column picker and import section', () => {
    renderPage()
    expect(screen.getByRole('checkbox', { name: 'title' })).toBeChecked()
    expect(screen.getByTestId('import-section')).toBeInTheDocument()
  })

  it('download calls the server with chosen fields and persists the choice', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'description' }))
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }))
    await waitFor(() => expect(mockExportCsv).toHaveBeenCalled())
    const [pid, fields] = mockExportCsv.mock.calls[0]
    expect(pid).toBe('p1')
    expect(fields).not.toContain('description')
    expect(localStorage.getItem('orbit_export_fields')).not.toContain('description')
    await waitFor(() => expect(downloadCsv).toHaveBeenCalled())
  })

  it('Jira import uploads a CSV and reports per-entity results (REQ-160)', async () => {
    renderPage()
    expect(screen.getByRole('button', { name: /import from jira/i })).toBeEnabled()
    const input = screen.getByTestId('jira-file-input')
    const file = new File(['Summary\nX\n'], 'jira.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(mockJiraImport).toHaveBeenCalled())
    expect(await screen.findByText(/2 tasks imported · 1 skipped/i)).toBeInTheDocument()
    expect(screen.getByText(/row 4: missing summary/i)).toBeInTheDocument()
  })

  it('Trello import uploads JSON (REQ-160)', async () => {
    renderPage()
    const input = screen.getByTestId('trello-file-input')
    const file = new File(['{}'], 'board.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(mockTrelloImport).toHaveBeenCalled())
    expect(await screen.findByText(/5 tasks imported/i)).toBeInTheDocument()
  })

  it('active filter narrows the export to matching task ids (REQ-166)', async () => {
    renderPage()
    expect(screen.getByText(/all 2 tasks will be exported/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'apply-done-filter' }))
    expect(screen.getByText(/1 of 2 tasks will be exported/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }))
    await waitFor(() => expect(mockExportCsv).toHaveBeenCalled())
    const [, , taskIds] = mockExportCsv.mock.calls[0]
    expect(taskIds).toEqual(['t2'])
  })

  it('no filter → server export without task ids (full dump)', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /download csv/i }))
    await waitFor(() => expect(mockExportCsv).toHaveBeenCalled())
    const [, , taskIds] = mockExportCsv.mock.calls[0]
    expect(taskIds).toBeUndefined()
  })

  it('project switcher navigates to the other project\'s export page', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: /project/i }), { target: { value: 'p2' } })
    // route re-renders the page under /projects/OTH/export — select shows Otherland
    expect(screen.getByRole('combobox', { name: /project/i })).toHaveValue('p2')
  })
})
