import { describe, it, expect } from 'vitest'
import { countIncompleteChildren, epicDoneWarning, epicDoneGateCount } from '../../src/lib/epicGate'

const child = (parentId: string | null, status: string) => ({
  parent_id: parentId,
  status: status as 'todo' | 'in_progress' | 'done',
})

describe('countIncompleteChildren', () => {
  it('counts children of the epic that are not done', () => {
    const tasks = [
      child('epic-1', 'todo'),
      child('epic-1', 'in_progress'),
      child('epic-1', 'done'),
    ]
    expect(countIncompleteChildren(tasks, 'epic-1')).toBe(2)
  })

  it('returns 0 when all children are done', () => {
    expect(countIncompleteChildren([child('epic-1', 'done')], 'epic-1')).toBe(0)
  })

  it('returns 0 when the epic has no children', () => {
    expect(countIncompleteChildren([child(null, 'todo')], 'epic-1')).toBe(0)
  })

  it('ignores children of other parents', () => {
    expect(countIncompleteChildren([child('epic-2', 'todo')], 'epic-1')).toBe(0)
  })
})

describe('epicDoneWarning', () => {
  const epic = { id: 'epic-1', title: 'Big Feature', issue_type: 'epic' as const }

  it('returns a warning naming the epic and incomplete-child count', () => {
    const tasks = [child('epic-1', 'todo'), child('epic-1', 'in_progress')]
    const msg = epicDoneWarning(epic, tasks)
    expect(msg).toContain('Big Feature')
    expect(msg).toContain('2 incomplete child tasks')
  })

  it('uses singular form for one incomplete child', () => {
    const msg = epicDoneWarning(epic, [child('epic-1', 'todo')])
    expect(msg).toContain('1 incomplete child task')
    expect(msg).not.toContain('tasks')
  })

  it('returns null for non-epic tasks', () => {
    const story = { id: 'epic-1', title: 'Story', issue_type: 'story' as const }
    expect(epicDoneWarning(story, [child('epic-1', 'todo')])).toBeNull()
  })

  it('returns null when all children are done', () => {
    expect(epicDoneWarning(epic, [child('epic-1', 'done')])).toBeNull()
  })

  it('returns null when the epic has no children', () => {
    expect(epicDoneWarning(epic, [])).toBeNull()
  })
})

describe('epicDoneGateCount — heads-up before completing an epic (any mode, any surface)', () => {
  const epic = { id: 'epic-1', title: 'Big Feature', issue_type: 'epic' as const, status: 'in_progress' as const }

  it('returns the incomplete-child count when an epic enters done', () => {
    const tasks = [child('epic-1', 'todo'), child('epic-1', 'in_progress'), child('epic-1', 'done')]
    expect(epicDoneGateCount(epic, 'done', tasks)).toBe(2)
  })

  it('returns 0 for non-epic tasks', () => {
    const story = { ...epic, issue_type: 'story' as const }
    expect(epicDoneGateCount(story, 'done', [child('epic-1', 'todo')])).toBe(0)
  })

  it('returns 0 when the target status is not done', () => {
    expect(epicDoneGateCount(epic, 'in_progress', [child('epic-1', 'todo')])).toBe(0)
  })

  it('returns 0 when the epic is already done (e.g. done → cancelled column)', () => {
    const doneEpic = { ...epic, status: 'done' as const }
    expect(epicDoneGateCount(doneEpic, 'done', [child('epic-1', 'todo')])).toBe(0)
  })

  it('returns 0 when all children are done', () => {
    expect(epicDoneGateCount(epic, 'done', [child('epic-1', 'done')])).toBe(0)
  })
})
