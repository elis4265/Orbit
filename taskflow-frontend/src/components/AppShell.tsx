// Persistent app frame: Sidebar + TopBar; pages render in the Outlet.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useOutletContext } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useProjects } from '../hooks/useProjects'
import {
  landingProject,
  readLastProjectSeg,
  rememberProjectSeg,
  resolveLastProject,
} from '../lib/lastProject'
import { resolveProjectId } from '../lib/projectResolve'
import type { Project } from '../types'

export interface AppShellContext {
  /** Toggle the notification panel that lives in the shell's top bar. */
  toggleNotifications: () => void
}

/** Shell controls for pages rendered inside the AppShell outlet (undefined when standalone, e.g. in tests). */
export function useAppShell(): AppShellContext | undefined {
  return useOutletContext<AppShellContext | null>() ?? undefined
}

// Layout routes can't see child params — derive the project from the pathname.
// id resolves via lib/projectResolve (HW-33/HW-37): '' while the key is
// unresolved, so shell-level queries (TopBar's useMembers) stay disabled
// instead of firing UUID-typed endpoints with a raw key and 422ing.
function resolveShellProject(pathname: string, projects: Project[]): { id: string; seg: string } {
  const param = pathname.match(/^\/projects\/([^/]+)/)?.[1]
  const id = resolveProjectId(param, projects)
  const project = projects.find((p) => p.id === id)
  return { id, seg: project?.key ?? param ?? '' }
}

// Project context: URL first, else remembered — keeps global pages' nav populated
// and makes '/' land on the last-visited project (mirrors BoardPage's redirect).
// Only a URL-derived segment is persisted; fallback renders must never overwrite
// the stored value (that's what used to reset it to the first project).
function useShellProject(): { id: string; seg: string } {
  const location = useLocation()
  const { data } = useProjects()
  const projects: Project[] = Array.isArray(data) ? data : []
  const fromUrl = resolveShellProject(location.pathname, projects)

  useEffect(() => {
    if (fromUrl.seg) rememberProjectSeg(fromUrl.seg)
  }, [fromUrl.seg])

  if (fromUrl.seg) return fromUrl
  const stored = readLastProjectSeg()
  const fallback = location.pathname === '/'
    ? landingProject(projects, stored)
    : resolveLastProject(projects, stored)
  return fallback
    ? { id: fallback.id, seg: fallback.key ?? fallback.id }
    : { id: '', seg: '' }
}

export default function AppShell() {
  const { id: activeProjectId, seg: projectSeg } = useShellProject()

  const [notifOpen, setNotifOpen] = useState(false)
  const toggleNotifications = useCallback(() => setNotifOpen((v) => !v), [])
  const outletContext = useMemo<AppShellContext>(() => ({ toggleNotifications }), [toggleNotifications])

  // Mobile-only off-canvas nav (below md the sidebar is a drawer, not a rail).
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = useCallback(() => setNavOpen(false), [])
  const toggleNav = useCallback(() => setNavOpen((v) => !v), [])

  useEffect(() => {
    if (!navOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [navOpen])

  return (
    <div className="h-screen flex bg-gray-950 overflow-hidden">
      {navOpen && (
        <div
          data-testid="nav-backdrop"
          aria-hidden="true"
          onClick={closeNav}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}
      <Sidebar projectSeg={projectSeg || undefined} mobileOpen={navOpen} onNavigate={closeNav} />
      {/* min-w-0 lets this column shrink so wide content (kanban) scrolls inside the page's own <main> */}
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          activeProjectId={activeProjectId}
          notifOpen={notifOpen}
          onToggleNotif={toggleNotifications}
          navOpen={navOpen}
          onToggleNav={toggleNav}
        />
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
