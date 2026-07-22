import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBoardViewState } from '../../src/hooks/useBoardViewState'

beforeEach(() => {
  localStorage.clear()
})

describe('useBoardViewState — defaults', () => {
  it('returns swimlaneMode none when no saved state', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.swimlaneMode).toBe('none')
  })

  it('returns empty activeFilters when no saved state', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.activeFilters).toEqual([])
  })

  it('returns empty collapsedColumns when no saved state', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.collapsedColumns.size).toBe(0)
  })
})

describe('useBoardViewState — loads from localStorage', () => {
  it('loads saved swimlaneMode', () => {
    localStorage.setItem('orbit_board_state_board-1', JSON.stringify({ swimlaneMode: 'assignee', activeFilters: [], collapsedColumns: [] }))
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.swimlaneMode).toBe('assignee')
  })

  it('loads saved activeFilters', () => {
    const filters = [{ instanceId: 'x', fieldId: 'tag', fieldLabel: 'Tag', value: 'tag-1', label: 'Bug', negate: false }]
    localStorage.setItem('orbit_board_state_board-1', JSON.stringify({ swimlaneMode: 'none', activeFilters: filters, collapsedColumns: [] }))
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.activeFilters).toEqual(filters)
  })

  it('loads saved collapsedColumns', () => {
    localStorage.setItem('orbit_board_state_board-1', JSON.stringify({ swimlaneMode: 'none', activeFilters: [], collapsedColumns: ['col-a', 'col-b'] }))
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.collapsedColumns.has('col-a')).toBe(true)
    expect(result.current.collapsedColumns.has('col-b')).toBe(true)
  })

  it('falls back to defaults for corrupted JSON', () => {
    localStorage.setItem('orbit_board_state_board-1', 'not-json')
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.swimlaneMode).toBe('none')
    expect(result.current.activeFilters).toEqual([])
  })
})

describe('useBoardViewState — persists on change', () => {
  it('persists swimlaneMode to localStorage', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    act(() => { result.current.setSwimlaneMode('priority') })
    const saved = JSON.parse(localStorage.getItem('orbit_board_state_board-1') ?? '{}')
    expect(saved.swimlaneMode).toBe('priority')
  })

  it('persists activeFilters to localStorage', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    const filters = [{ instanceId: 'y', fieldId: 'type', fieldLabel: 'Type', value: 'bug', label: 'Bug', negate: false }]
    act(() => { result.current.setActiveFilters(filters) })
    const saved = JSON.parse(localStorage.getItem('orbit_board_state_board-1') ?? '{}')
    expect(saved.activeFilters).toEqual(filters)
  })

  it('persists collapsedColumns to localStorage', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    act(() => { result.current.setCollapsedColumns(new Set(['col-x'])) })
    const saved = JSON.parse(localStorage.getItem('orbit_board_state_board-1') ?? '{}')
    expect(saved.collapsedColumns).toContain('col-x')
  })
})

describe('useBoardViewState — gridMode (REQ-GRID-01, REQ-GRID-10)', () => {
  it('defaults to false', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.gridMode).toBe(false)
  })

  it('toggles to true and persists', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    act(() => result.current.setGridMode(true))
    expect(result.current.gridMode).toBe(true)
    const saved = JSON.parse(localStorage.getItem('orbit_board_state_board-1') ?? '{}')
    expect(saved.gridMode).toBe(true)
  })

  it('gridMode and compact can both be stored independently in localStorage', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    act(() => result.current.setGridMode(true))
    act(() => result.current.setGridMode(false))
    act(() => result.current.setCompact(true))
    expect(result.current.compact).toBe(true)
    expect(result.current.gridMode).toBe(false)
  })
})

describe('useBoardViewState — sprintScope (REQ-140)', () => {
  it('[REQ-140] defaults to "active" (Scrum-style scope when a sprint runs)', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.sprintScope).toBe('active')
  })

  it('[REQ-140] toggles to "all" and persists per board', () => {
    const { result } = renderHook(() => useBoardViewState('board-1'))
    act(() => result.current.setSprintScope('all'))
    expect(result.current.sprintScope).toBe('all')
    const saved = JSON.parse(localStorage.getItem('orbit_board_state_board-1') ?? '{}')
    expect(saved.sprintScope).toBe('all')
  })

  it('[REQ-140] loads saved sprintScope from localStorage', () => {
    localStorage.setItem('orbit_board_state_board-1', JSON.stringify({ sprintScope: 'all' }))
    const { result } = renderHook(() => useBoardViewState('board-1'))
    expect(result.current.sprintScope).toBe('all')
  })
})

describe('useBoardViewState — board switching', () => {
  it('loads new board state when boardId changes', () => {
    localStorage.setItem('orbit_board_state_board-2', JSON.stringify({ swimlaneMode: 'type', activeFilters: [], collapsedColumns: [] }))
    const { result, rerender } = renderHook(({ id }) => useBoardViewState(id), { initialProps: { id: 'board-1' } })
    expect(result.current.swimlaneMode).toBe('none')
    rerender({ id: 'board-2' })
    expect(result.current.swimlaneMode).toBe('type')
  })

  it('does not bleed old board state into new board', () => {
    const { result, rerender } = renderHook(({ id }) => useBoardViewState(id), { initialProps: { id: 'board-1' } })
    act(() => { result.current.setSwimlaneMode('epic') })
    rerender({ id: 'board-2' })
    expect(result.current.swimlaneMode).toBe('none')
  })

  it('saves state to the correct board key when boardId changes mid-session', () => {
    const { result, rerender } = renderHook(({ id }) => useBoardViewState(id), { initialProps: { id: 'board-1' } })
    act(() => { result.current.setSwimlaneMode('assignee') })
    rerender({ id: 'board-2' })
    act(() => { result.current.setSwimlaneMode('priority') })
    expect(JSON.parse(localStorage.getItem('orbit_board_state_board-1') ?? '{}').swimlaneMode).toBe('assignee')
    expect(JSON.parse(localStorage.getItem('orbit_board_state_board-2') ?? '{}').swimlaneMode).toBe('priority')
  })
})
