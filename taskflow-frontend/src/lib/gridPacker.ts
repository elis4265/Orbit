import type { Task } from '../types'

const COLS = 2

type GridTask = Task & { grid_x: number; grid_y: number }

// Returns tasks sorted and with grid_x/grid_y assigned.
// Tasks that already have grid positions are sorted first (by y then x).
// Tasks with null positions are assigned row-major positions after the placed ones,
// filling gaps left by the placed set.
export function packGridPositions(tasks: Task[]): GridTask[] {
  const placed = tasks
    .filter((t) => t.grid_x !== null && t.grid_y !== null)
    .map((t) => ({ ...t, grid_x: t.grid_x as number, grid_y: t.grid_y as number }))
    .sort((a, b) => a.grid_y * COLS + a.grid_x - (b.grid_y * COLS + b.grid_x))

  const occupied = new Set(placed.map((t) => `${t.grid_x},${t.grid_y}`))

  const unplaced = tasks.filter((t) => t.grid_x === null || t.grid_y === null)

  let cursor = 0
  const assigned: GridTask[] = unplaced.map((t) => {
    while (true) {
      const x = cursor % COLS
      const y = Math.floor(cursor / COLS)
      cursor++
      if (!occupied.has(`${x},${y}`)) {
        occupied.add(`${x},${y}`)
        return { ...t, grid_x: x, grid_y: y }
      }
    }
  })

  return [...placed, ...assigned]
}

// Returns the first (row-major) cell not occupied by any task in the list.
export function nextFreeCell(tasks: Task[]): { grid_x: number; grid_y: number } {
  const occupied = new Set(
    tasks
      .filter((t) => t.grid_x !== null && t.grid_y !== null)
      .map((t) => `${t.grid_x},${t.grid_y}`)
  )
  let i = 0
  while (true) {
    const x = i % COLS
    const y = Math.floor(i / COLS)
    if (!occupied.has(`${x},${y}`)) return { grid_x: x, grid_y: y }
    i++
  }
}

// Given a sorted task array (after a drag-and-drop reorder), computes grid coords
// for every task using row-major order and returns reorder items for the API.
export function tasksToGridReorderItems(
  tasks: Task[],
  startPosition: number
): { id: string; position: number; grid_x: number; grid_y: number }[] {
  return tasks.map((t, i) => ({
    id: t.id,
    position: startPosition + i,
    grid_x: i % COLS,
    grid_y: Math.floor(i / COLS),
  }))
}
