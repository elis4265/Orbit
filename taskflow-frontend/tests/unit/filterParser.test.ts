import { describe, it, expect } from 'vitest'
import { parseQuery, analyzeInput, type ParsedFilterGroup } from '../../src/lib/filterParser'

describe('analyzeInput — mode detection', () => {
  it('returns null mode for empty string', () => {
    expect(analyzeInput('')).toEqual({ mode: null })
  })

  it('returns null mode for plain text', () => {
    expect(analyzeInput('hello')).toEqual({ mode: null })
  })

  it('returns field mode for bare @', () => {
    expect(analyzeInput('@')).toMatchObject({ mode: 'field', negate: false, search: '' })
  })

  it('returns field mode for -@', () => {
    expect(analyzeInput('-@')).toMatchObject({ mode: 'field', negate: true, search: '' })
  })

  it('returns field mode with search for @partial', () => {
    expect(analyzeInput('@ass')).toMatchObject({ mode: 'field', negate: false, search: 'ass' })
  })

  it('returns field mode with negate + search for -@partial', () => {
    expect(analyzeInput('-@pri')).toMatchObject({ mode: 'field', negate: true, search: 'pri' })
  })

  it('returns value mode for @field:', () => {
    const r = analyzeInput('@assignee:')
    expect(r).toMatchObject({ mode: 'value', negate: false, fieldId: 'assignee', search: '', completedValues: [] })
  })

  it('returns value mode with search for @field:partial', () => {
    const r = analyzeInput('@assignee:ali')
    expect(r).toMatchObject({ mode: 'value', fieldId: 'assignee', search: 'ali', completedValues: [] })
  })

  it('returns value mode with negate for -@field:partial', () => {
    const r = analyzeInput('-@priority:High')
    expect(r).toMatchObject({ mode: 'value', negate: true, fieldId: 'priority', search: 'High' })
  })

  it('tracks completedValues from comma-separated input', () => {
    const r = analyzeInput('@assignee:alice,bo')
    expect(r).toMatchObject({ mode: 'value', completedValues: ['alice'], search: 'bo' })
  })

  it('returns empty search after trailing comma', () => {
    const r = analyzeInput('@assignee:alice,')
    expect(r).toMatchObject({ mode: 'value', completedValues: ['alice'], search: '' })
  })
})

describe('parseQuery — single filter', () => {
  it('parses @field:value', () => {
    expect(parseQuery('@assignee:alice')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'assignee', values: ['alice'], negate: false },
    ])
  })

  it('parses -@field:value as negated', () => {
    expect(parseQuery('-@priority:High')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'priority', values: ['High'], negate: true },
    ])
  })

  it('handles extra whitespace around tokens', () => {
    expect(parseQuery('  @status : todo  ')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'status', values: ['todo'], negate: false },
    ])
  })
})

describe('parseQuery — OR within field (comma-separated values)', () => {
  it('parses @field:val1,val2 as two values', () => {
    expect(parseQuery('@assignee:alice,bob')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'assignee', values: ['alice', 'bob'], negate: false },
    ])
  })

  it('parses three comma-separated values', () => {
    expect(parseQuery('@status:todo,in_progress,done')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'status', values: ['todo', 'in_progress', 'done'], negate: false },
    ])
  })

  it('handles spaces around commas', () => {
    const result = parseQuery('@assignee:alice, bob')
    expect(result[0].values).toEqual(['alice', 'bob'])
  })

  it('parses negated multi-value -@field:val1,val2', () => {
    expect(parseQuery('-@priority:High,Critical')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'priority', values: ['High', 'Critical'], negate: true },
    ])
  })
})

describe('parseQuery — AND across fields (multiple groups)', () => {
  it('parses two fields as two groups', () => {
    expect(parseQuery('@assignee:alice @status:todo')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'assignee', values: ['alice'], negate: false },
      { fieldId: 'status', values: ['todo'], negate: false },
    ])
  })

  it('parses mixed positive and negated groups', () => {
    expect(parseQuery('@assignee:alice -@priority:High')).toEqual<ParsedFilterGroup[]>([
      { fieldId: 'assignee', values: ['alice'], negate: false },
      { fieldId: 'priority', values: ['High'], negate: true },
    ])
  })

  it('parses complex mixed query', () => {
    const result = parseQuery('@assignee:alice,bob -@priority:High @status:todo')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ fieldId: 'assignee', values: ['alice', 'bob'], negate: false })
    expect(result[1]).toEqual({ fieldId: 'priority', values: ['High'], negate: true })
    expect(result[2]).toEqual({ fieldId: 'status', values: ['todo'], negate: false })
  })
})

describe('parseQuery — edge cases', () => {
  it('returns [] for empty string', () => {
    expect(parseQuery('')).toEqual([])
  })

  it('returns [] for whitespace-only string', () => {
    expect(parseQuery('   ')).toEqual([])
  })

  it('returns [] for bare @ with no field', () => {
    expect(parseQuery('@')).toEqual([])
  })

  it('returns [] for @field with no colon', () => {
    expect(parseQuery('@assignee')).toEqual([])
  })

  it('skips invalid tokens and parses valid ones', () => {
    const result = parseQuery('garbage @status:todo moregarbage')
    expect(result).toEqual([{ fieldId: 'status', values: ['todo'], negate: false }])
  })

  it('handles UUIDs as values', () => {
    const result = parseQuery('@assignee:user-123,user-456')
    expect(result[0].values).toEqual(['user-123', 'user-456'])
  })

  it('is callable multiple times (stateless)', () => {
    parseQuery('@assignee:alice')
    parseQuery('@status:todo')
    const r = parseQuery('@priority:High')
    expect(r).toEqual([{ fieldId: 'priority', values: ['High'], negate: false }])
  })
})
