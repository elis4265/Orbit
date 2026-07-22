import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectSettingsPage from '../../src/pages/ProjectSettingsPage'

// ── mocks ────────────────────────────────────────────────────────────────────

const mockUpdateMode = { mutateAsync: vi.fn(), isPending: false }
const mockCreateStatus = { mutateAsync: vi.fn(), isPending: false }
const mockUpdateStatus = { mutate: vi.fn() }
const mockDeleteStatus = { mutate: vi.fn() }
const mockCreateTransition = { mutateAsync: vi.fn(), isPending: false }
const mockDeleteTransition = { mutate: vi.fn() }
const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../src/hooks/useProjectStatuses', () => ({
  useProjectStatuses: vi.fn(),
  useProjectTransitions: vi.fn(),
  useCreateProjectStatus: vi.fn(),
  useUpdateProjectStatus: vi.fn(),
  useDeleteProjectStatus: vi.fn(),
  useCreateTransition: vi.fn(),
  useDeleteTransition: vi.fn(),
  useUpdateProjectMode: vi.fn(),
  useUpdateCreationPolicy: () => ({ mutate: vi.fn(), isPending: false }),
}))

const mockUpdateHideDone = { mutate: vi.fn(), isPending: false }
const mockUpdateAutoArchive = { mutate: vi.fn(), isPending: false }
// HW-18
const mockUpdateDefaultAssignee = { mutateAsync: vi.fn(), isPending: false }

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: vi.fn(),
  useUpdateHideDoneAfterDays: () => mockUpdateHideDone,
  useUpdateAutoArchiveAfterDays: () => mockUpdateAutoArchive,
  useUpdateDefaultAssignee: () => mockUpdateDefaultAssignee,
}))

// HW-18: the Defaults tab picks a member from the project member list
const MEMBERS = [
  { id: 'u1', username: 'owner_ann', email: 'ann@x.io', role: 'owner' },
  { id: 'u2', username: 'dev_bob', email: 'bob@x.io', role: 'member' },
]
vi.mock('../../src/hooks/useMembers', () => ({
  useMembers: () => ({ data: MEMBERS }),
}))

// REQ-165: Members tab embeds the members management section
vi.mock('../../src/components/MembersSection', () => ({
  default: () => <div data-testid="members-section">members-section-stub</div>,
}))

vi.mock('../../src/hooks/usePriorities', () => ({
  useProjectPriorities: () => ({ data: [] }),
  useCreatePriorityItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePriorityItem: () => ({ mutate: vi.fn() }),
  useDeletePriorityItem: () => ({ mutate: vi.fn() }),
  useReorderPriorityItems: () => ({ mutate: vi.fn() }),
  useAssignPriorityScheme: () => ({ mutate: vi.fn() }),
  useGlobalPrioritySchemes: () => ({ data: [] }),
}))

import {
  useProjectStatuses,
  useProjectTransitions,
  useCreateProjectStatus,
  useUpdateProjectStatus,
  useDeleteProjectStatus,
  useCreateTransition,
  useDeleteTransition,
  useUpdateProjectMode,
} from '../../src/hooks/useProjectStatuses'
import { useProjects } from '../../src/hooks/useProjects'

const STATUSES = [
  { id: 's1', name: 'Backlog', color: '#6b7280', category: 'unstarted', position: 0 },
  { id: 's2', name: 'In Dev', color: '#7c6af7', category: 'started', position: 1 },
  { id: 's3', name: 'Shipped', color: '#22c55e', category: 'completed', position: 2 },
]

const TRANSITIONS = [
  { id: 't1', from_status_id: 's1', to_status_id: 's2', require_role: null },
]

function setupMocks(mode = 'open', statuses = STATUSES, transitions = TRANSITIONS, projectExtra = {}) {
  vi.mocked(useProjects).mockReturnValue({
    data: [{ id: 'proj-1', name: 'My Project', owner_id: 'u1', created_at: '', mode, ...projectExtra }],
  } as ReturnType<typeof useProjects>)
  vi.mocked(useProjectStatuses).mockReturnValue({ data: statuses } as ReturnType<typeof useProjectStatuses>)
  vi.mocked(useProjectTransitions).mockReturnValue({ data: transitions } as ReturnType<typeof useProjectTransitions>)
  vi.mocked(useCreateProjectStatus).mockReturnValue(mockCreateStatus as ReturnType<typeof useCreateProjectStatus>)
  vi.mocked(useUpdateProjectStatus).mockReturnValue(mockUpdateStatus as ReturnType<typeof useUpdateProjectStatus>)
  vi.mocked(useDeleteProjectStatus).mockReturnValue(mockDeleteStatus as ReturnType<typeof useDeleteProjectStatus>)
  vi.mocked(useCreateTransition).mockReturnValue(mockCreateTransition as ReturnType<typeof useCreateTransition>)
  vi.mocked(useDeleteTransition).mockReturnValue(mockDeleteTransition as ReturnType<typeof useDeleteTransition>)
  vi.mocked(useUpdateProjectMode).mockReturnValue(mockUpdateMode as ReturnType<typeof useUpdateProjectMode>)
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/proj-1/settings']}>
        <Routes>
          <Route path="/projects/:workspaceId/settings" element={<ProjectSettingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Mode tab ─────────────────────────────────────────────────────────────────

describe('ProjectSettingsPage — Mode tab', () => {
  it('renders 3 mode cards', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByText('Flow', { selector: 'span.font-bold' })).toBeInTheDocument()
    expect(screen.getByText('Guided')).toBeInTheDocument()
    expect(screen.getByText('Enforced')).toBeInTheDocument()
  })

  it('shows page heading', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByText('Project Settings')).toBeInTheDocument()
  })

  it('shows Mode/Statuses/Transitions tabs', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByRole('button', { name: 'Mode' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Statuses' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transitions' })).toBeInTheDocument()
  })

  it('clicking Guided calls updateMode.mutateAsync with "guided"', async () => {
    mockUpdateMode.mutateAsync.mockResolvedValue(undefined)
    setupMocks('open')
    renderPage()
    fireEvent.click(screen.getByText('Guided'))
    await waitFor(() => expect(mockUpdateMode.mutateAsync).toHaveBeenCalledWith({ mode: 'guided' }))
  })

  it('clicking Enforced calls updateMode.mutateAsync with "enforced"', async () => {
    mockUpdateMode.mutateAsync.mockResolvedValue(undefined)
    setupMocks('open')
    renderPage()
    fireEvent.click(screen.getByText('Enforced'))
    await waitFor(() => expect(mockUpdateMode.mutateAsync).toHaveBeenCalledWith({ mode: 'enforced' }))
  })

  it('clicking Open when already guided shows confirm dialog', async () => {
    setupMocks('guided')
    renderPage()
    fireEvent.click(screen.getByText('Flow', { selector: 'span.font-bold' }))
    expect(await screen.findByText('Switch to Open')).toBeInTheDocument()
  })

  it('confirm dialog calls updateMode.mutateAsync with "open"', async () => {
    mockUpdateMode.mutateAsync.mockResolvedValue(undefined)
    setupMocks('guided')
    renderPage()
    fireEvent.click(screen.getByText('Flow', { selector: 'span.font-bold' }))
    fireEvent.click(await screen.findByText('Switch to Open'))
    await waitFor(() => expect(mockUpdateMode.mutateAsync).toHaveBeenCalledWith({ mode: 'open' }))
  })

  it('Cancel in confirm dialog hides the dialog', async () => {
    setupMocks('guided')
    renderPage()
    fireEvent.click(screen.getByText('Flow', { selector: 'span.font-bold' }))
    await screen.findByText('Switch to Open')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Switch to Open')).not.toBeInTheDocument()
  })

  // Back-navigation chrome moved to the persistent AppShell (sidebar/top bar) —
  // the page itself no longer renders a Back button.
  it('renders no page-level Back button (shell owns navigation)', () => {
    setupMocks('open')
    renderPage()
    expect(screen.queryByLabelText('Back')).not.toBeInTheDocument()
  })
})

// ── Statuses tab ─────────────────────────────────────────────────────────────

describe('ProjectSettingsPage — Statuses tab', () => {
  function openStatuses(mode = 'open') {
    setupMocks(mode)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Statuses' }))
  }

  it('shows read-only notice in Open mode', () => {
    openStatuses('open')
    expect(screen.getByText(/flow mode uses fixed statuses/i)).toBeInTheDocument()
  })

  it('does not show add-status form in Open mode', () => {
    openStatuses('open')
    expect(screen.queryByPlaceholderText('Status name')).not.toBeInTheDocument()
  })

  it('shows status names from hook data', () => {
    openStatuses('guided')
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('In Dev')).toBeInTheDocument()
    expect(screen.getByText('Shipped')).toBeInTheDocument()
  })

  it('shows add-status form in Guided mode', () => {
    openStatuses('guided')
    expect(screen.getByPlaceholderText('Status name')).toBeInTheDocument()
  })

  it('Add button calls createStatus.mutateAsync', async () => {
    mockCreateStatus.mutateAsync.mockResolvedValue({})
    openStatuses('guided')
    fireEvent.change(screen.getByPlaceholderText('Status name'), { target: { value: 'Review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add status' }))
    await waitFor(() => expect(mockCreateStatus.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Review' })
    ))
  })

  it('Add button is disabled when name is empty', () => {
    openStatuses('guided')
    const addBtn = screen.getByRole('button', { name: 'Add status' })
    expect(addBtn).toBeDisabled()
  })
})

// ── Transitions tab ───────────────────────────────────────────────────────────

describe('ProjectSettingsPage — Transitions tab', () => {
  function openTransitions(mode = 'enforced', transitions = TRANSITIONS) {
    setupMocks(mode, STATUSES, transitions)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Transitions' }))
  }

  it('shows "not enforced" notice when mode is not enforced', () => {
    openTransitions('guided')
    expect(screen.getByText(/transition rules only apply in/i)).toBeInTheDocument()
  })

  it('does not show notice in enforced mode', () => {
    openTransitions('enforced')
    expect(screen.queryByText(/transition rules only apply in/i)).not.toBeInTheDocument()
  })

  it('shows existing transition rule as from→to', () => {
    openTransitions('enforced')
    expect(screen.getAllByText('Backlog').length).toBeGreaterThan(0)
    expect(screen.getAllByText('In Dev').length).toBeGreaterThan(0)
  })

  it('shows empty message when no transitions', () => {
    openTransitions('enforced', [])
    expect(screen.getByText(/no transition rules defined/i)).toBeInTheDocument()
  })

  it('Add Rule button is disabled until both selects filled', () => {
    openTransitions('enforced')
    const addBtn = screen.getByRole('button', { name: /add rule/i })
    expect(addBtn).toBeDisabled()
  })

  it('delete button calls deleteTransition.mutate', () => {
    openTransitions('enforced')
    fireEvent.click(screen.getByLabelText('Delete rule'))
    expect(mockDeleteTransition.mutate).toHaveBeenCalledWith('t1')
  })
})

// ── REQ-138 — Done column cleanup setting ────────────────────────────────────

describe('REQ-138 — Done column cleanup setting', () => {
  it('[REQ-138] renders the section with Off active when setting is null', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByText('Done column cleanup')).toBeInTheDocument()
    const off = screen.getAllByRole('button', { name: 'Off' })[0]
    expect(off.className).toContain('border-brand')
  })

  it('[REQ-138] clicking a period mutates hide_done_after_days', () => {
    setupMocks('open')
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: '30 days' })[0])
    expect(mockUpdateHideDone.mutate).toHaveBeenCalledWith({ id: 'proj-1', days: 30 })
  })

  it('[REQ-138] clicking Off clears the setting', () => {
    setupMocks('open')
    renderPage()
    fireEvent.click(screen.getAllByRole('button', { name: 'Off' })[0])
    expect(mockUpdateHideDone.mutate).toHaveBeenCalledWith({ id: 'proj-1', days: null })
  })

  it('[REQ-161] auto-archive control mutates auto_archive_after_days', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByText('Auto-archive completed tasks')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: '30 days' })[1])
    expect(mockUpdateAutoArchive.mutate).toHaveBeenCalledWith({ id: 'proj-1', days: 30 })
  })
})

// ── HW-18: Defaults tab (default assignee) ───────────────────────────────────

describe('HW-18 — Defaults tab', () => {
  function openDefaults(projectExtra = {}) {
    setupMocks('open', STATUSES, TRANSITIONS, projectExtra)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Defaults' }))
  }

  it('shows a Defaults tab', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByRole('button', { name: 'Defaults' })).toBeInTheDocument()
  })

  it('renders the three modes with Unassigned selected by default', () => {
    openDefaults()
    expect(screen.getByText('Default assignee')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Unassigned/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Creator/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Specific member/ })).not.toBeChecked()
  })

  it('reflects the project\'s stored mode', () => {
    openDefaults({ default_assignee_mode: 'creator' })
    expect(screen.getByRole('radio', { name: /Creator/ })).toBeChecked()
  })

  it('hides the member dropdown unless "Specific member" is chosen', () => {
    openDefaults()
    expect(screen.queryByLabelText('Default assignee member')).not.toBeInTheDocument()
  })

  it('choosing "Specific member" reveals the member dropdown', () => {
    openDefaults()
    fireEvent.click(screen.getByRole('radio', { name: /Specific member/ }))
    expect(screen.getByLabelText('Default assignee member')).toBeInTheDocument()
  })

  it('switching back away from "Specific member" hides the dropdown again', () => {
    openDefaults({ default_assignee_mode: 'member', default_assignee_id: 'u2' })
    expect(screen.getByLabelText('Default assignee member')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Creator/ }))
    expect(screen.queryByLabelText('Default assignee member')).not.toBeInTheDocument()
  })

  it('lists project members in the dropdown', () => {
    openDefaults({ default_assignee_mode: 'member', default_assignee_id: 'u2' })
    const select = screen.getByLabelText('Default assignee member') as HTMLSelectElement
    expect(select.value).toBe('u2')
    expect(screen.getByRole('option', { name: 'owner_ann' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'dev_bob' })).toBeInTheDocument()
  })

  it('Save calls the API with the chosen mode', async () => {
    mockUpdateDefaultAssignee.mutateAsync.mockResolvedValue({})
    openDefaults()
    fireEvent.click(screen.getByRole('radio', { name: /Creator/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockUpdateDefaultAssignee.mutateAsync).toHaveBeenCalledWith({
      id: 'proj-1', mode: 'creator', assigneeId: null,
    }))
  })

  it('Save sends the selected member for "Specific member"', async () => {
    mockUpdateDefaultAssignee.mutateAsync.mockResolvedValue({})
    openDefaults()
    fireEvent.click(screen.getByRole('radio', { name: /Specific member/ }))
    fireEvent.change(screen.getByLabelText('Default assignee member'), { target: { value: 'u2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockUpdateDefaultAssignee.mutateAsync).toHaveBeenCalledWith({
      id: 'proj-1', mode: 'member', assigneeId: 'u2',
    }))
  })

  it('Save is disabled while "Specific member" has nobody picked', () => {
    openDefaults()
    fireEvent.click(screen.getByRole('radio', { name: /Specific member/ }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('surfaces a server error message', async () => {
    mockUpdateDefaultAssignee.mutateAsync.mockRejectedValue({
      response: { data: { error: { message: 'The default assignee must be a member of this project.' } } },
    })
    openDefaults()
    fireEvent.click(screen.getByRole('radio', { name: /Creator/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/must be a member of this project/)).toBeInTheDocument()
  })

  it('?tab=defaults deep link opens the tab directly', () => {
    setupMocks('open')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/proj-1/settings?tab=defaults']}>
          <Routes>
            <Route path="/projects/:workspaceId/settings" element={<ProjectSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByText('Default assignee')).toBeInTheDocument()
  })
})

// ── REQ-165: Members tab ─────────────────────────────────────────────────────

describe('REQ-165 — Members tab in Project Settings', () => {
  it('shows a Members tab', () => {
    setupMocks('open')
    renderPage()
    expect(screen.getByRole('button', { name: 'Members' })).toBeInTheDocument()
  })

  it('clicking Members renders the members section', () => {
    setupMocks('open')
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Members' }))
    expect(screen.getByTestId('members-section')).toBeInTheDocument()
  })

  it('?tab=members deep link opens the tab directly', () => {
    setupMocks('open')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/projects/proj-1/settings?tab=members']}>
          <Routes>
            <Route path="/projects/:workspaceId/settings" element={<ProjectSettingsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByTestId('members-section')).toBeInTheDocument()
  })
})
