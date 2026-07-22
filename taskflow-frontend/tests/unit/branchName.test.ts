import { describe, it, expect } from 'vitest'
import { branchName } from '../../src/lib/branchName'

describe('branchName', () => {
  it('builds handle/key-seq-slug', () => {
    expect(branchName('Anon', 'ORB', 123, 'Fix the parser bug')).toBe('anon/orb-123-fix-the-parser-bug')
  })

  it('lowercases the key', () => {
    expect(branchName('dev', 'GH', 7, 'x')).toBe('dev/gh-7-x')
  })

  it('falls back to "user" when username is empty', () => {
    expect(branchName('', 'ORB', 1, 'thing')).toBe('user/orb-1-thing')
  })

  it('omits the title part when title has no slug chars', () => {
    expect(branchName('dev', 'ORB', 9, '!!!')).toBe('dev/orb-9')
    expect(branchName('dev', 'ORB', 9, '')).toBe('dev/orb-9')
  })

  it('strips special chars and collapses separators', () => {
    expect(branchName('dev', 'ORB', 5, 'Add  OAuth/Device — flow!')).toBe('dev/orb-5-add-oauth-device-flow')
  })

  it('truncates a long title and trims a trailing dash', () => {
    const out = branchName('dev', 'ORB', 5, 'a'.repeat(60))
    expect(out.startsWith('dev/orb-5-')).toBe(true)
    expect(out.endsWith('-')).toBe(false)
    expect(out.length).toBeLessThanOrEqual('dev/orb-5-'.length + 40)
  })
})
