import { useEffect, type ReactNode } from 'react'
import { SlidersHorizontal, X, Bookmark } from 'lucide-react'
import type { SwimlaneMode } from '../hooks/useBoardViewState'
import type { SavedSearch } from '../types'

/**
 * Mobile-only ("View") sheet for the board toolbar.
 *
 * Below `md` the board's secondary chrome — saved searches, swimlane grouping,
 * card layout, sprint scope and the sprint panel toggle — does not fit next to
 * the filter bar, so it collapses behind this single button and reappears as a
 * labelled, vertically stacked bottom sheet. The component is `md:hidden`
 * throughout: at desktop widths nothing here renders and the toolbar keeps its
 * original inline row.
 */

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void

  /** Kanban-only controls (swimlanes + card layout) are hidden in other views. */
  showKanbanControls: boolean
  swimlaneMode: SwimlaneMode
  onSwimlaneChange: (mode: SwimlaneMode) => void
  compact: boolean
  onToggleCompact: () => void
  gridMode: boolean
  onToggleGrid: () => void

  showSprintPanelToggle: boolean
  sprintPanelOpen: boolean
  onToggleSprintPanel: () => void

  showSprintScope: boolean
  sprintScope: 'active' | 'all'
  onSprintScopeChange: (scope: 'active' | 'all') => void
  activeSprintName?: string

  savedSearches: SavedSearch[]
  onApplySavedSearch: (search: SavedSearch) => void
  onDeleteSavedSearch: (id: string) => void
  canSaveSearch: boolean
  saveSearchName: string
  onSaveSearchNameChange: (name: string) => void
  onSaveSearch: () => void
  savingSearch: boolean
}

const SWIMLANE_OPTIONS: { value: SwimlaneMode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'type', label: 'Type' },
  { value: 'epic', label: 'Epic' },
]

/** True when any secondary control sits at a non-default value — surfaces a dot on the button. */
function hasActiveControls(p: Props): boolean {
  return (
    (p.showKanbanControls && (p.swimlaneMode !== 'none' || p.compact || p.gridMode)) ||
    (p.showSprintScope && p.sprintScope !== 'active') ||
    p.sprintPanelOpen
  )
}

function segClass(active: boolean): string {
  return `flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
    active ? 'bg-brand text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
  }`
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
      {children}
    </p>
  )
}

function SwimlaneSection({ showKanbanControls, swimlaneMode, onSwimlaneChange }: Props) {
  if (!showKanbanControls) return null
  return (
    <div>
      <SectionLabel>Group by</SectionLabel>
      <select
        value={swimlaneMode}
        onChange={(e) => onSwimlaneChange(e.target.value as SwimlaneMode)}
        aria-label="Group by"
        className="w-full cursor-pointer rounded-lg border border-gray-800 bg-gray-900 px-2 py-2 text-sm text-gray-300 outline-none"
      >
        {SWIMLANE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function SprintScopeSection({ showSprintScope, sprintScope, onSprintScopeChange, activeSprintName }: Props) {
  if (!showSprintScope) return null
  return (
    <div>
      <SectionLabel>Board scope{activeSprintName ? ` — ${activeSprintName}` : ''}</SectionLabel>
      <div className="flex gap-1.5 rounded-xl border border-gray-800 p-1">
        <button onClick={() => onSprintScopeChange('active')} className={segClass(sprintScope === 'active')}>
          Sprint
        </button>
        <button onClick={() => onSprintScopeChange('all')} className={segClass(sprintScope === 'all')}>
          All
        </button>
      </div>
    </div>
  )
}

function SprintPanelButton({ showSprintPanelToggle, sprintPanelOpen, onToggleSprintPanel, onOpenChange }: Props) {
  if (!showSprintPanelToggle) return null
  return (
    <button
      onClick={() => { onToggleSprintPanel(); onOpenChange(false) }}
      className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
        sprintPanelOpen ? 'border-brand/40 text-brand' : 'border-gray-800 text-gray-300'
      }`}
    >
      {sprintPanelOpen ? 'Hide sprint panel' : 'Manage sprints'}
    </button>
  )
}

function CardLayoutSection({ showKanbanControls, compact, gridMode, onToggleCompact, onToggleGrid }: Props) {
  if (!showKanbanControls) return null
  return (
    <div>
      <SectionLabel>Card layout</SectionLabel>
      <div className="flex gap-1.5 rounded-xl border border-gray-800 p-1">
        <button
          onClick={() => { if (compact) onToggleCompact(); if (gridMode) onToggleGrid() }}
          className={segClass(!compact && !gridMode)}
        >
          Comfortable
        </button>
        <button onClick={() => { if (!compact) onToggleCompact() }} className={segClass(compact)}>
          Compact
        </button>
        <button onClick={() => { if (!gridMode) onToggleGrid() }} className={segClass(gridMode)}>
          Grid
        </button>
      </div>
    </div>
  )
}

function SavedSearchSection(p: Props) {
  return (
    <div>
      <SectionLabel>Saved searches</SectionLabel>
      {p.savedSearches.length === 0 && !p.canSaveSearch && (
        <p className="text-xs text-gray-500">Add filters above to save a search.</p>
      )}
      {p.savedSearches.length > 0 && (
        <div className="mb-2 overflow-hidden rounded-xl border border-gray-800">
          {p.savedSearches.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                className="min-w-0 flex-1 truncate text-left text-sm text-gray-300"
                onClick={() => { p.onApplySavedSearch(s); p.onOpenChange(false) }}
              >
                {s.name}
              </button>
              <button
                onClick={() => p.onDeleteSavedSearch(s.id)}
                className="flex-shrink-0 text-gray-600 hover:text-red-400"
                aria-label={`Delete saved search ${s.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {p.canSaveSearch && (
        <div className="flex gap-1.5">
          <input
            value={p.saveSearchName}
            onChange={(e) => p.onSaveSearchNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') p.onSaveSearch() }}
            placeholder="Name this search…"
            className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-2 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-brand/60"
          />
          <button
            onClick={p.onSaveSearch}
            disabled={!p.saveSearchName.trim() || p.savingSearch}
            className="flex-shrink-0 rounded-lg bg-brand px-3 py-2 text-xs text-white transition-all hover:brightness-110 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

export default function BoardMobileControls(props: Props) {
  const { open, onOpenChange } = props

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  return (
    <>
      <button
        onClick={() => onOpenChange(!open)}
        aria-label="Board view options"
        aria-expanded={open}
        aria-controls="board-mobile-controls"
        aria-haspopup="dialog"
        className={`relative flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors md:hidden ${
          open ? 'border-brand/40 text-brand' : 'border-gray-800 text-gray-400'
        }`}
      >
        <SlidersHorizontal size={14} />
        View
        {hasActiveControls(props) && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand" />
        )}
      </button>

      {open && (
        <div
          data-testid="board-controls-backdrop"
          aria-hidden="true"
          onClick={() => onOpenChange(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      <div
        id="board-mobile-controls"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? 'true' : undefined}
        aria-label="Board view options"
        hidden={!open}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-gray-800 bg-gray-950 p-4 md:hidden"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-200">
            <Bookmark size={14} className="text-gray-500" />
            View options
          </span>
          <button
            onClick={() => onOpenChange(false)}
            aria-label="Close view options"
            className="rounded-lg p-1 text-gray-500 hover:text-gray-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-4 pb-[env(safe-area-inset-bottom)]">
          <SavedSearchSection {...props} />
          <SwimlaneSection {...props} />
          <CardLayoutSection {...props} />
          <SprintScopeSection {...props} />
          <SprintPanelButton {...props} />
        </div>
      </div>
    </>
  )
}
