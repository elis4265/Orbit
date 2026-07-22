import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SprintPanel from '../../src/components/SprintPanel'
import type { ProjectMode } from '../../src/types'

const mockCloseSprint = { mutate: vi.fn(), isPending: false }
const mockCompleteSprint = { mutateAsync: vi.fn(), isPending: false }

vi.mock('../../src/hooks/useSprints', () => ({
  useSprints: vi.fn(() => ({ data: [
    { id: 'sp-1', name: 'Sprint 1', status: 'active', start_date: '2026-06-20', end_date: '2026-07-04', project_id: 'p-1', board_id: 'b-1' },
  ] })),
  useCreateSprint: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateSprint: () => ({ mutate: vi.fn(), isPending: false }),
  useCloseSprint: () => mockCloseSprint,
  useCompleteSprint: () => mockCompleteSprint,
  useDeleteSprint: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('../../src/hooks/useEstimation', () => ({
  useVelocity: () => ({ data: undefined }),
  useSprintReport: () => ({ data: undefined }),
}))

function renderPanel(mode: ProjectMode) {
  render(
    <SprintPanel projectId="p-1" boardId="b-1" mode={mode} showPoints={false} onClose={vi.fn()} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── REQ-141 — sprint-end style is a per-close choice in Guided/Enforced ──────

describe('REQ-141 — sprint close vs complete', () => {
  it('[REQ-141] guided mode offers both Close Sprint and Complete Sprint', () => {
    renderPanel('guided')
    expect(screen.getByRole('button', { name: 'Close Sprint' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Sprint' })).toBeInTheDocument()
  })

  it('[REQ-141] enforced mode offers both Close Sprint and Complete Sprint', () => {
    renderPanel('enforced')
    expect(screen.getByRole('button', { name: 'Close Sprint' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete Sprint' })).toBeInTheDocument()
  })

  it('[REQ-141] open (Flow) mode offers only Close Sprint', () => {
    renderPanel('open')
    expect(screen.getByRole('button', { name: 'Close Sprint' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete Sprint' })).not.toBeInTheDocument()
  })

  it('[REQ-141] Close Sprint calls the simple close mutation', () => {
    renderPanel('guided')
    fireEvent.click(screen.getByRole('button', { name: 'Close Sprint' }))
    expect(mockCloseSprint.mutate).toHaveBeenCalledWith('sp-1')
  })

  it('[REQ-141] Complete Sprint opens the disposition dialog in guided mode', () => {
    renderPanel('guided')
    fireEvent.click(screen.getByRole('button', { name: 'Complete Sprint' }))
    expect(screen.getByText(/move/i)).toBeInTheDocument()
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Another sprint')).toBeInTheDocument()
    expect(screen.getByText('New sprint')).toBeInTheDocument()
  })
})
