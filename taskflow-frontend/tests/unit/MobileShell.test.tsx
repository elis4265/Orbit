// Phase 1 mobile shell: the sidebar becomes an off-canvas drawer below md,
// driven by a hamburger that is CSS-hidden from md up.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AppShell from '../../src/components/AppShell'

const USER = {
  id: 'u1', email: 'anon@test.io', username: 'anon', first_name: 'A', last_name: 'Non',
  avatar_url: null, initials: 'AN', is_verified: true, is_superuser: false, created_at: '',
}
const PROJECTS = [
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
  useUnreadCount: () => ({ data: { count: 0 } }),
}))
vi.mock('../../src/components/SearchBar', () => ({
  default: () => <div data-testid="search-bar" />,
}))
vi.mock('../../src/components/NotificationPanel', () => ({
  default: () => <div data-testid="notif-panel" />,
}))

function renderShell(entry = '/projects/ORB/issues') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/my-work" element={<div data-testid="outlet-my-work" />} />
          <Route path="/dashboard" element={<div data-testid="outlet-dashboard" />} />
          <Route path="/projects/:workspaceId/issues" element={<div data-testid="outlet-issues" />} />
          <Route path="/projects/:workspaceId" element={<div data-testid="outlet-board" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

const drawer = () => document.getElementById('app-sidebar') as HTMLElement
const hamburger = () => screen.getByRole('button', { name: 'Open navigation' })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('Mobile nav drawer', () => {
  it('is closed by default — translated off-canvas and not a dialog', () => {
    renderShell()
    expect(drawer()).toBeInTheDocument()
    expect(drawer().className).toContain('-translate-x-full')
    expect(drawer().className).toContain('invisible')
    expect(drawer()).not.toHaveAttribute('role', 'dialog')
    expect(screen.queryByTestId('nav-backdrop')).not.toBeInTheDocument()
  })

  it('takes no layout space below md and is a static rail from md up', () => {
    renderShell()
    // fixed => out of flow on mobile; md:static puts it back in the flex row at desktop.
    expect(drawer().className).toContain('fixed')
    expect(drawer().className).toContain('md:static')
    expect(drawer().className).toContain('md:translate-x-0')
  })

  it('opens from the hamburger as a modal dialog with a backdrop', () => {
    renderShell()
    fireEvent.click(hamburger())

    expect(drawer()).toHaveAttribute('role', 'dialog')
    expect(drawer()).toHaveAttribute('aria-modal', 'true')
    expect(drawer().className).toContain('translate-x-0')
    expect(drawer().className).not.toContain('-translate-x-full')
    expect(screen.getByTestId('nav-backdrop')).toBeInTheDocument()
  })

  it('the hamburger is mobile-only and reports its state via aria', () => {
    renderShell()
    expect(hamburger()).toHaveClass('md:hidden')          // hidden at md+ (CSS)
    expect(hamburger()).toHaveAttribute('aria-controls', 'app-sidebar')
    expect(hamburger()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(hamburger())
    expect(hamburger()).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes when the backdrop is tapped', () => {
    renderShell()
    fireEvent.click(hamburger())
    fireEvent.click(screen.getByTestId('nav-backdrop'))

    expect(drawer()).not.toHaveAttribute('role', 'dialog')
    expect(drawer().className).toContain('-translate-x-full')
    expect(screen.queryByTestId('nav-backdrop')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    renderShell()
    fireEvent.click(hamburger())
    expect(drawer()).toHaveAttribute('role', 'dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(drawer()).not.toHaveAttribute('role', 'dialog')
  })

  it('closes when a nav item is clicked, and still navigates', () => {
    renderShell()
    fireEvent.click(hamburger())
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(screen.getByTestId('outlet-dashboard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    expect(drawer()).not.toHaveAttribute('role', 'dialog')
    expect(screen.queryByTestId('nav-backdrop')).not.toBeInTheDocument()
  })

  it('toggling the hamburger twice closes it again', () => {
    renderShell()
    fireEvent.click(hamburger())
    fireEvent.click(hamburger())
    expect(drawer()).not.toHaveAttribute('role', 'dialog')
  })

  it('shows full labels in the drawer even when the desktop rail is collapsed', () => {
    localStorage.setItem('orbit.sidebar.collapsed', 'true')
    renderShell()
    expect(screen.queryByText('My Work')).not.toBeInTheDocument()   // collapsed rail: icons only

    fireEvent.click(hamburger())
    expect(screen.getByText('My Work')).toBeInTheDocument()          // drawer: labels back
  })
})

describe('Mobile top bar', () => {
  it('keeps the logo mark but hides the wordmark below sm', () => {
    renderShell()
    expect(screen.getByAltText('Orbit')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Orbit' })).toHaveClass('hidden', 'sm:block')
  })

  it('collapses search to an icon below md and expands it on tap', () => {
    renderShell()
    // The always-on input is wrapped in a md-only container.
    expect(screen.getByTestId('search-bar').parentElement).toHaveClass('hidden', 'md:block')

    const searchToggle = screen.getByRole('button', { name: 'Search tasks' })
    expect(searchToggle).toHaveClass('md:hidden')
    expect(searchToggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(searchToggle)
    expect(searchToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByTestId('search-bar')).toHaveLength(2)      // md input + mobile overlay
    expect(screen.getByRole('button', { name: 'Close search' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.getAllByTestId('search-bar')).toHaveLength(1)
  })

  it('keeps the bell and the user menu at every size', () => {
    renderShell()
    const bell = screen.getByRole('button', { name: 'Notifications' })
    const avatar = screen.getByRole('button', { name: 'User menu' })
    for (const el of [bell, avatar]) {
      expect(el).toBeInTheDocument()
      expect(el.className).not.toContain('hidden')
    }
  })
})
