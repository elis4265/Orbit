import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AutomationSection from '../../src/components/AutomationSection'

const mockCreate = vi.fn().mockResolvedValue({})

vi.mock('../../src/hooks/useAutomationRules', () => ({
  useAutomationRules: () => ({ data: [] }),
  useCreateAutomationRule: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDeleteAutomationRule: () => ({ mutate: vi.fn() }),
  useUpdateAutomationRule: () => ({ mutate: vi.fn() }),
}))
vi.mock('../../src/hooks/useMembers', () => ({ useMembers: () => ({ data: [] }) }))
vi.mock('../../src/hooks/useProjectStatuses', () => ({
  useProjectStatuses: () => ({ data: [
    { id: 's1', name: 'To Do', category: 'unstarted', color: '#888', position: 0 },
    { id: 's2', name: 'Done', category: 'completed', color: '#0a0', position: 2 },
  ] }),
}))
vi.mock('../../src/hooks/usePriorities', () => ({ useProjectPriorities: () => ({ data: [] }) }))
vi.mock('../../src/hooks/useTags', () => ({ useTags: () => ({ data: [] }) }))

beforeEach(() => mockCreate.mockClear())

describe('AutomationSection — Git rules authoring', () => {
  it('offers VCS triggers, set_status action and open_prs condition', () => {
    render(<AutomationSection projectId="p1" mode="enforced" />)
    expect(screen.getByRole('option', { name: 'PR/MR merged' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'set status' })).toBeInTheDocument()
    // the open_prs condition field appears once a condition row is added
    fireEvent.click(screen.getByRole('button', { name: /add condition/i }))
    expect(screen.getByRole('option', { name: 'open PRs' })).toBeInTheDocument()
  })

  it('the "close when all PRs merged" template creates the right rule', async () => {
    render(<AutomationSection projectId="p1" mode="enforced" />)
    fireEvent.click(screen.getByRole('button', { name: /close when all PRs merged/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add rule/i }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    const arg = mockCreate.mock.calls[0][0]
    expect(arg.trigger).toBe('pr_merged')
    expect(arg.conditions).toEqual([{ field: 'open_prs', op: 'is_empty' }])
    expect(arg.actions).toEqual([{ type: 'set_status', status: 'Done' }])
  })
})
