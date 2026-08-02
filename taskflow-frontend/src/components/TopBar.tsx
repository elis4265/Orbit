// App-shell top bar, extracted from BoardPage's BoardHeader.
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, HelpCircle, Sun, Moon, Monitor, Menu, Search, X } from 'lucide-react'
import { useTheme, type ThemePreference } from '../context/ThemeContext'
import SearchBar from './SearchBar'
import { SIDEBAR_DRAWER_ID } from './Sidebar'
import Avatar from './Avatar'
import NotificationPanel from './NotificationPanel'
import ProjectSelector from './ProjectSelector'
import CreateProjectModal from './CreateProjectModal'
import { useMe, useLogout } from '../hooks/useAuth'
import { useProjects, useCreateProject, useRenameProject, useDeleteProject } from '../hooks/useProjects'
import { useMembers } from '../hooks/useMembers'
import { useUnreadCount } from '../hooks/useNotifications'
import { canManageProject } from '../lib/rbac'
import type { Project, ProjectMode } from '../types'

const THEME_MENU_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

function UserMenu({ user }: { user: NonNullable<ReturnType<typeof useMe>['data']> }) {
  const navigate = useNavigate()
  const { preference, setPreference } = useTheme()
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="hover:opacity-80 transition-opacity" aria-label="User menu" title="User menu">
        <Avatar
          firstName={user.first_name} lastName={user.last_name}
          username={user.username} email={user.email}
          avatarUrl={user.avatar_url} size="sm"
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
          <button onClick={() => { setOpen(false); navigate('/preferences') }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors">Profile</button>
          {user.is_superuser && (
            <button onClick={() => { setOpen(false); navigate('/admin') }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors">Instance Admin</button>
          )}
          <button onClick={() => { setOpen(false); navigate('/about') }} className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors">About Orbit</button>
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-gray-200">Theme</span>
            <div className="flex items-center gap-0.5 rounded-lg bg-gray-800 p-0.5">
              {THEME_MENU_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setPreference(value)}
                  title={label}
                  aria-label={label}
                  aria-pressed={preference === value}
                  className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                    preference === value
                      ? 'bg-gray-700 text-brand'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Icon size={13} />
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-800" />
          <button onClick={() => { setOpen(false); logout() }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-gray-800 transition-colors">Log Out</button>
        </div>
      )}
    </div>
  )
}

interface TopBarProps {
  /** Resolved id of the project the current URL points at ('' outside project context). */
  activeProjectId: string
  notifOpen: boolean
  onToggleNotif: () => void
  /** Mobile nav drawer state, owned by the AppShell. */
  navOpen?: boolean
  onToggleNav?: () => void
}

export default function TopBar({ activeProjectId, notifOpen, onToggleNotif, navOpen = false, onToggleNav }: TopBarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: user } = useMe()
  const { data: projectsRaw } = useProjects()
  const projects: Project[] = Array.isArray(projectsRaw) ? projectsRaw : []
  const createProject = useCreateProject()
  const renameProject = useRenameProject()
  const deleteProject = useDeleteProject()
  // Rename/delete are admin-only server-side — only render their controls for admins.
  const { data: members = [] } = useMembers(activeProjectId)
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const canManage = canManageProject(activeProject, user?.id, members)
  const { data: unreadData } = useUnreadCount()
  const unreadCount = unreadData?.count ?? 0

  const [createOpen, setCreateOpen] = useState(false)
  // Below md the search input would squeeze the row, so it collapses to an icon that
  // expands an inline overlay row under the header. At md+ the input is always visible.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  const segFor = (id: string) => projects.find((p) => p.id === id)?.key ?? id

  // Deep-link ?task= in place on that board page; elsewhere jump to the board with it.
  function handleOpenTask(pid: string, taskId: string) {
    const targetId = pid || activeProjectId
    if (!targetId) return
    const onTargetBoard =
      targetId === activeProjectId &&
      (location.pathname === '/' || /^\/projects\/[^/]+$/.test(location.pathname))
    if (onTargetBoard) {
      const p = new URLSearchParams(location.search)
      p.set('task', taskId)
      navigate({ pathname: location.pathname, search: `?${p.toString()}` })
    } else {
      navigate(`/projects/${segFor(targetId)}?task=${taskId}`)
    }
  }

  async function handleCreateProject(name: string, mode: ProjectMode = 'open') {
    const proj = await createProject.mutateAsync({ name, mode })
    setCreateOpen(false)
    navigate(`/projects/${proj.key ?? proj.id}`)
  }

  async function handleDeleteProject(id: string) {
    await deleteProject.mutateAsync(id)
    const remaining = projects.filter((p) => p.id !== id)
    navigate(remaining.length > 0 ? `/projects/${remaining[0].key ?? remaining[0].id}` : '/')
  }

  return (
    <header className="relative flex items-center justify-between gap-2 px-3 md:px-6 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div className="flex items-center gap-2 md:gap-4 min-w-0">
        {/* Mobile-only nav trigger; the sidebar is a persistent rail from md up. */}
        <button
          onClick={onToggleNav}
          aria-label="Open navigation"
          title="Open navigation"
          aria-expanded={navOpen}
          aria-controls={SIDEBAR_DRAWER_ID}
          className="md:hidden shrink-0 text-gray-400 hover:text-gray-200 transition-colors"
        >
          <Menu size={20} />
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <img src="/logo.png" alt="Orbit" className="h-8 w-8 object-contain drop-shadow-[0_0_8px_rgba(124,106,247,0.7)]" />
          <h1 className="hidden sm:block text-lg font-bold text-brand">Orbit</h1>
        </div>
        <ProjectSelector
          projects={projects}
          activeId={activeProjectId}
          onSelect={(id) => navigate(`/projects/${segFor(id)}`)}
          onCreate={handleCreateProject}
          onRequestCreate={() => setCreateOpen(true)}
          onRename={async (id, name) => { await renameProject.mutateAsync({ id, name }) }}
          onDelete={handleDeleteProject}
          canManage={canManage}
          canCreate={!!user?.is_superuser}
        />
      </div>
      {projects.length > 0 && (
        <div className="hidden md:block">
          <SearchBar onSelectTask={(pid, id) => handleOpenTask(pid, id)} />
        </div>
      )}
      <div className="flex items-center gap-3 shrink-0">
        {projects.length > 0 && (
          <button
            onClick={() => setMobileSearchOpen((v) => !v)}
            aria-label="Search tasks"
            title="Search tasks"
            aria-expanded={mobileSearchOpen}
            className="md:hidden text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Search size={16} />
          </button>
        )}
        {user && <UserMenu user={user} />}
        <button onClick={() => navigate('/help')} className="hidden sm:block text-gray-500 hover:text-gray-300 transition-colors" aria-label="Help" title="Help">
          <HelpCircle size={16} />
        </button>
        <div className="relative flex items-center">
          <button onClick={onToggleNotif} className="relative text-gray-500 hover:text-gray-300 transition-colors" aria-label="Notifications" title="Notifications">
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <NotificationPanel onClose={onToggleNotif} onOpenTask={handleOpenTask} />
          )}
        </div>
      </div>

      {/* Expanded mobile search: its own full-width row so the input never squeezes the header. */}
      {mobileSearchOpen && projects.length > 0 && (
        <div className="absolute inset-x-0 top-full z-40 flex items-center gap-2 border-b border-gray-800 bg-gray-900 px-3 py-2 md:hidden">
          <div className="min-w-0 flex-1">
            <SearchBar
              onSelectTask={(pid, id) => { setMobileSearchOpen(false); handleOpenTask(pid, id) }}
            />
          </div>
          <button
            onClick={() => setMobileSearchOpen(false)}
            aria-label="Close search"
            title="Close search"
            className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateProject}
      />
    </header>
  )
}
