import { describe, it, expect } from 'vitest'
import { buildMobileScreens, snapIndex, type MobileSubgroup } from '../../src/lib/mobileBoard'
import type { Task } from '../../src/types'

const t = (id: string, col: string, group = '_all'): Task =>
  ({ id, _col: col, _group: group } as unknown as Task)

const cols = [{ id: 'todo' }, { id: 'doing' }, { id: 'done' }]
const colIdOf = (task: Task) => (task as unknown as { _col: string })._col
const idOf = (c: { id: string }) => c.id

// group the flat list into subgroups by a `_group` marker, preserving order
const groupByMarker = (tasks: Task[]): MobileSubgroup[] => {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const g = (task as unknown as { _group: string })._group
    if (!map.has(g)) map.set(g, [])
    map.get(g)!.push(task)
  }
  return [...map.entries()].map(([id, ts]) => ({ id, label: id, tasks: ts }))
}

describe('HW-21 — buildMobileScreens', () => {
  it('makes one screen per column with that column\'s tasks and count', () => {
    const tasks = [t('1', 'todo'), t('2', 'doing'), t('3', 'doing'), t('4', 'done')]
    const screens = buildMobileScreens(cols, tasks, colIdOf, idOf, (x) => [{ id: '_all', label: '', tasks: x }])
    expect(screens.map((s) => s.count)).toEqual([1, 2, 1])
    expect(screens[1].tasks.map((x) => x.id)).toEqual(['2', '3'])
  })

  it('a column with no tasks is still a screen (count 0, no subgroups)', () => {
    const screens = buildMobileScreens(cols, [t('1', 'todo')], colIdOf, idOf, () => [])
    expect(screens[2]).toMatchObject({ count: 0, subgroups: [] })
  })

  it('subgroups the tasks within each status screen', () => {
    const tasks = [t('1', 'doing', 'epicA'), t('2', 'doing', 'epicB'), t('3', 'doing', 'epicA')]
    const [, doing] = buildMobileScreens(cols, tasks, colIdOf, idOf, groupByMarker)
    expect(doing.subgroups.map((g) => [g.id, g.tasks.length])).toEqual([['epicA', 2], ['epicB', 1]])
  })

  it('drops empty subgroups so an epic with no tasks in this status is not shown', () => {
    const screens = buildMobileScreens(
      [{ id: 'doing' }], [t('1', 'doing', 'epicA')], colIdOf, idOf,
      () => [{ id: 'epicA', label: 'A', tasks: [t('1', 'doing', 'epicA')] }, { id: 'epicB', label: 'B', tasks: [] }],
    )
    expect(screens[0].subgroups.map((g) => g.id)).toEqual(['epicA'])
  })
})

describe('HW-21 — snapIndex', () => {
  it('rounds to the nearest screen', () => {
    expect(snapIndex(0, 300, 3)).toBe(0)
    expect(snapIndex(140, 300, 3)).toBe(0)   // <½ → stays
    expect(snapIndex(160, 300, 3)).toBe(1)   // >½ → next
    expect(snapIndex(600, 300, 3)).toBe(2)
  })

  it('clamps to the last screen and never goes negative', () => {
    expect(snapIndex(99999, 300, 3)).toBe(2)
    expect(snapIndex(-50, 300, 3)).toBe(0)
  })

  it('is safe before layout (zero width or no columns)', () => {
    expect(snapIndex(100, 0, 3)).toBe(0)
    expect(snapIndex(100, 300, 0)).toBe(0)
  })
})
