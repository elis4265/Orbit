// Mobile board-view default: phones start in 'list', but a stored user choice always wins.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  initialBoardViewMode,
  isSmallViewport,
  MOBILE_MEDIA_QUERY,
  VIEW_PREFERENCE_KEY,
} from '../../src/lib/viewport'

const originalMatchMedia = window.matchMedia

/** Force the viewport check to report phone-width (or not). */
function setViewport(small: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === MOBILE_MEDIA_QUERY ? small : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }),
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  })
})

describe('isSmallViewport', () => {
  it('is true below the md breakpoint', () => {
    setViewport(true)
    expect(isSmallViewport()).toBe(true)
  })

  it('is false at md and up', () => {
    setViewport(false)
    expect(isSmallViewport()).toBe(false)
  })

  it('is false (never throws) when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    })
    expect(() => isSmallViewport()).not.toThrow()
    expect(isSmallViewport()).toBe(false)
  })

  it('is false (never throws) when matchMedia throws', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: () => { throw new Error('unsupported') },
    })
    expect(isSmallViewport()).toBe(false)
  })
})

describe('initialBoardViewMode — no stored preference', () => {
  it('falls back to list on a small viewport', () => {
    setViewport(true)
    expect(initialBoardViewMode()).toBe('list')
  })

  it('falls back to kanban on desktop', () => {
    setViewport(false)
    expect(initialBoardViewMode()).toBe('kanban')
  })

  it('does not persist the mobile default — an untouched preference stays empty', () => {
    setViewport(true)
    initialBoardViewMode()
    expect(localStorage.getItem(VIEW_PREFERENCE_KEY)).toBeNull()
  })
})

describe('initialBoardViewMode — stored preference always wins', () => {
  it('honours a stored kanban choice even on a phone', () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, 'kanban')
    setViewport(true)
    expect(initialBoardViewMode()).toBe('kanban')
  })

  it('honours a stored list choice on desktop', () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, 'list')
    setViewport(false)
    expect(initialBoardViewMode()).toBe('list')
  })

  it.each(['calendar', 'gantt', 'roadmap'])('honours a stored %s choice on a phone', (mode) => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, mode)
    setViewport(true)
    expect(initialBoardViewMode()).toBe(mode)
  })

  it('ignores a garbage stored value and uses the viewport default', () => {
    localStorage.setItem(VIEW_PREFERENCE_KEY, 'not-a-view')
    setViewport(true)
    expect(initialBoardViewMode()).toBe('list')
  })
})
