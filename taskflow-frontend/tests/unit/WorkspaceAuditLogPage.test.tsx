import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ProjectAuditLogPage from '../../src/pages/ProjectAuditLogPage'

const mockUseAuditLog = vi.fn()
const mockUseWorkspaceActivity = vi.fn()
const mockUseMembers = vi.fn()
const mockUseMe = vi.fn()
const mockUseWorkspaces = vi.fn()
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ workspaceId: 'ws-1' }) }
})

vi.mock('../../src/hooks/useAuditLog', () => ({
  useAuditLog: (...args: unknown[]) => mockUseAuditLog(...args),
}))

vi.mock('../../src/hooks/useActivity', () => ({
  useProjectActivity: (...args: unknown[]) => mockUseWorkspaceActivity(...args),
}))

vi.mock('../../src/hooks/useMembers', () => ({
  useMembers: (...args: unknown[]) => mockUseMembers(...args),
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useMe: () => mockUseMe(),
}))

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => mockUseWorkspaces(),
}))

vi.mock('../../src/api/client', () => ({
  activityApi: {
    exportWorkspaceBlob: vi.fn().mockResolvedValue(new Blob(['id,actor\n'], { type: 'text/csv' })),
    listWorkspace: vi.fn().mockResolvedValue({ items: [], total: 0, next_cursor: null }),
  },
  auditApi: {
    exportBlob: vi.fn().mockResolvedValue(new Blob(['id,actor\n'], { type: 'text/csv' })),
    list: vi.fn().mockResolvedValue({ items: [], total: 0, next_cursor: null }),
  },
}))

vi.mock('../../src/hooks/useBoards', () => ({
  useBoards: () => ({ data: [] }),
}))

vi.mock('../../src/hooks/useStats', () => ({
  useProjectStats: () => ({ data: undefined, isLoading: false }),
  useProjectBurndown: () => ({ data: [], isLoading: false }),
}))

vi.mock('../../src/components/StatsPanel', () => ({
  default: () => <div data-testid="stats-panel">Issue Distribution</div>,
}))

vi.mock('../../src/components/BurndownChart', () => ({
  default: () => <div data-testid="burndown-chart">Burndown</div>,
}))

const MOCK_USER = { id: 'u-1', username: 'alice', email: 'alice@test.io', is_verified: true }
const MOCK_WORKSPACE = { id: 'ws-1', name: 'Test WS', owner_id: 'u-1' }
const MOCK_MEMBERS = [
  { id: 'u-1', username: 'alice', email: 'alice@test.io', role: 'admin', joined_at: '2026-01-01' },
  { id: 'u-2', username: 'bob', email: 'bob@test.io', role: 'member', joined_at: '2026-01-02' },
]

// Audit trail items — workspace/board/member events
const MOCK_AUDIT_ITEMS = [
  {
    id: 1,
    workspace_id: 'ws-1',
    actor_id: 'u-1',
    actor_name: 'alice',
    action: 'workspace.renamed',
    entity_type: 'workspace',
    entity_id: 'ws-1',
    entity_name: 'My Workspace',
    meta: { old_name: 'Old WS', new_name: 'My Workspace' },
    created_at: '2026-06-14T10:00:00Z',
  },
  {
    id: 2,
    workspace_id: 'ws-1',
    actor_id: 'u-1',
    actor_name: 'alice',
    action: 'board.created',
    entity_type: 'board',
    entity_id: 'b-1',
    entity_name: 'Sprint 1',
    meta: null,
    created_at: '2026-06-14T09:00:00Z',
  },
]

// Activity items — task events (used in Reports ActivityLogSection)
const MOCK_ACTIVITY_ITEMS = [
  {
    id: 10,
    entity_type: 'task',
    entity_id: 't-1',
    entity_name: 'Fix login bug',
    workspace_id: 'ws-1',
    actor_id: 'u-2',
    actor_name: 'bob',
    action: 'task_created',
    field: null,
    old_value: null,
    new_value: null,
    meta: null,
    created_at: '2026-06-14T08:00:00Z',
  },
]

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workspaces/ws-1/audit']}>
      <Routes>
        <Route path="/workspaces/:workspaceId/audit" element={<ProjectAuditLogPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMe.mockReturnValue({ data: MOCK_USER })
  mockUseWorkspaces.mockReturnValue({ data: [MOCK_WORKSPACE] })
  mockUseMembers.mockReturnValue({ data: MOCK_MEMBERS })
  mockUseAuditLog.mockReturnValue({ data: { items: MOCK_AUDIT_ITEMS, total: 2 }, isLoading: false })
  mockUseWorkspaceActivity.mockReturnValue({ data: { items: MOCK_ACTIVITY_ITEMS, total: 1 }, isLoading: false })
})

describe('ProjectAuditLogPage — admin view', () => {
  it('renders Analytics page heading', () => {
    renderPage()
    expect(screen.getByText('Analytics')).toBeInTheDocument()
  })

  it('renders Audit Trail and Reports tabs for admin', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /audit trail/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reports/i })).toBeInTheDocument()
  })

  it('renders audit rows in table after clicking Audit Trail tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByText('My Workspace')).toBeInTheDocument()
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
  })

  it('renders actor names in audit table', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getAllByText('alice').length).toBeGreaterThanOrEqual(1)
  })

  it('renders action badges in audit table', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByText('workspace.renamed')).toBeInTheDocument()
    expect(screen.getByText('board.created')).toBeInTheDocument()
  })

  it('renders entity type prefix in audit table', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByText('[workspace]')).toBeInTheDocument()
    expect(screen.getByText('[board]')).toBeInTheDocument()
  })

  it('renders total entry count in audit tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByText(/2 entries/i)).toBeInTheDocument()
  })

  it('renders SmartFilterBar with actor, action, type fields in audit tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '@' } })
    expect(screen.getByText('@actor')).toBeInTheDocument()
    expect(screen.getByText('@action')).toBeInTheDocument()
    expect(screen.getByText('@type')).toBeInTheDocument()
  })

  it('renders entity name search input in audit tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByLabelText('Search by entity name')).toBeInTheDocument()
  })

  it('renders date From and To inputs in audit tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByLabelText('From')).toBeInTheDocument()
    expect(screen.getByLabelText('To')).toBeInTheDocument()
  })

  it('shows loading state in audit tab', () => {
    mockUseAuditLog.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('shows empty state when no audit entries', () => {
    mockUseAuditLog.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false })
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    expect(screen.getByText(/no audit entries/i)).toBeInTheDocument()
  })

  it('renders export CSV and JSON buttons in audit tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /audit trail/i }))
    const csvBtns = screen.getAllByRole('button', { name: /csv/i })
    const jsonBtns = screen.getAllByRole('button', { name: /json/i })
    expect(csvBtns.length).toBeGreaterThanOrEqual(1)
    expect(jsonBtns.length).toBeGreaterThanOrEqual(1)
  })
})

describe('ProjectAuditLogPage — non-admin view', () => {
  beforeEach(() => {
    mockUseMe.mockReturnValue({ data: { id: 'u-2', username: 'bob', email: 'bob@test.io', is_verified: true } })
    mockUseWorkspaces.mockReturnValue({ data: [MOCK_WORKSPACE] })
  })

  it('does not show Audit Trail tab for non-admin', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /audit trail/i })).not.toBeInTheDocument()
  })

  it('shows reports section for non-admin', () => {
    renderPage()
    expect(screen.getAllByText('Issue Distribution').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Burndown').length).toBeGreaterThanOrEqual(1)
  })

  it('renders no tab switcher when only Reports tab available', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /reports/i })).not.toBeInTheDocument()
  })
})

describe('ProjectAuditLogPage — reports tab', () => {
  it('shows activity log section and chart panels in Reports tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /reports/i }))
    expect(screen.getByText('Activity Log')).toBeInTheDocument()
    expect(screen.getAllByText('Issue Distribution').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Burndown').length).toBeGreaterThanOrEqual(1)
  })

  it('shows task activity rows in Reports activity section', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /reports/i }))
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('task_created')).toBeInTheDocument()
  })
})
