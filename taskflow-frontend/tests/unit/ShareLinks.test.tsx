// REQ-163 — share links: menu pane (admin) + public page
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import TaskActionsMenu from '../../src/components/TaskActionsMenu'
import PublicSharePage from '../../src/pages/PublicSharePage'

const mockCreate = vi.fn().mockResolvedValue({ id: 'l1', token: 'tok-abc', revoked: false, created_at: '' })
const mockList = vi.fn().mockResolvedValue([{ id: 'l1', token: 'tok-abc', revoked: false, created_at: '' }])
const mockRevoke = vi.fn().mockResolvedValue(undefined)
const mockPublic = vi.fn().mockResolvedValue({
  key: 'SHR-1', title: 'Public bug', description: '<p>details</p>', status: 'in_progress',
  issue_type: 'bug', tags: [], subtasks: [{ title: 'step', is_completed: true }],
  comments: [{ content: '<p>note</p>', created_at: '' }],
})
vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return {
    ...actual,
    shareLinkApi: {
      create: (...a: unknown[]) => mockCreate(...a),
      list: (...a: unknown[]) => mockList(...a),
      revoke: (...a: unknown[]) => mockRevoke(...a),
      publicTask: (...a: unknown[]) => mockPublic(...a),
    },
  }
})
vi.mock('../../src/hooks/useProjects', () => ({ useProjects: () => ({ data: [] }) }))

function withQc(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('REQ-163 — share links', () => {
  it('admin sees Share publicly and the pane lists + revokes links', async () => {
    render(withQc(
      <TaskActionsMenu projectId="p1" taskId="t1" onActionDone={vi.fn()} isAdmin />
    ))
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    fireEvent.click(screen.getByText('Share publicly…'))
    const input = await screen.findByLabelText('Share URL')
    expect((input as HTMLInputElement).value).toContain('/share/tok-abc')
    fireEvent.click(screen.getByRole('button', { name: /revoke link/i }))
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('p1', 't1', 'l1'))
  })

  it('non-admin gets no share item', () => {
    render(withQc(
      <TaskActionsMenu projectId="p1" taskId="t1" onActionDone={vi.fn()} isAdmin={false} />
    ))
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    expect(screen.queryByText('Share publicly…')).not.toBeInTheDocument()
  })

  it('public page renders the allowlisted payload', async () => {
    render(withQc(
      <MemoryRouter initialEntries={['/share/tok-abc']}>
        <Routes>
          <Route path="/share/:token" element={<PublicSharePage />} />
        </Routes>
      </MemoryRouter>
    ))
    expect(await screen.findByText('Public bug')).toBeInTheDocument()
    expect(screen.getByText(/SHR-1/)).toBeInTheDocument()
    expect(screen.getByText(/step/)).toBeInTheDocument()
  })

  it('public page shows a friendly 404', async () => {
    mockPublic.mockRejectedValueOnce(new Error('404'))
    render(withQc(
      <MemoryRouter initialEntries={['/share/dead']}>
        <Routes>
          <Route path="/share/:token" element={<PublicSharePage />} />
        </Routes>
      </MemoryRouter>
    ))
    expect(await screen.findByText(/doesn't exist or has been revoked/i)).toBeInTheDocument()
  })
})
