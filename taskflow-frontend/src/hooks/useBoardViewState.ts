import { useState, useEffect } from 'react'
import type { ActiveFilter } from '../components/SmartFilterBar'

export type SwimlaneMode = 'none' | 'assignee' | 'priority' | 'type' | 'epic'
// REQ-140: 'active' scopes the board to the running sprint (Scrum-style); 'all' shows every board task.
export type SprintScope = 'active' | 'all'

interface BoardViewState {
  swimlaneMode: SwimlaneMode
  activeFilters: ActiveFilter[]
  collapsedColumns: string[]
  compact: boolean
  gridMode: boolean
  projectFilterActive: boolean
  sprintScope: SprintScope
}

const DEFAULTS: BoardViewState = {
  swimlaneMode: 'none',
  activeFilters: [],
  collapsedColumns: [],
  compact: false,
  gridMode: false,
  projectFilterActive: true,
  sprintScope: 'active',
}

function storageKey(boardId: string) {
  return `orbit_board_state_${boardId}`
}

function loadState(boardId: string): BoardViewState {
  try {
    const raw = localStorage.getItem(storageKey(boardId))
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveState(boardId: string, state: BoardViewState) {
  localStorage.setItem(storageKey(boardId), JSON.stringify(state))
}

export function useBoardViewState(boardId: string) {
  const [state, setState] = useState<BoardViewState>(() => loadState(boardId))

  useEffect(() => {
    setState(loadState(boardId))
  }, [boardId])

  function setSwimlaneMode(mode: SwimlaneMode) {
    setState((prev) => {
      const next = { ...prev, swimlaneMode: mode }
      saveState(boardId, next)
      return next
    })
  }

  function setActiveFilters(filters: ActiveFilter[]) {
    setState((prev) => {
      const next = { ...prev, activeFilters: filters }
      saveState(boardId, next)
      return next
    })
  }

  function setCollapsedColumns(value: Set<string> | ((prev: Set<string>) => Set<string>)) {
    setState((prev) => {
      const currentSet = new Set(prev.collapsedColumns)
      const newSet = typeof value === 'function' ? value(currentSet) : value
      const next = { ...prev, collapsedColumns: [...newSet] }
      saveState(boardId, next)
      return next
    })
  }

  function setCompact(value: boolean) {
    setState((prev) => {
      const next = { ...prev, compact: value }
      saveState(boardId, next)
      return next
    })
  }

  function setGridMode(value: boolean) {
    setState((prev) => {
      const next = { ...prev, gridMode: value }
      saveState(boardId, next)
      return next
    })
  }

  function setProjectFilterActive(value: boolean) {
    setState((prev) => {
      const next = { ...prev, projectFilterActive: value }
      saveState(boardId, next)
      return next
    })
  }

  function setSprintScope(value: SprintScope) {
    setState((prev) => {
      const next = { ...prev, sprintScope: value }
      saveState(boardId, next)
      return next
    })
  }

  return {
    swimlaneMode: state.swimlaneMode,
    setSwimlaneMode,
    activeFilters: state.activeFilters,
    setActiveFilters,
    collapsedColumns: new Set(state.collapsedColumns),
    setCollapsedColumns,
    compact: state.compact,
    setCompact,
    gridMode: state.gridMode,
    setGridMode,
    projectFilterActive: state.projectFilterActive,
    setProjectFilterActive,
    sprintScope: state.sprintScope,
    setSprintScope,
  }
}
