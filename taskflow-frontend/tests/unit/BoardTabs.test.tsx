import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BoardTabs from '../../src/components/BoardTabs'

const boards = [
  { id: 'b-1', name: 'Sprint 1', workspace_id: 'ws-1', created_at: '' },
  { id: 'b-2', name: 'Sprint 2', workspace_id: 'ws-1', created_at: '' },
]

function tabsProps(overrides: Partial<Parameters<typeof BoardTabs>[0]> = {}) {
  return {
    boards,
    activeId: 'b-1',
    activeSpecialTab: null,
    hasActiveSprint: false,
    onSelectSpecial: vi.fn(),
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    canManage: true,
    ...overrides,
  }
}

// ── REQ-011: List Boards ──────────────────────────────────────────────────
// Shall: All boards in a workspace shall be displayed as tabs.

describe('REQ-011 — List Boards', () => {
  it('[REQ-011] renders a tab for each board', () => {
    render(<BoardTabs {...tabsProps()} />)
    expect(screen.getByRole('tab', { name: 'Sprint 1' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sprint 2' })).toBeInTheDocument()
  })

  it('[REQ-011] active board tab is marked selected', () => {
    render(<BoardTabs {...tabsProps()} />)
    expect(screen.getByRole('tab', { name: 'Sprint 1' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Sprint 2' })).toHaveAttribute('aria-selected', 'false')
  })

  it('[REQ-011] clicking an inactive tab calls onSelect with its id', () => {
    const onSelect = vi.fn()
    render(<BoardTabs {...tabsProps({ onSelect })} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sprint 2' }))
    expect(onSelect).toHaveBeenCalledWith('b-2')
  })
})

// ── REQ-010: Create Board ─────────────────────────────────────────────────
// Shall: A project admin shall be able to create a new board (HW-37 narrowed
// this from "member" — the server always required admin).

describe('REQ-010 — Create Board', () => {
  it('[REQ-010] typing a name and pressing Enter calls onCreate', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<BoardTabs {...tabsProps({ onCreate })} />)
    fireEvent.click(screen.getByRole('button', { name: /new board/i }))
    const input = screen.getByPlaceholderText(/board name/i)
    fireEvent.change(input, { target: { value: 'Sprint 3' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Sprint 3'))
  })

  it('[REQ-010] blank board name is rejected — onCreate not called', () => {
    const onCreate = vi.fn()
    render(<BoardTabs {...tabsProps({ onCreate })} />)
    fireEvent.click(screen.getByRole('button', { name: /new board/i }))
    const input = screen.getByPlaceholderText(/board name/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCreate).not.toHaveBeenCalled()
  })
})

// ── REQ-012: Rename Board ─────────────────────────────────────────────────

describe('REQ-012 — Rename Board', () => {
  it('[REQ-012] rename control exists only for the active board', () => {
    render(<BoardTabs {...tabsProps()} />)
    expect(screen.getByLabelText('Rename board b-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Rename board b-2')).not.toBeInTheDocument()
  })

  it('[REQ-012] confirming new name calls onRename with id and new name', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    render(<BoardTabs {...tabsProps({ onRename })} />)
    fireEvent.click(screen.getByLabelText('Rename board b-1'))
    const input = screen.getByDisplayValue('Sprint 1')
    fireEvent.change(input, { target: { value: 'Q3 Sprint' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('b-1', 'Q3 Sprint'))
  })

  it('[REQ-012] Escape cancels rename without calling onRename', () => {
    const onRename = vi.fn()
    render(<BoardTabs {...tabsProps({ onRename })} />)
    fireEvent.click(screen.getByLabelText('Rename board b-1'))
    fireEvent.keyDown(screen.getByDisplayValue('Sprint 1'), { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
  })
})

// ── REQ-013: Delete Board ─────────────────────────────────────────────────

describe('REQ-013 — Delete Board', () => {
  it('[REQ-013] delete control exists only for the active board', () => {
    render(<BoardTabs {...tabsProps()} />)
    expect(screen.getByLabelText('Delete board b-1')).toBeInTheDocument()
    expect(screen.queryByLabelText('Delete board b-2')).not.toBeInTheDocument()
  })

  it('[REQ-013] clicking delete calls onDelete with the board id', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<BoardTabs {...tabsProps({ onDelete })} />)
    fireEvent.click(screen.getByLabelText('Delete board b-1'))
    // confirm dialog appears — click Yes
    fireEvent.click(screen.getByText('Yes'))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('b-1'))
  })
})

// ── HW-37 (REQ-169-2): admin-only rendering ───────────────────────────────

describe('HW-37 — board management controls render only for admins', () => {
  it('hides create, rename, and delete when not canManage', () => {
    render(<BoardTabs {...tabsProps({ canManage: false })} />)
    expect(screen.queryByRole('button', { name: /new board/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Rename board b-1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Delete board b-1')).not.toBeInTheDocument()
  })

  it('board switching still works without canManage', () => {
    const onSelect = vi.fn()
    render(<BoardTabs {...tabsProps({ canManage: false, onSelect })} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sprint 2' }))
    expect(onSelect).toHaveBeenCalledWith('b-2')
  })

  it('[REQ-169-6] a rejected rename surfaces the server detail', async () => {
    const onRename = vi.fn().mockRejectedValue({ response: { data: { detail: 'Admin access required.' } } })
    render(<BoardTabs {...tabsProps({ onRename })} />)
    fireEvent.click(screen.getByLabelText('Rename board b-1'))
    const input = screen.getByDisplayValue('Sprint 1')
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('Admin access required.')).toBeInTheDocument()
  })
})
