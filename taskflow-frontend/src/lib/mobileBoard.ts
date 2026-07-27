import type { Task } from '../types'

// HW-21: the mobile board shows one status per screen. This module holds the pure,
// side-effect-free shaping the component leans on, so it can be unit-tested without a DOM.

export interface MobileSubgroup {
  id: string
  label: string
  tasks: Task[]
}

export interface MobileScreen<C> {
  col: C
  tasks: Task[]
  count: number
  /** Empty [] when ungrouped; one entry per subgroup (epic/assignee/…) otherwise. */
  subgroups: MobileSubgroup[]
}

/**
 * One screen per column: the column's own tasks, their count, and — when grouped —
 * the vertical subgroups shown inside that status screen (each with its sticky header).
 *
 * `colIdOf`/`idOf`/`groupTasks` are injected so this stays pure and testable; the caller
 * passes the board's real getTaskColumnId and swimlane grouping.
 */
export function buildMobileScreens<C>(
  columns: C[],
  tasks: Task[],
  colIdOf: (t: Task) => string,
  idOf: (c: C) => string,
  groupTasks: (tasks: Task[]) => MobileSubgroup[],
): MobileScreen<C>[] {
  return columns.map((col) => {
    const colTasks = tasks.filter((t) => colIdOf(t) === idOf(col))
    const subgroups = groupTasks(colTasks).filter((g) => g.tasks.length > 0)
    return { col, tasks: colTasks, count: colTasks.length, subgroups }
  })
}

/** Which screen is snapped, from the scroller's horizontal position. Clamped to range. */
export function snapIndex(scrollLeft: number, screenWidth: number, count: number): number {
  if (screenWidth <= 0 || count <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / screenWidth)))
}
