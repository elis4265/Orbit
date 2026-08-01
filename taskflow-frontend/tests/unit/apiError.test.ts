import { describe, it, expect } from 'vitest'
import { errorDetail } from '../../src/lib/apiError'

describe('errorDetail — server error → visible text (REQ-169-6)', () => {
  it('reads the backend envelope {"error": {message}}', () => {
    const err = { response: { data: { error: { code: 'FORBIDDEN', message: 'Admin access required.', detail: {} } } } }
    expect(errorDetail(err, 'fallback')).toBe('Admin access required.')
  })

  it('falls back to a bare {"detail": string} shape', () => {
    expect(errorDetail({ response: { data: { detail: 'Nope.' } } }, 'fallback')).toBe('Nope.')
  })

  it('uses the fallback for shapeless errors', () => {
    expect(errorDetail(new Error('network down'), 'fallback')).toBe('fallback')
    expect(errorDetail(undefined, 'fallback')).toBe('fallback')
    expect(errorDetail({ response: { data: { error: { message: '' } } } }, 'fallback')).toBe('fallback')
  })
})
