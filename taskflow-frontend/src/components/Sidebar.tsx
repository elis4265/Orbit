import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  UserCheck, LayoutDashboard, SquareKanban, ListTodo, ScrollText, Users, Download, Settings,
  ChevronsLeft, ChevronsRight,
} from 'lucide-react'

const COLLAPSED_KEY = 'orbit.sidebar.collapsed'

interface SidebarItem {
  id: string
  label: string
  Icon: typeof UserCheck
  path: string
  isActive: (pathname: string, search: URLSearchParams) => boolean
}

const GLOBAL_ITEMS: SidebarItem[] = [
  {
    id: 'my-work', label: 'My Work', Icon: UserCheck, path: '/my-work',
    isActive: (p) => p.startsWith('/my-work'),
  },
  {
    id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, path: '/dashboard',
    isActive: (p) => p.startsWith('/dashboard'),
  },
]

function projectItems(seg: string): SidebarItem[] {
  const base = `/projects/${seg}`
  return [
    // Exact-path match only — startsWith would also swallow /issues, /settings, etc.
    {
      id: 'board', label: 'Board', Icon: SquareKanban, path: base,
      isActive: (p) => p === base,
    },
    {
      id: 'issues', label: 'Issues', Icon: ListTodo, path: `${base}/issues`,
      isActive: (p) => p.startsWith(`${base}/issues`),
    },
    {
      id: 'analytics', label: 'Analytics', Icon: ScrollText, path: `${base}/audit-log`,
      isActive: (p) => p.startsWith(`${base}/audit-log`),
    },
    // /settings is shared — ?tab=members decides which row lights up.
    {
      id: 'members', label: 'Members', Icon: Users, path: `${base}/settings?tab=members`,
      isActive: (p, s) => p.startsWith(`${base}/settings`) && s.get('tab') === 'members',
    },
    {
      id: 'export', label: 'Export & Import', Icon: Download, path: `${base}/export`,
      isActive: (p) => p.startsWith(`${base}/export`),
    },
    {
      id: 'settings', label: 'Settings', Icon: Settings, path: `${base}/settings`,
      isActive: (p, s) => p.startsWith(`${base}/settings`) && s.get('tab') !== 'members',
    },
  ]
}

/** Id the TopBar hamburger points at via aria-controls. */
export const SIDEBAR_DRAWER_ID = 'app-sidebar'

interface SidebarProps {
  /** URL segment of the open project (its key); omit to hide the project section. */
  projectSeg?: string
  /**
   * True while the off-canvas drawer is open. Only ever set below `md` — the hamburger
   * that drives it is `md:hidden` — so it doubles as "we are on a phone right now".
   */
  mobileOpen?: boolean
  /** Fired after a nav item is activated so the shell can dismiss the drawer. */
  onNavigate?: () => void
}

export default function Sidebar({ projectSeg, mobileOpen = false, onNavigate }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === 'true'
  )

  // The drawer is always full-width, so icons-only collapse is meaningless there.
  const iconsOnly = collapsed && !mobileOpen

  // Only the open drawer is a modal; the md+ rail stays a plain navigation landmark.
  const drawerA11y = mobileOpen
    ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'Navigation' }
    : {}

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }

  const search = new URLSearchParams(location.search)

  function renderItem(item: SidebarItem) {
    const active = item.isActive(location.pathname, search)
    return (
      <button
        key={item.id}
        onClick={() => { navigate(item.path); onNavigate?.() }}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        className={`flex w-full items-center gap-3 rounded-lg py-2 text-sm transition-colors ${
          iconsOnly ? 'justify-center px-0' : 'px-3'
        } ${active ? 'bg-gray-800/60 text-brand' : 'text-gray-500 hover:text-gray-300'}`}
      >
        <item.Icon size={16} className="shrink-0" />
        {!iconsOnly && <span className="truncate">{item.label}</span>}
      </button>
    )
  }

  return (
    // Below md: fixed off-canvas drawer — takes no layout space, slides in over the page.
    // At md+: the original in-flow rail, width driven by the persisted collapse state.
    <div
      id={SIDEBAR_DRAWER_ID}
      {...drawerA11y}
      className={`fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] transition-transform duration-200 ease-out md:static md:z-auto md:max-w-none md:visible md:translate-x-0 md:flex-shrink-0 md:transition-none ${
        mobileOpen ? 'translate-x-0' : 'invisible -translate-x-full'
      } ${collapsed ? 'md:w-14' : 'md:w-56'}`}
    >
      <nav
        aria-label="Sidebar"
        className="flex h-full flex-col gap-0.5 border-r border-gray-800 bg-gray-950 p-2"
      >
        {GLOBAL_ITEMS.map(renderItem)}
        {projectSeg && (
          <>
            {iconsOnly ? (
              <div className="my-2 border-t border-gray-800" />
            ) : (
              <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-gray-600">
                Project
              </p>
            )}
            {projectItems(projectSeg).map(renderItem)}
          </>
        )}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`mt-auto hidden w-full items-center gap-3 rounded-lg py-2 text-gray-600 transition-colors hover:text-gray-300 md:flex ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
        >
          {collapsed ? <ChevronsRight size={16} className="shrink-0" /> : <ChevronsLeft size={16} className="shrink-0" />}
        </button>
      </nav>
    </div>
  )
}
