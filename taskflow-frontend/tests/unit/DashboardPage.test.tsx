import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DashboardPage from '../../src/pages/DashboardPage'

vi.mock('../../src/hooks/useProjects', () => ({
  useProjects: () => ({ data: [{ id: 'p-1', name: 'Orbit Core' }] }),
}))
vi.mock('../../src/hooks/useBoards', () => ({
  useBoards: () => ({ data: [{ id: 'b-1', name: 'Main' }] }),
}))
vi.mock('../../src/components/BurndownChart', () => ({ default: () => <div data-testid="burndown" /> }))
vi.mock('../../src/components/CumulativeFlowChart', () => ({ default: () => <div data-testid="cfd" /> }))
vi.mock('../../src/components/TimeInStatusChart', () => ({ default: () => <div data-testid="tis" /> }))
vi.mock('../../src/components/VelocityChart', () => ({ default: () => <div data-testid="velocity" /> }))

function renderPage() {
  render(<MemoryRouter><DashboardPage /></MemoryRouter>)
}

beforeEach(() => {
  localStorage.clear()
})

// ── REQ-151 — dashboard ──────────────────────────────────────────────────────

describe('REQ-151 — DashboardPage', () => {
  it('[REQ-151] shows empty state without widgets', () => {
    renderPage()
    expect(screen.getByText(/No widgets yet/)).toBeInTheDocument()
  })

  it('[REQ-151] adds a widget and persists it to localStorage', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'p-1' } })
    fireEvent.change(screen.getByLabelText('Widget type'), { target: { value: 'burndown' } })
    fireEvent.change(screen.getByLabelText('Board'), { target: { value: 'b-1' } })
    fireEvent.click(screen.getByText('Add widget'))
    expect(screen.getByTestId('burndown')).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem('orbit_dashboard_widgets') ?? '[]')
    expect(saved).toHaveLength(1)
    expect(saved[0].type).toBe('burndown')
  })

  it('[REQ-151] loads saved widgets and removes one', () => {
    localStorage.setItem('orbit_dashboard_widgets', JSON.stringify([
      { id: 'w1', type: 'velocity', projectId: 'p-1', boardId: null },
    ]))
    renderPage()
    expect(screen.getByTestId('velocity')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Remove widget'))
    expect(screen.queryByTestId('velocity')).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('orbit_dashboard_widgets')!)).toHaveLength(0)
  })
})
