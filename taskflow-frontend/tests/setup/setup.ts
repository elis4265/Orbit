import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Chevrotain v11 uses Object.groupBy internally, which requires Node >= 21.
// CI runs Node 20, so we polyfill it here before any test module loads.
if (!('groupBy' in Object)) {
  ;(Object as Record<string, unknown>).groupBy = function <T>(
    items: Iterable<T>,
    keyFn: (item: T, index: number) => PropertyKey,
  ): Record<PropertyKey, T[]> {
    const result: Record<PropertyKey, T[]> = Object.create(null)
    let i = 0
    for (const item of items) {
      const key = keyFn(item, i++)
      if (!(key in result)) result[key] = []
      result[key].push(item)
    }
    return result
  }
}

// jsdom's localStorage is not reliably initialized when components call it synchronously
// in their render body. Provide a stateful stub for all tests.
const store: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value }),
  removeItem: vi.fn((key: string) => { delete store[key] }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]) }),
}
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// jsdom ships no window.matchMedia. Default it to "no media query matches", i.e. the
// desktop (>= md) layout, so existing tests keep asserting today's desktop behavior.
// Mobile tests override window.matchMedia locally.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
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
