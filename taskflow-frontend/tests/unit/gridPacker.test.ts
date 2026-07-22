import { describe, it, expect } from 'vitest'
import { packGridPositions, nextFreeCell } from '../../src/lib/gridPacker'
import type { Task } from '../../src/types'

function makeTask(id: string, grid_x: number | null = null, grid_y: number | null = null): Task {
  return {
    id,
    title: id,
    description: null,
    status: 'todo',
    issue_type: 'task',
    severity: null,
    priority_id: null,
    position: 0,
    project_id: 'p-1',
    sequence_number: 1,
    project_key: 'ORB',
    assignee_id: null,
    start_date: null,
    due_date: null,
    parent_id: null,
    sprint_id: null,
    custom_status_id: null,
    version: 1,
    sub_tasks: [],
    tags: [],
    created_at: '',
    updated_at: '',
    grid_x,
    grid_y,
  }
}

describe('packGridPositions', () => {
  it('REQ-GRID-07: assigns row-major positions to tasks with null coords', () => {
    const tasks = [makeTask('a'), makeTask('b'), makeTask('c'), makeTask('d'), makeTask('e')]
    const result = packGridPositions(tasks)
    expect(result.find(t => t.id === 'a')).toMatchObject({ grid_x: 0, grid_y: 0 })
    expect(result.find(t => t.id === 'b')).toMatchObject({ grid_x: 1, grid_y: 0 })
    expect(result.find(t => t.id === 'c')).toMatchObject({ grid_x: 0, grid_y: 1 })
    expect(result.find(t => t.id === 'd')).toMatchObject({ grid_x: 1, grid_y: 1 })
    expect(result.find(t => t.id === 'e')).toMatchObject({ grid_x: 0, grid_y: 2 })
  })

  it('preserves existing grid positions and sorts them first', () => {
    const tasks = [
      makeTask('unplaced'),
      makeTask('placed', 1, 2),
    ]
    const result = packGridPositions(tasks)
    expect(result[0].id).toBe('placed')
    expect(result[1]).toMatchObject({ id: 'unplaced', grid_x: 0, grid_y: 0 })
  })

  it('does not mutate the original task objects', () => {
    const t = makeTask('x')
    packGridPositions([t])
    expect(t.grid_x).toBeNull()
  })

  it('returns empty array for empty input', () => {
    expect(packGridPositions([])).toEqual([])
  })

  it('single task gets position 0,0', () => {
    const result = packGridPositions([makeTask('solo')])
    expect(result[0]).toMatchObject({ grid_x: 0, grid_y: 0 })
  })
})

describe('nextFreeCell', () => {
  it('REQ-GRID-09: returns 0,0 when no tasks placed', () => {
    expect(nextFreeCell([])).toEqual({ grid_x: 0, grid_y: 0 })
  })

  it('returns next cell after occupied ones', () => {
    const tasks = [makeTask('a', 0, 0), makeTask('b', 1, 0)]
    expect(nextFreeCell(tasks)).toEqual({ grid_x: 0, grid_y: 1 })
  })

  it('skips gaps and finds first truly free cell', () => {
    const tasks = [makeTask('a', 0, 0), makeTask('b', 0, 1)]
    expect(nextFreeCell(tasks)).toEqual({ grid_x: 1, grid_y: 0 })
  })
})
