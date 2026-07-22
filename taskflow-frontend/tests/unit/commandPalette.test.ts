import { describe, it, expect } from 'vitest'
import { fuzzyScore, filterCommands, type CommandItem } from '../../src/lib/commandPalette'

describe('fuzzyScore', () => {
  it('returns null when chars are missing or out of order', () => {
    expect(fuzzyScore('Members', 'xyz')).toBeNull()
    expect(fuzzyScore('Members', 'srebmem')).toBeNull()  // reversed
  })

  it('matches subsequences', () => {
    expect(fuzzyScore('Project Settings', 'pset')).not.toBeNull()
    expect(fuzzyScore('Project Settings', 'settings')).not.toBeNull()
  })

  it('empty query scores 0 (everything matches)', () => {
    expect(fuzzyScore('anything', '')).toBe(0)
  })

  it('scores a contiguous prefix higher than a scattered match', () => {
    const prefix = fuzzyScore('settings', 'set')!
    const scattered = fuzzyScore('select tags', 'set')!  // s..e..t spread out
    expect(prefix).toBeGreaterThan(scattered)
  })

  it('rewards word-boundary hits', () => {
    // 'b' as the start of a word should beat 'b' buried mid-word
    const boundary = fuzzyScore('Go to Board', 'b')!
    const buried = fuzzyScore('Subtask', 'b')!
    expect(boundary).toBeGreaterThan(buried)
  })
})

describe('filterCommands', () => {
  const cmds: CommandItem[] = [
    { id: 'members', title: 'Go to Members', group: 'Navigate', keywords: ['team', 'people'] },
    { id: 'settings', title: 'Go to Project Settings', group: 'Navigate', keywords: ['config'] },
    { id: 'task', title: 'Create task', group: 'Create', keywords: ['add', 'new'] },
    { id: 'theme', title: 'Theme: Dark', group: 'View' },
  ]

  it('empty query returns the list unchanged (same order)', () => {
    expect(filterCommands(cmds, '')).toEqual(cmds)
    expect(filterCommands(cmds, '   ')).toEqual(cmds)
  })

  it('drops non-matching commands', () => {
    const out = filterCommands(cmds, 'zzz')
    expect(out).toHaveLength(0)
  })

  it('matches against keywords, not just the title', () => {
    const out = filterCommands(cmds, 'people')
    expect(out.map((c) => c.id)).toContain('members')
  })

  it('ranks the better title match first', () => {
    const out = filterCommands(cmds, 'task')
    expect(out[0].id).toBe('task')   // "Create task" beats anything else for "task"
  })

  it('is a stable sort on score ties', () => {
    const ties: CommandItem[] = [
      { id: 'a', title: 'Alpha', group: 'g' },
      { id: 'b', title: 'Alpha', group: 'g' },  // identical title → identical score
      { id: 'c', title: 'Alpha', group: 'g' },
    ]
    expect(filterCommands(ties, 'alpha').map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
})
