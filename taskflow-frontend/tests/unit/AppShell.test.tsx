// Persistent app shell: Sidebar + TopBar frame with pages in an <Outlet/>.
// Frameless routes (login/register/share/…) must never render the frame.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppShell, { useAppShell } from '../../src/components/AppShell'
import App from '../../src/App'

const USER = {
  id: 'u1', email: 'anon@test.io', username: 'anon', first_name: 'A', last_name: 'Non',
  avatar_url: null, initials: 'AN', is_verified: true, is_superuser: true, created_at: '',
}
// 'Loading Game' deliberately first: the landing tests below prove the
// remembered project wins over list order.
const PROJECTS = [
  { id: 'p0', name: 'Loading Game', key: 'LG', owner_id: 'u1', created_at: '', mode: 'open' },
  { id: 'p1', name: 'Orbit Core', key: 'ORB', owner_id: 'u1', created_at: '', mode: 'open' },
]

vi.mock('../../src/hooks/useAuth', () => ({
  useMe: () => ({ data: USER }),
  useLogout: () => vi.fn(),
}))
vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({ data: PROJECTS, isLoading: false }),
  useCreateProject: () => ({ mutateAsync: vi.fn() }),
  useRenameProject: () => ({ mutateAsync: vi.fn() }),
  useDeleteProject: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('../../src/hooks/useNotifications', () => ({
  useUnreadCount: () => ({ data: { count: 3 } }),
}))
// HW-37: TopBar reads members to decide whether to render admin-only controls
vi.mock('../../src/hooks/useMembers', () => ({
  useMembers: () => ({ data: [] }),
}))
vi.mock('../../src/components/SearchBar', () => ({
  default: () => <div data-testid="search-bar" />,
}))
vi.mock('../../src/components/NotificationPanel', () => ({
  default: () => <div data-testid="notif-panel" />,
}))

// App-level routing checks: pages stubbed to probes so <App/> renders without a backend.
vi.mock('../../src/pages/LoginPage', () => ({ default: () => <div data-testid="page-login" /> }))
vi.mock('../../src/pages/RegisterPage', () => ({ default: () => <div data-testid="page-register" /> }))
vi.mock('../../src/pages/VerifyEmailPage', () => ({ default: () => <div data-testid="page-verify" /> }))
vi.mock('../../src/pages/BoardPage', () => ({ default: () => <div data-testid="page-board" /> }))
vi.mock('../../src/pages/AcceptInvitePage', () => ({ default: () => <div data-testid="page-invite" /> }))
vi.mock('../../src/pages/MembersPage', () => ({ default: () => <div data-testid="page-members-stub" /> }))
vi.mock('../../src/pages/UserPreferencesPage', () => ({ default: () => <div data-testid="page-prefs" /> }))
vi.mock('../../src/pages/MyWorkPage', () => ({ default: () => <div data-testid="page-my-work" /> }))
vi.mock('../../src/pages/DashboardPage', () => ({ default: () => <div data-testid="page-dashboard" /> }))
vi.mock('../../src/pages/ProjectAuditLogPage', () => ({ default: () => <div data-testid="page-audit" /> }))
vi.mock('../../src/pages/ProjectSettingsPage', () => ({ default: () => <div data-testid="page-settings" /> }))
vi.mock('../../src/pages/InstanceAdminPage', () => ({ default: () => <div data-testid="page-admin" /> }))
vi.mock('../../src/pages/IssuesPage', () => ({ default: () => <div data-testid="page-issues" /> }))
vi.mock('../../src/pages/ExportImportPage', () => ({ default: () => <div data-testid="page-export" /> }))
vi.mock('../../src/pages/PublicSharePage', () => ({ default: () => <div data-testid="page-share" /> }))
vi.mock('../../src/pages/HelpPage', () => ({ default: () => <div data-testid="page-help" /> }))

function ShellConsumerProbe() {
  const shell = useAppShell()
  return (
    <button onClick={() => shell?.toggleNotifications()}>toggle-notifs-from-page</button>
  )
}

function renderShell(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div data-testid="outlet-root" />} />
          <Route path="/my-work" element={<div data-testid="outlet-my-work" />} />
          <Route path="/dashboard" element={<div data-testid="outlet-dashboard" />} />
          <Route path="/projects/:workspaceId/issues" element={<div data-testid="outlet-issues" />} />
          <Route path="/projects/:workspaceId" element={<ShellConsumerProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('AppShell — frame composition', () => {
  it('renders sidebar, top bar, and the routed page in the outlet', () => {
    renderShell('/my-work')
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument()
    expect(screen.getByText('Orbit')).toBeInTheDocument()               // logo wordmark
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()                   // unread badge
    expect(screen.getByTestId('outlet-my-work')).toBeInTheDocument()
    // No project in the URL → no project section in the sidebar
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
  })

  it('derives the sidebar project section from the project URL segment', () => {
    renderShell('/projects/ORB/issues')
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issues' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Board' })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Orbit Core')).toBeInTheDocument()          // project selector shows it
    expect(screen.getByTestId('outlet-issues')).toBeInTheDocument()
  })

  it('Board nav item is active only on the exact board page', () => {
    renderShell('/projects/ORB')
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Issues' })).not.toHaveAttribute('aria-current')
  })

  it('remembers the last visited project and keeps the frame populated on global pages', () => {
    const { unmount } = renderShell('/projects/ORB/issues')
    expect(localStorage.getItem('orbit.lastProjectSeg')).toBe('ORB')
    unmount()

    renderShell('/my-work')
    expect(screen.getByText('Project')).toBeInTheDocument()             // section survives
    expect(screen.getByText('Orbit Core')).toBeInTheDocument()          // selector, not "No project"
    expect(screen.getByRole('button', { name: 'My Work' })).toHaveAttribute('aria-current', 'page')
    // and nothing in the project section falsely lights up
    for (const label of ['Board', 'Issues', 'Analytics', 'Members', 'Export & Import', 'Settings']) {
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('aria-current')
    }
  })

  it("at '/' prefers the remembered project over the first in the list", () => {
    localStorage.setItem('orbit.lastProjectSeg', 'ORB')
    renderShell('/')
    expect(screen.getByText('Orbit Core')).toBeInTheDocument()
    expect(screen.queryByText('Loading Game')).not.toBeInTheDocument()
    // The fallback render must not clobber the stored value (the old bug:
    // landing at '/' overwrote it with the first project).
    expect(localStorage.getItem('orbit.lastProjectSeg')).toBe('ORB')
  })

  it("at '/' falls back to the first project when nothing is remembered", () => {
    renderShell('/')
    expect(screen.getByText('Loading Game')).toBeInTheDocument()
    // A fallback pick is not a visit — nothing gets persisted.
    expect(localStorage.getItem('orbit.lastProjectSeg')).toBeNull()
  })

  it("at '/' falls back to the first project when the remembered one is gone", () => {
    localStorage.setItem('orbit.lastProjectSeg', 'GONE')
    renderShell('/')
    expect(screen.getByText('Loading Game')).toBeInTheDocument()
  })

  it('ignores a remembered project that no longer exists', () => {
    localStorage.setItem('orbit.lastProjectSeg', 'GONE')
    renderShell('/my-work')
    expect(screen.queryByText('Project')).not.toBeInTheDocument()
    expect(screen.getByText('No project')).toBeInTheDocument()
  })

  it('active nav item follows navigation while the frame persists', () => {
    renderShell('/my-work')
    expect(screen.getByRole('button', { name: 'My Work' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.getByTestId('outlet-dashboard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'My Work' })).not.toHaveAttribute('aria-current')
  })

  it('bell toggles the notification panel', () => {
    renderShell('/my-work')
    expect(screen.queryByTestId('notif-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.getByTestId('notif-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(screen.queryByTestId('notif-panel')).not.toBeInTheDocument()
  })

  it('pages can toggle notifications through the outlet context (keybinding path)', () => {
    renderShell('/projects/ORB')
    fireEvent.click(screen.getByRole('button', { name: 'toggle-notifs-from-page' }))
    expect(screen.getByTestId('notif-panel')).toBeInTheDocument()
  })

  it('user menu offers Profile, Instance Admin (superuser) and Log Out', () => {
    renderShell('/my-work')
    fireEvent.click(screen.getByRole('button', { name: 'User menu' }))
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Instance Admin')).toBeInTheDocument()
    expect(screen.getByText('Log Out')).toBeInTheDocument()
  })
})

describe('App routes — shell vs frameless', () => {
  function renderAppAt(path: string) {
    window.history.pushState({}, '', path)
    return render(<App />)
  }

  it.each([
    ['/login', 'page-login'],
    ['/register', 'page-register'],
    ['/verify-email', 'page-verify'],
    ['/share/some-token', 'page-share'],
    ['/invites/some-token', 'page-invite'],
  ])('%s renders frameless (no sidebar, no top bar)', (path, probe) => {
    renderAppAt(path)
    expect(screen.getByTestId(probe)).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('members redirect stub stays frameless', () => {
    localStorage.setItem('access_token', 't')
    renderAppAt('/projects/ORB/members')
    expect(screen.getByTestId('page-members-stub')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument()
  })

  it.each([
    ['/', 'page-board'],
    ['/projects/ORB', 'page-board'],
    ['/projects/ORB/issues', 'page-issues'],
    ['/projects/ORB/export', 'page-export'],
    ['/projects/ORB/audit-log', 'page-audit'],
    ['/projects/ORB/settings', 'page-settings'],
    ['/preferences', 'page-prefs'],
    ['/my-work', 'page-my-work'],
    ['/dashboard', 'page-dashboard'],
    ['/admin', 'page-admin'],
    ['/help', 'page-help'],
  ])('%s renders inside the shell', (path, probe) => {
    localStorage.setItem('access_token', 't')
    renderAppAt(path)
    expect(screen.getByTestId(probe)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })

  it('unauthenticated in-shell routes bounce to the frameless login page', () => {
    renderAppAt('/my-work')
    expect(screen.getByTestId('page-login')).toBeInTheDocument()
  })
})
