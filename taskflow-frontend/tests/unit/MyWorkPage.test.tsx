import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MyWorkPage from '../../src/pages/MyWorkPage'
import type { Task } from '../../src/types'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockUseMyWork = vi.fn()
vi.mock('../../src/hooks/useMyWork', () => ({
  useMyWork: (facet: string) => mockUseMyWork(facet),
}))

function task(overrides: Partial<Task>): Task {
  return {
    id: 't-1', title: 'Fix parser', description: null, status: 'todo', issue_type: 'task',
    severity: null, priority_id: null, position: 0, grid_x: null, grid_y: null,
    project_id: 'p-1', sequence_number: 7, project_key: 'ORB', assignee_id: null,
    start_date: null, due_date: null, parent_id: null, sprint_id: null, release_id: null,
    custom_status_id: null, estimate: null, business_value: null, custom_fields: null,
    version: 1, sub_tasks: [], tags: [], created_by: 'u-1',
    created_at: '', updated_at: '', completed_at: null,
    ...overrides,
  }
}

function renderPage(initialEntry = '/my-work') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/my-work" element={<MyWorkPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseMyWork.mockReturnValue({ data: [], isLoading: false })
})

// ── REQ-142 — My Work page ───────────────────────────────────────────────────

describe('REQ-142 — MyWorkPage', () => {
  it('[REQ-142] renders three facet tabs and defaults to assigned', () => {
    renderPage()
    expect(screen.getByText('Assigned to me')).toBeInTheDocument()
    expect(screen.getByText('Created by me')).toBeInTheDocument()
    expect(screen.getByText('Watching')).toBeInTheDocument()
    expect(mockUseMyWork).toHaveBeenCalledWith('assigned')
  })

  it('[REQ-142] reads facet from the URL', () => {
    renderPage('/my-work?facet=watching')
    expect(mockUseMyWork).toHaveBeenCalledWith('watching')
  })

  it('[REQ-142] falls back to assigned on nonsense facet', () => {
    renderPage('/my-work?facet=bogus')
    expect(mockUseMyWork).toHaveBeenCalledWith('assigned')
  })

  it('[REQ-142] switching tab queries the new facet', () => {
    renderPage()
    fireEvent.click(screen.getByText('Created by me'))
    expect(mockUseMyWork).toHaveBeenCalledWith('created')
  })

  it('[REQ-142] renders task rows with project key and title', () => {
    mockUseMyWork.mockReturnValue({ data: [task({})], isLoading: false })
    renderPage()
    expect(screen.getByText('ORB-7')).toBeInTheDocument()
    expect(screen.getByText('Fix parser')).toBeInTheDocument()
  })

  it('[REQ-142] clicking a row deep-links to the task in its project', () => {
    mockUseMyWork.mockReturnValue({ data: [task({})], isLoading: false })
    renderPage()
    fireEvent.click(screen.getByText('Fix parser'))
    expect(mockNavigate).toHaveBeenCalledWith('/projects/ORB?task=t-1')
  })

  it('[REQ-142] shows overdue badge for past-due unfinished tasks', () => {
    mockUseMyWork.mockReturnValue({
      // t-2 is done via completed_at while status stays 'todo' — the custom-status
      // case (HW-3): a resolved task must not count as overdue.
      data: [task({ due_date: '2020-01-01T00:00:00Z' }), task({ id: 't-2', due_date: '2020-01-01T00:00:00Z', completed_at: '2020-02-01T00:00:00Z' })],
      isLoading: false,
    })
    renderPage()
    expect(screen.getByText('1 overdue')).toBeInTheDocument()
  })

  it('[REQ-142] shows empty state per facet', () => {
    renderPage('/my-work?facet=watching')
    expect(screen.getByText(/not watching any tasks/i)).toBeInTheDocument()
  })
})
