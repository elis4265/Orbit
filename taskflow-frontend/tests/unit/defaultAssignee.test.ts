import { describe, it, expect } from 'vitest'
import { resolveDefaultAssignee } from '../../src/lib/defaultAssignee'

const ME = 'user-me'

// HW-18 — the Create Task modal pre-fills Assignee from the project default so the
// setting is visible at the moment it applies, instead of landing silently server-side.

describe('HW-18 — resolveDefaultAssignee', () => {
  it('unassigned mode pre-fills nothing', () => {
    expect(resolveDefaultAssignee({ default_assignee_mode: 'unassigned' }, ME)).toBe('')
  })

  it('creator mode pre-fills the signed-in user', () => {
    expect(resolveDefaultAssignee({ default_assignee_mode: 'creator' }, ME)).toBe(ME)
  })

  it('member mode pre-fills the configured member', () => {
    expect(
      resolveDefaultAssignee(
        { default_assignee_mode: 'member', default_assignee_id: 'user-x' },
        ME,
      ),
    ).toBe('user-x')
  })

  it('member mode with nobody configured pre-fills nothing', () => {
    expect(
      resolveDefaultAssignee({ default_assignee_mode: 'member', default_assignee_id: null }, ME),
    ).toBe('')
  })

  it('a project that has never configured a default pre-fills nothing', () => {
    expect(resolveDefaultAssignee({}, ME)).toBe('')
  })

  // Both of these happen for real: the modal can open before useProjects/useMe resolve.
  it('an unknown project pre-fills nothing rather than guessing', () => {
    expect(resolveDefaultAssignee(undefined, ME)).toBe('')
  })

  it('creator mode with no signed-in user yet pre-fills nothing', () => {
    expect(resolveDefaultAssignee({ default_assignee_mode: 'creator' }, undefined)).toBe('')
  })
})
