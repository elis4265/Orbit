// Viewport helpers for the mobile (Phase 1) layout.
// `md` (768px) is the desktop threshold everywhere in the app, so "small" is < 768px.

export const MOBILE_MEDIA_QUERY = '(max-width: 767px)'

/** Board view preference key — global (not per-board), owned by BoardPage. */
export const VIEW_PREFERENCE_KEY = 'orbit_view_preference'

export type BoardViewMode = 'kanban' | 'list' | 'calendar' | 'gantt' | 'roadmap'

const VIEW_MODES: BoardViewMode[] = ['kanban', 'list', 'calendar', 'gantt', 'roadmap']

/**
 * True when the viewport is narrower than the `md` breakpoint.
 * Defensive on purpose: SSR has no `window`, and jsdom ships without `matchMedia`
 * unless a test mocks it — both must read as "not small" rather than throw.
 */
export function isSmallViewport(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches === true
  } catch {
    return false
  }
}

/**
 * Initial board view mode.
 *
 * A stored preference always wins — an explicit user choice is never overridden and
 * the mobile default is never written back to storage, so switching between a phone
 * and a desktop can't clobber the other's view. Only when nothing is stored do we
 * fall back to 'list' on small screens (a multi-column kanban is unusable there).
 */
export function initialBoardViewMode(): BoardViewMode {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(VIEW_PREFERENCE_KEY)
  } catch {
    stored = null
  }
  if (stored && (VIEW_MODES as string[]).includes(stored)) return stored as BoardViewMode
  return isSmallViewport() ? 'list' : 'kanban'
}
