import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ProjectSelector from '../../src/components/ProjectSelector'

const workspaces = [
  { id: 'ws-1', name: 'My Workspace', owner_id: 'user-1', created_at: '' },
  { id: 'ws-2', name: 'Second Workspace', owner_id: 'user-1', created_at: '' },
]

function openDropdown() {
  fireEvent.click(screen.getByRole('button', { name: /my workspace/i }))
}

// ── REQ-008: Rename Workspace ─────────────────────────────────────────────
// Shall: A workspace owner shall be able to rename their workspace.

describe('REQ-008 — Rename Workspace', () => {
  it('[REQ-008] shows rename control only for the active workspace', () => {
    render(
      <ProjectSelector
        projects={workspaces}
        activeId="ws-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    openDropdown()
    expect(screen.getByLabelText('Rename project ws-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rename project ws-2')).not.toBeInTheDocument()
  })

  it('[REQ-008] confirming a new name calls onRename with id and new name', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    render(
      <ProjectSelector
        projects={workspaces}
        activeId="ws-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    )
    openDropdown()
    fireEvent.click(screen.getByLabelText('Rename project ws-1'))
    const input = screen.getByDisplayValue('My Workspace')
    fireEvent.change(input, { target: { value: 'Renamed WS' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('ws-1', 'Renamed WS'))
  })

  it('[REQ-008] Escape cancels rename without calling onRename', () => {
    const onRename = vi.fn()
    render(
      <ProjectSelector
        projects={workspaces}
        activeId="ws-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    )
    openDropdown()
    fireEvent.click(screen.getByLabelText('Rename project ws-1'))
    fireEvent.keyDown(screen.getByDisplayValue('My Workspace'), { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('[REQ-008] blank name is rejected — onRename not called', () => {
    const onRename = vi.fn()
    render(
      <ProjectSelector
        projects={workspaces}
        activeId="ws-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn()}
      />
    )
    openDropdown()
    fireEvent.click(screen.getByLabelText('Rename project ws-1'))
    const input = screen.getByDisplayValue('My Workspace')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })
})

// ── REQ-009: Delete Workspace ─────────────────────────────────────────────
// Shall: A workspace owner shall be able to delete their workspace.

describe('REQ-009 — Delete Workspace', () => {
  it('[REQ-009] shows delete control only for the active workspace', () => {
    render(
      <ProjectSelector
        projects={workspaces}
        activeId="ws-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    openDropdown()
    expect(screen.getByLabelText('Delete project ws-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Delete project ws-2')).not.toBeInTheDocument()
  })

  it('[REQ-009] clicking delete calls onDelete with the workspace id', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <ProjectSelector
        projects={workspaces}
        activeId="ws-1"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRename={vi.fn()}
        onDelete={onDelete}
      />
    )
    openDropdown()
    fireEvent.click(screen.getByLabelText('Delete project ws-1'))
    // confirm dialog appears — click Yes
    fireEvent.click(screen.getByText('Yes'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('ws-1'))
  })
})
