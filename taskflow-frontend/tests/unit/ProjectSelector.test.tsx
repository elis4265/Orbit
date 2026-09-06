import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ProjectSelector from '../../src/components/ProjectSelector'
import { canManageProject } from '../../src/lib/rbac'
import type { Project } from '../../src/types'

const projects = [
  { id: 'p-1', name: 'Orbit', key: 'ORB', owner_id: 'u-owner', mode: 'open' },
  { id: 'p-2', name: 'Side', key: 'SIDE', owner_id: 'u-other', mode: 'open' },
] as Project[]

function props(overrides = {}) {
  return {
    projects,
    activeId: 'p-1',
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    canManage: true,
    canCreate: true,
    ...overrides,
  }
}

function openDropdown() {
  fireEvent.click(screen.getByRole('button', { name: /orbit/i }))
}

describe('ProjectSelector — admin-only rename/delete rendering', () => {
  it('shows rename and delete for the active project when canManage', () => {
    render(<ProjectSelector {...props()} />)
    openDropdown()
    expect(screen.getByLabelText('Rename project p-1')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete project p-1')).toBeInTheDocument()
  })

  it('hides rename and delete when not canManage', () => {
    render(<ProjectSelector {...props({ canManage: false })} />)
    openDropdown()
    expect(screen.queryByLabelText('Rename project p-1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Delete project p-1')).not.toBeInTheDocument()
    // project switching and creation stay available
    expect(screen.getByText('Side')).toBeInTheDocument()
    expect(screen.getByText(/new project/i)).toBeInTheDocument()
  })

  it('hides "New project" when not canCreate', () => {
    render(<ProjectSelector {...props({ canCreate: false })} />)
    openDropdown()
    expect(screen.queryByText(/new project/i)).not.toBeInTheDocument()
    // switching projects still works
    expect(screen.getByText('Side')).toBeInTheDocument()
  })

  it('surfaces a failed rename instead of failing silently (REQ-169-6)', async () => {
    const onRename = vi.fn().mockRejectedValue({ response: { data: { detail: 'Admin access required.' } } })
    render(<ProjectSelector {...props({ onRename })} />)
    openDropdown()
    fireEvent.click(screen.getByLabelText('Rename project p-1'))
    const input = screen.getByDisplayValue('Orbit')
    fireEvent.change(input, { target: { value: 'Renamed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Admin access required.')).toBeInTheDocument()
  })
})

describe('canManageProject — mirrors the server admin gate', () => {
  const project = projects[0]

  it('owner is admin without a members row', () => {
    expect(canManageProject(project, 'u-owner', [])).toBe(true)
  })

  it('admin member is admin', () => {
    expect(canManageProject(project, 'u-a', [{ id: 'u-a', role: 'admin' }])).toBe(true)
  })

  it('member and viewer are not', () => {
    expect(canManageProject(project, 'u-m', [{ id: 'u-m', role: 'member' }])).toBe(false)
    expect(canManageProject(project, 'u-v', [{ id: 'u-v', role: 'viewer' }])).toBe(false)
  })

  it('no project or no user is not', () => {
    expect(canManageProject(undefined, 'u-owner', [])).toBe(false)
    expect(canManageProject(project, undefined, [])).toBe(false)
  })
})
