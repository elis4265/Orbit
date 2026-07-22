// REQ-157 — bulk command parser: SmartFilterBar dialect → BulkChanges payload
import { describe, it, expect } from 'vitest'
import { parseBulkCommand, type BulkCommandContext } from '../../src/lib/bulkCommand'

const ctx: BulkCommandContext = {
  meId: 'me-1',
  mode: 'open',
  members: [
    { id: 'u-1', username: 'anon', email: 'anon@x.io' },
    { id: 'u-2', username: null, email: 'plain@x.io' },
  ],
  statuses: [],
  sprints: [{ id: 's-1', name: 'Sprint 5' }],
  priorities: [{ id: 'p-1', name: 'High' }],
  tags: [{ id: 'tag-1', name: 'backend' }, { id: 'tag-2', name: 'triage' }],
}

describe('REQ-157 — parseBulkCommand', () => {
  it('parses open-mode status by name', () => {
    const r = parseBulkCommand('@status:done', ctx)
    expect(r.errors).toEqual([])
    expect(r.changes).toEqual({ status: 'done' })
    expect(r.preview.join(' ')).toMatch(/status/i)
  })

  it('maps "in progress" with quotes', () => {
    const r = parseBulkCommand('@status:"in progress"', ctx)
    expect(r.changes).toEqual({ status: 'in_progress' })
  })

  it('resolves custom status by name in guided mode', () => {
    const guided = { ...ctx, mode: 'guided' as const, statuses: [{ id: 'st-9', name: 'In Review' }] }
    const r = parseBulkCommand('@status:"In Review"', guided)
    expect(r.errors).toEqual([])
    expect(r.changes).toEqual({ custom_status_id: 'st-9' })
  })

  it('assignee me / none / username', () => {
    expect(parseBulkCommand('@assignee:me', ctx).changes).toEqual({ assignee_id: 'me-1' })
    expect(parseBulkCommand('@assignee:none', ctx).changes).toEqual({ assignee_id: null })
    expect(parseBulkCommand('@assignee:anon', ctx).changes).toEqual({ assignee_id: 'u-1' })
  })

  it('unknown assignee is an error, nothing sent', () => {
    const r = parseBulkCommand('@assignee:ghost', ctx)
    expect(r.errors.length).toBe(1)
    expect(r.changes).toEqual({})
  })

  it('tags add and remove by name', () => {
    const r = parseBulkCommand('@tag:+backend @tag:-triage', ctx)
    expect(r.errors).toEqual([])
    expect(r.changes).toEqual({ add_tag_ids: ['tag-1'], remove_tag_ids: ['tag-2'] })
  })

  it('sprint by quoted name and none', () => {
    expect(parseBulkCommand('@sprint:"Sprint 5"', ctx).changes).toEqual({ sprint_id: 's-1' })
    expect(parseBulkCommand('@sprint:none', ctx).changes).toEqual({ sprint_id: null })
  })

  it('priority by name', () => {
    expect(parseBulkCommand('@priority:high', ctx).changes).toEqual({ priority_id: 'p-1' })
  })

  it('combined command', () => {
    const r = parseBulkCommand('@status:done @assignee:me @tag:+backend', ctx)
    expect(r.errors).toEqual([])
    expect(r.changes).toEqual({ status: 'done', assignee_id: 'me-1', add_tag_ids: ['tag-1'] })
    expect(r.preview.length).toBe(3)
  })

  it('junk tokens and unknown fields are errors', () => {
    expect(parseBulkCommand('lol what', ctx).errors.length).toBeGreaterThan(0)
    expect(parseBulkCommand('@flavour:spicy', ctx).errors.length).toBe(1)
  })

  it('empty input is an error', () => {
    expect(parseBulkCommand('   ', ctx).errors.length).toBe(1)
  })
})
