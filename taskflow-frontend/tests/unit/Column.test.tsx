import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DndContext } from '@dnd-kit/core'
import Column from '../../src/components/Column'

function Wrapper({ children }: { children: React.ReactNode }) {
  return <DndContext>{children}</DndContext>
}

const baseProps = {
  columnId: 'done',
  label: 'Done',
  tasks: [],
  onAddClick: vi.fn(),
  onDelete: vi.fn(),
  onCardClick: vi.fn(),
}

// ── REQ-139 — "Show older" escape hatch on the Done column ───────────────────

describe('REQ-139 — show-older toggle', () => {
  it('[REQ-139] no toggle rendered when onToggleShowOlder is not provided', () => {
    render(<Column {...baseProps} />, { wrapper: Wrapper })
    expect(screen.queryByText(/older completed tasks/i)).not.toBeInTheDocument()
  })

  it('[REQ-139] renders "Show older completed tasks" and fires the callback', () => {
    const onToggle = vi.fn()
    render(<Column {...baseProps} onToggleShowOlder={onToggle} showingOlder={false} />, { wrapper: Wrapper })
    const btn = screen.getByText('Show older completed tasks')
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('[REQ-139] label flips to "Hide older" while revealing', () => {
    render(<Column {...baseProps} onToggleShowOlder={vi.fn()} showingOlder />, { wrapper: Wrapper })
    expect(screen.getByText('Hide older completed tasks')).toBeInTheDocument()
  })
})
