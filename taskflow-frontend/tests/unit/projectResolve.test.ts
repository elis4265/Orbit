import { describe, it, expect } from 'vitest'
import { isUuid, resolveProjectId } from '../../src/lib/projectResolve'
import type { Project } from '../../src/types'

const UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const OTHER = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'

const projects = [
  { id: UUID, key: 'HW', name: 'Homework' },
  { id: OTHER, key: 'ORB', name: 'Orbit' },
] as Project[]

describe('isUuid', () => {
  it('accepts a canonical uuid, case-insensitively', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid(UUID.toUpperCase())).toBe(true)
  })

  it('rejects keys, empty, and near-misses', () => {
    expect(isUuid('HW')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(UUID + 'x')).toBe(false)
    expect(isUuid(UUID.replace('-', ''))).toBe(false)
  })
})

describe('resolveProjectId', () => {
  it('resolves a key to the project id, case-insensitively', () => {
    expect(resolveProjectId('HW', projects)).toBe(UUID)
    expect(resolveProjectId('hw', projects)).toBe(UUID)
    expect(resolveProjectId('orb', projects)).toBe(OTHER)
  })

  it('passes a raw uuid through (legacy / post-auth redirects)', () => {
    expect(resolveProjectId(UUID, projects)).toBe(UUID)
  })

  it('passes an unknown uuid through unchanged', () => {
    const unknown = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f'
    expect(resolveProjectId(unknown, projects)).toBe(unknown)
  })

  it('never leaks a key as the id while projects are loading', () => {
    expect(resolveProjectId('HW', [])).toBe('')
  })

  it('returns empty for an unknown key or missing param', () => {
    expect(resolveProjectId('NOPE', projects)).toBe('')
    expect(resolveProjectId(undefined, projects)).toBe('')
    expect(resolveProjectId('', projects)).toBe('')
  })
})
