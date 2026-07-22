// Last-visited-project resolution: what the post-login landing and the shell's
// project fallback use to pick a project when there is none in the URL.
import { describe, it, expect, beforeEach } from 'vitest'
import {
  LAST_PROJECT_KEY,
  landingProject,
  readLastProjectSeg,
  rememberProjectSeg,
  resolveLastProject,
} from '../../src/lib/lastProject'
import type { Project } from '../../src/types'

const PROJECTS = [
  { id: 'p1', name: 'Loading Game', key: 'LG' },
  { id: 'p2', name: 'Orbit Core', key: 'ORB' },
  { id: 'p3', name: 'Keyless Legacy', key: undefined },
] as Project[]

describe('resolveLastProject', () => {
  it('resolves a stored key case-insensitively', () => {
    expect(resolveLastProject(PROJECTS, 'orb')?.id).toBe('p2')
    expect(resolveLastProject(PROJECTS, 'ORB')?.id).toBe('p2')
  })

  it('resolves a stored raw id (legacy segments)', () => {
    expect(resolveLastProject(PROJECTS, 'p3')?.name).toBe('Keyless Legacy')
  })

  it('returns undefined when nothing is stored', () => {
    expect(resolveLastProject(PROJECTS, null)).toBeUndefined()
  })

  it('returns undefined when the stored project no longer exists', () => {
    expect(resolveLastProject(PROJECTS, 'GONE')).toBeUndefined()
  })
})

describe('landingProject', () => {
  it('prefers the remembered project over the first in the list', () => {
    expect(landingProject(PROJECTS, 'ORB')?.id).toBe('p2')
  })

  it('falls back to the first project when nothing is remembered', () => {
    expect(landingProject(PROJECTS, null)?.id).toBe('p1')
  })

  it('falls back to the first project when the remembered one is gone', () => {
    expect(landingProject(PROJECTS, 'GONE')?.id).toBe('p1')
  })

  it('returns undefined for an empty project list', () => {
    expect(landingProject([], 'ORB')).toBeUndefined()
  })
})

describe('storage round-trip', () => {
  beforeEach(() => localStorage.clear())

  it('remembers and reads back the segment under the stable key', () => {
    rememberProjectSeg('ORB')
    expect(localStorage.getItem(LAST_PROJECT_KEY)).toBe('ORB')
    expect(readLastProjectSeg()).toBe('ORB')
  })

  it('reads null when nothing was stored', () => {
    expect(readLastProjectSeg()).toBeNull()
  })
})
