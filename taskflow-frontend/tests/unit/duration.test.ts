import { describe, it, expect } from 'vitest'
import { parseDuration, formatMinutes } from '../../src/lib/duration'

// ── REQ-147 — duration parsing/formatting ────────────────────────────────────

describe('parseDuration', () => {
  it('parses hours', () => {
    expect(parseDuration('2h')).toBe(120)
  })

  it('parses minutes', () => {
    expect(parseDuration('30m')).toBe(30)
  })

  it('parses combined hours and minutes', () => {
    expect(parseDuration('1h 30m')).toBe(90)
    expect(parseDuration('1h30m')).toBe(90)
  })

  it('parses decimal hours', () => {
    expect(parseDuration('1.5h')).toBe(90)
  })

  it('treats a bare number as minutes', () => {
    expect(parseDuration('45')).toBe(45)
  })

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(parseDuration(' 2H 15M ')).toBe(135)
  })

  it('rejects garbage, zero and negatives', () => {
    expect(parseDuration('soon')).toBeNull()
    expect(parseDuration('0m')).toBeNull()
    expect(parseDuration('-1h')).toBeNull()
    expect(parseDuration('')).toBeNull()
  })
})

describe('formatMinutes', () => {
  it('formats sub-hour as minutes', () => {
    expect(formatMinutes(45)).toBe('45m')
  })

  it('formats whole hours', () => {
    expect(formatMinutes(120)).toBe('2h')
  })

  it('formats mixed', () => {
    expect(formatMinutes(90)).toBe('1h 30m')
  })

  it('formats zero', () => {
    expect(formatMinutes(0)).toBe('0m')
  })
})
