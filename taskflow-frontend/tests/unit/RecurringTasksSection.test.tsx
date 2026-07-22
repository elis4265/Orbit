import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RecurringTasksSection from '../../src/components/RecurringTasksSection'

const mockCreate = { mutateAsync: vi.fn(), isPending: false }
const mockUpdate = { mutate: vi.fn() }
const mockDelete = { mutate: vi.fn() }
const mockUseRecurring = vi.fn()

vi.mock('../../src/hooks/useRecurringTasks', () => ({
  useRecurringTasks: () => mockUseRecurring(),
  useCreateRecurringTask: () => mockCreate,
  useUpdateRecurringTask: () => mockUpdate,
  useDeleteRecurringTask: () => mockDelete,
}))

vi.mock('../../src/hooks/useTaskTemplates', () => ({
  useTaskTemplates: () => ({ data: [{ id: 'tpl-1', name: 'Standup prep' }] }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockUseRecurring.mockReturnValue({ data: [] })
})

// ── REQ-148 — recurring tasks UI ─────────────────────────────────────────────

describe('REQ-148 — RecurringTasksSection', () => {
  it('[REQ-148] creates a weekly schedule with the chosen weekday', async () => {
    mockCreate.mutateAsync.mockResolvedValue({})
    render(<RecurringTasksSection projectId="p-1" />)
    fireEvent.change(screen.getByLabelText('Template'), { target: { value: 'tpl-1' } })
    fireEvent.change(screen.getByLabelText('Cadence'), { target: { value: 'weekly' } })
    fireEvent.change(screen.getByLabelText('Weekday'), { target: { value: '2' } })
    fireEvent.click(screen.getByText('Add schedule'))
    await waitFor(() => expect(mockCreate.mutateAsync).toHaveBeenCalledWith({
      template_id: 'tpl-1', cadence: 'weekly', weekday: 2, day_of_month: undefined,
    }))
  })

  it('[REQ-148] lists rules with cadence label and toggles enabled', () => {
    mockUseRecurring.mockReturnValue({ data: [{
      id: 'r-1', project_id: 'p-1', template_id: 'tpl-1', cadence: 'weekly',
      weekday: 0, day_of_month: null, next_run_at: '2026-07-06', enabled: true, created_by: 'u', created_at: '',
    }] })
    render(<RecurringTasksSection projectId="p-1" />)
    // template name appears in both the picker option and the rule row
    expect(screen.getAllByText('Standup prep').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/every Monday/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(mockUpdate.mutate).toHaveBeenCalledWith({ id: 'r-1', data: { enabled: false } })
  })
})
