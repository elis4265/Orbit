// HW-22: the "HW-22" identifier shown wherever tasks are listed or picked.
import { describe, it, expect } from 'vitest'
import { taskKey } from '../../src/lib/taskKey'

describe('taskKey', () => {
  it('joins the project key and the sequence number', () => {
    expect(taskKey({ project_key: 'HW', sequence_number: 22 })).toBe('HW-22')
  })

  it('does not pad or reformat the number', () => {
    expect(taskKey({ project_key: 'ORB', sequence_number: 1 })).toBe('ORB-1')
    expect(taskKey({ project_key: 'ORB', sequence_number: 1042 })).toBe('ORB-1042')
  })

  it('falls back to the bare number when the project key is missing', () => {
    expect(taskKey({ sequence_number: 22 })).toBe('22')
    expect(taskKey({ project_key: '', sequence_number: 22 })).toBe('22')
    expect(taskKey({ project_key: null, sequence_number: 22 })).toBe('22')
  })

  it('returns empty string when there is no number, so callers can skip it', () => {
    expect(taskKey({ project_key: 'HW' })).toBe('')
    expect(taskKey({ project_key: 'HW', sequence_number: null })).toBe('')
    expect(taskKey({})).toBe('')
  })

  it('treats sequence number zero as a real number, not a missing one', () => {
    expect(taskKey({ project_key: 'HW', sequence_number: 0 })).toBe('HW-0')
  })
})
