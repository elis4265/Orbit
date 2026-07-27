import { describe, it, expect } from 'vitest'
import {
  TASK_SUMMARY_LIMIT,
  SUMMARY_COUNTER_FROM,
  summaryCounter,
  summaryError,
  validationMessage,
} from '../../src/lib/taskLimits'

const HW34_SUMMARY =
  'Board load fires a 422 request wave and leaks a stale WebSocket reconnect loop when the URL carries the project key'

function fastApi422(detail: unknown) {
  return { response: { status: 422, data: { detail } } }
}

describe('HW-34 — summary limits', () => {
  it('mirrors the server limit of 100', () => {
    expect(TASK_SUMMARY_LIMIT).toBe(100)
  })

  it('[REQ-167-3] no counter below the threshold', () => {
    expect(summaryCounter('a'.repeat(SUMMARY_COUNTER_FROM - 1))).toBeNull()
    expect(summaryCounter('')).toBeNull()
  })

  it('[REQ-167-3] counter appears from 80 characters', () => {
    expect(summaryCounter('a'.repeat(80))).toBe('80/100')
    expect(summaryCounter('a'.repeat(100))).toBe('100/100')
    expect(summaryCounter('a'.repeat(115))).toBe('115/100')
  })

  it('[REQ-167-2] no error at or under the limit', () => {
    expect(summaryError('a'.repeat(100))).toBeNull()
    expect(summaryError('short one')).toBeNull()
  })

  it('[REQ-167-2] error over the limit states count and limit', () => {
    expect(summaryError('a'.repeat(101))).toBe('Summary is 101 characters — the limit is 100.')
  })

  it('[REQ-167-2] the HW-34 real-world summary (115 chars) is rejected', () => {
    expect(HW34_SUMMARY.length).toBe(115)
    expect(summaryError(HW34_SUMMARY)).toContain('115')
  })

  it('trailing whitespace does not count — the server receives the trimmed value', () => {
    expect(summaryError('a'.repeat(100) + '   ')).toBeNull()
    expect(summaryCounter('a'.repeat(79) + ' ')).toBeNull()
  })
})

describe('HW-34 — validationMessage (server 422 → inline text)', () => {
  it('[REQ-167-4] maps a Pydantic field error with a friendly label', () => {
    const err = fastApi422([
      { loc: ['body', 'title'], msg: 'String should have at most 100 characters' },
    ])
    expect(validationMessage(err)).toBe('Summary: String should have at most 100 characters')
  })

  it('[REQ-167-4] passes through a plain-string detail', () => {
    expect(validationMessage(fastApi422('INVALID_HIERARCHY'))).toBe('INVALID_HIERARCHY')
  })

  it('[REQ-167-4] joins multiple field errors', () => {
    const err = fastApi422([
      { loc: ['body', 'title'], msg: 'too long' },
      { loc: ['body', 'due_date'], msg: 'invalid date' },
    ])
    expect(validationMessage(err)).toBe('Summary: too long Due date: invalid date')
  })

  it('returns null for non-422 and shapeless errors', () => {
    expect(validationMessage(new Error('network down'))).toBeNull()
    expect(validationMessage({ response: { status: 500, data: {} } })).toBeNull()
    expect(validationMessage(fastApi422([]))).toBeNull()
    expect(validationMessage(undefined)).toBeNull()
  })
})
