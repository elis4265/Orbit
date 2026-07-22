import { describe, it, expect } from 'vitest'
import { matchesKey } from '../../src/keybindings'

function ev(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('matchesKey', () => {
  it('Ctrl+k binding matches both Ctrl and Cmd (cross-platform)', () => {
    expect(matchesKey(ev({ key: 'k', ctrlKey: true }), 'Ctrl+k')).toBe(true)
    expect(matchesKey(ev({ key: 'k', metaKey: true }), 'Ctrl+k')).toBe(true)
  })

  it('Ctrl+k does not match a bare k', () => {
    expect(matchesKey(ev({ key: 'k' }), 'Ctrl+k')).toBe(false)
  })

  it('a single-key binding does not match when Cmd/Ctrl is held', () => {
    // regression: Cmd+C must NOT trigger the bare "c" (create-task) binding
    expect(matchesKey(ev({ key: 'c' }), 'c')).toBe(true)
    expect(matchesKey(ev({ key: 'c', metaKey: true }), 'c')).toBe(false)
    expect(matchesKey(ev({ key: 'c', ctrlKey: true }), 'c')).toBe(false)
  })

  it('respects shift and alt flags', () => {
    expect(matchesKey(ev({ key: 'ArrowRight' }), 'ArrowRight')).toBe(true)
    expect(matchesKey(ev({ key: 'ArrowRight', shiftKey: true }), 'ArrowRight')).toBe(false)
  })
})
