import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { taskMatchesFilter, applyTaskFilters } from '../../src/lib/taskFilter'
import type { Task } from '../../src/types'
import type { ActiveFilter } from '../../src/components/SmartFilterBar'

// Pin time: Wednesday 2026-06-17 (this week Mon 15 – Sun 21, next week Mon 22 – Sun 28)
const NOW = new Date('2026-06-17T12:00:00Z')
beforeAll(() => vi.setSystemTime(NOW))
afterAll(() => vi.useRealTimers())

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1',
    title: 'Test Task',
    description: null,
    status: 'todo',
    issue_type: 'task',
    severity: null,
    priority_id: null,
    position: 0,
    project_id: 'p-1',
    project_key: 'TST',
    sequence_number: 1,
    assignee_id: null,
    start_date: null,
    due_date: null,
    parent_id: null,
    sprint_id: null,
    custom_status_id: null,
    version: 1,
    sub_tasks: [],
    tags: [],
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  }
}

function f(fieldId: string, value: string, negate = false): ActiveFilter {
  return { instanceId: 'x', fieldId, fieldLabel: fieldId, value, label: value, negate }
}

// ── assignee ────────────────────────────────────────────────────────────────

describe('assignee filter', () => {
  it('matches assigned task', () => {
    expect(taskMatchesFilter(makeTask({ assignee_id: 'u-1' }), f('assignee', 'u-1'), false)).toBe(true)
  })
  it('does not match different assignee', () => {
    expect(taskMatchesFilter(makeTask({ assignee_id: 'u-2' }), f('assignee', 'u-1'), false)).toBe(false)
  })
  it('does not match unassigned task', () => {
    expect(taskMatchesFilter(makeTask({ assignee_id: null }), f('assignee', 'u-1'), false)).toBe(false)
  })
})

// ── tag ─────────────────────────────────────────────────────────────────────

describe('tag filter', () => {
  const tag = { id: 'tag-1', name: 'Bug', color: '#ff0000', visibility: 'public' as const, project_id: 'p-1', created_by: 'u-1' }
  it('matches task with tag', () => {
    expect(taskMatchesFilter(makeTask({ tags: [tag] }), f('tag', 'tag-1'), false)).toBe(true)
  })
  it('does not match task without tag', () => {
    expect(taskMatchesFilter(makeTask({ tags: [] }), f('tag', 'tag-1'), false)).toBe(false)
  })
})

// ── status ──────────────────────────────────────────────────────────────────

describe('status filter (open mode)', () => {
  it('matches task status', () => {
    expect(taskMatchesFilter(makeTask({ status: 'in_progress' }), f('status', 'in_progress'), false)).toBe(true)
  })
  it('does not match different status', () => {
    expect(taskMatchesFilter(makeTask({ status: 'todo' }), f('status', 'in_progress'), false)).toBe(false)
  })
})

describe('status filter (custom mode)', () => {
  it('matches custom_status_id', () => {
    expect(taskMatchesFilter(makeTask({ custom_status_id: 'cs-1' }), f('status', 'cs-1'), true)).toBe(true)
  })
  it('does not match different custom status', () => {
    expect(taskMatchesFilter(makeTask({ custom_status_id: 'cs-2' }), f('status', 'cs-1'), true)).toBe(false)
  })
})

// ── priority ────────────────────────────────────────────────────────────────

describe('priority filter', () => {
  it('matches priority_id', () => {
    expect(taskMatchesFilter(makeTask({ priority_id: 'pri-uuid-1' }), f('priority', 'pri-uuid-1'), false)).toBe(true)
  })
  it('does not match different priority', () => {
    expect(taskMatchesFilter(makeTask({ priority_id: 'pri-uuid-2' }), f('priority', 'pri-uuid-1'), false)).toBe(false)
  })
  it('does not match task with no priority', () => {
    expect(taskMatchesFilter(makeTask({ priority_id: null }), f('priority', 'pri-uuid-1'), false)).toBe(false)
  })
})

// ── type ────────────────────────────────────────────────────────────────────

describe('type filter', () => {
  it('matches issue_type', () => {
    expect(taskMatchesFilter(makeTask({ issue_type: 'bug' }), f('type', 'bug'), false)).toBe(true)
  })
  it('does not match different type', () => {
    expect(taskMatchesFilter(makeTask({ issue_type: 'task' }), f('type', 'bug'), false)).toBe(false)
  })
})

// ── epic ─────────────────────────────────────────────────────────────────────

describe('epic filter', () => {
  it('matches a task whose parent_id is the epic', () => {
    expect(taskMatchesFilter(makeTask({ parent_id: 'epic-1' }), f('epic', 'epic-1'), false)).toBe(true)
  })
  it('matches the epic task itself', () => {
    expect(taskMatchesFilter(makeTask({ id: 'epic-1', issue_type: 'epic' }), f('epic', 'epic-1'), false)).toBe(true)
  })
  it('does not match task under a different epic', () => {
    expect(taskMatchesFilter(makeTask({ parent_id: 'epic-2' }), f('epic', 'epic-1'), false)).toBe(false)
  })
  it('does not match task with no parent', () => {
    expect(taskMatchesFilter(makeTask({ parent_id: null }), f('epic', 'epic-1'), false)).toBe(false)
  })
})

// ── sprint ───────────────────────────────────────────────────────────────────

describe('sprint filter', () => {
  it('matches sprint_id', () => {
    expect(taskMatchesFilter(makeTask({ sprint_id: 'sprint-1' }), f('sprint', 'sprint-1'), false)).toBe(true)
  })
  it('does not match different sprint', () => {
    expect(taskMatchesFilter(makeTask({ sprint_id: 'sprint-2' }), f('sprint', 'sprint-1'), false)).toBe(false)
  })
  it('does not match task with no sprint', () => {
    expect(taskMatchesFilter(makeTask({ sprint_id: null }), f('sprint', 'sprint-1'), false)).toBe(false)
  })
})

// ── severity ─────────────────────────────────────────────────────────────────

describe('severity filter', () => {
  it('matches severity', () => {
    expect(taskMatchesFilter(makeTask({ severity: 'critical' }), f('severity', 'critical'), false)).toBe(true)
  })
  it('does not match different severity', () => {
    expect(taskMatchesFilter(makeTask({ severity: 'low' }), f('severity', 'critical'), false)).toBe(false)
  })
  it('does not match task with no severity', () => {
    expect(taskMatchesFilter(makeTask({ severity: null }), f('severity', 'critical'), false)).toBe(false)
  })
})

// ── due date ─────────────────────────────────────────────────────────────────

describe('due date filter', () => {
  it('none — matches task with no due date', () => {
    expect(taskMatchesFilter(makeTask({ due_date: null }), f('due', 'none'), false)).toBe(true)
  })
  it('none — does not match task with due date', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-17T00:00:00Z' }), f('due', 'none'), false)).toBe(false)
  })
  it('overdue — matches task due in the past', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-10T00:00:00Z' }), f('due', 'overdue'), false)).toBe(true)
  })
  it('overdue — does not match task due today', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-17T00:00:00Z' }), f('due', 'overdue'), false)).toBe(false)
  })
  it('overdue — does not match future task', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-20T00:00:00Z' }), f('due', 'overdue'), false)).toBe(false)
  })
  it('today — matches task due today', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-17T00:00:00Z' }), f('due', 'today'), false)).toBe(true)
  })
  it('today — does not match task due yesterday', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-16T00:00:00Z' }), f('due', 'today'), false)).toBe(false)
  })
  it('this_week — matches task due this week', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-19T00:00:00Z' }), f('due', 'this_week'), false)).toBe(true)
  })
  it('this_week — does not match task due next week', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-22T00:00:00Z' }), f('due', 'this_week'), false)).toBe(false)
  })
  it('next_week — matches task due next week', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-24T00:00:00Z' }), f('due', 'next_week'), false)).toBe(true)
  })
  it('next_week — does not match task due this week', () => {
    expect(taskMatchesFilter(makeTask({ due_date: '2026-06-17T00:00:00Z' }), f('due', 'next_week'), false)).toBe(false)
  })
  it('overdue — does not match task with no due date', () => {
    expect(taskMatchesFilter(makeTask({ due_date: null }), f('due', 'overdue'), false)).toBe(false)
  })
})

// ── text ─────────────────────────────────────────────────────────────────────

describe('text filter', () => {
  it('matches title substring', () => {
    expect(taskMatchesFilter(makeTask({ title: 'Fix login bug' }), f('text', 'login'), false)).toBe(true)
  })
  it('matches description text', () => {
    expect(taskMatchesFilter(makeTask({ description: '<p>details here</p>' }), f('text', 'details'), false)).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(taskMatchesFilter(makeTask({ title: 'Fix Login Bug' }), f('text', 'login'), false)).toBe(true)
  })
  it('does not match unrelated task', () => {
    expect(taskMatchesFilter(makeTask({ title: 'Deploy service' }), f('text', 'login'), false)).toBe(false)
  })
})

// ── applyTaskFilters — OR within field, AND across fields ────────────────────

describe('applyTaskFilters', () => {
  it('returns true for empty filters', () => {
    expect(applyTaskFilters(makeTask(), [], false)).toBe(true)
  })

  it('ANDs across different fields', () => {
    const task = makeTask({ assignee_id: 'u-1', issue_type: 'bug' })
    expect(applyTaskFilters(task, [f('assignee', 'u-1'), f('type', 'bug')], false)).toBe(true)
    expect(applyTaskFilters(task, [f('assignee', 'u-1'), f('type', 'task')], false)).toBe(false)
  })

  it('ORs within the same field', () => {
    const task = makeTask({ issue_type: 'bug' })
    expect(applyTaskFilters(task, [f('type', 'bug'), f('type', 'task')], false)).toBe(true)
  })

  it('negation excludes matching task', () => {
    const task = makeTask({ issue_type: 'bug' })
    expect(applyTaskFilters(task, [f('type', 'bug', true)], false)).toBe(false)
  })

  it('negation passes non-matching task', () => {
    const task = makeTask({ issue_type: 'task' })
    expect(applyTaskFilters(task, [f('type', 'bug', true)], false)).toBe(true)
  })
})


// ── REQ-152 — identity filters (@related) ────────────────────────────────────

import { applyTaskFilters as applyWithSets } from '../../src/lib/taskFilter'

const IDENTITY_SETS = { commented: new Set(['t-1']), mentioned: new Set(['t-2']) }
const relatedFilter = (value: string, negate = false) => ({
  instanceId: `i-${value}${negate}`, fieldId: 'related', fieldLabel: 'Related', value, label: value, negate,
})
const bareTask = (id: string) => ({ id, title: 'x', status: 'todo', tags: [] }) as never

it('[REQ-152] commented-by-me matches only tasks in the commented set', () => {
  expect(applyWithSets(bareTask('t-1'), [relatedFilter('commented')], false, IDENTITY_SETS)).toBe(true)
  expect(applyWithSets(bareTask('t-9'), [relatedFilter('commented')], false, IDENTITY_SETS)).toBe(false)
})

it('[REQ-152] mentions-me matches the mentioned set and supports negation', () => {
  expect(applyWithSets(bareTask('t-2'), [relatedFilter('mentioned')], false, IDENTITY_SETS)).toBe(true)
  expect(applyWithSets(bareTask('t-2'), [relatedFilter('mentioned', true)], false, IDENTITY_SETS)).toBe(false)
  expect(applyWithSets(bareTask('t-9'), [relatedFilter('mentioned', true)], false, IDENTITY_SETS)).toBe(true)
})

it('[REQ-152] OR within the related field', () => {
  const filters = [relatedFilter('commented'), relatedFilter('mentioned')]
  expect(applyWithSets(bareTask('t-1'), filters, false, IDENTITY_SETS)).toBe(true)
  expect(applyWithSets(bareTask('t-2'), filters, false, IDENTITY_SETS)).toBe(true)
  expect(applyWithSets(bareTask('t-9'), filters, false, IDENTITY_SETS)).toBe(false)
})

it('[REQ-152] no id sets loaded → related filter matches nothing', () => {
  expect(applyWithSets(bareTask('t-1'), [relatedFilter('commented')], false, undefined)).toBe(false)
})
