// REQ-156 — task ⋯ menu: clone + move to project (Jira/YouTrack placement)
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import TaskActionsMenu from '../../src/components/TaskActionsMenu'
import { server } from '../setup/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const BASE = 'http://localhost/api/v1'

function mockProjects() {
  server.use(
    http.get(`${BASE}/projects`, () =>
      HttpResponse.json([
        { id: 'p1', name: 'Source', owner_id: 'u1', created_at: '', key: 'SRC' },
        { id: 'p2', name: 'Target', owner_id: 'u1', created_at: '', key: 'DST' },
      ])
    )
  )
}

function renderMenu(onActionDone = vi.fn()) {
  localStorage.setItem('access_token', 'test-token') // useProjects is token-gated
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TaskActionsMenu projectId="p1" taskId="t1" onActionDone={onActionDone} />
    </QueryClientProvider>
  )
  return onActionDone
}

describe('REQ-156 — TaskActionsMenu', () => {
  it('opens a menu with Clone and Move actions', () => {
    mockProjects()
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    expect(screen.getByText('Clone task')).toBeInTheDocument()
    expect(screen.getByText('Move to project…')).toBeInTheDocument()
  })

  it('clone posts to the clone endpoint and signals done', async () => {
    mockProjects()
    let cloned = false
    server.use(
      http.post(`${BASE}/projects/p1/tasks/t1/clone`, () => {
        cloned = true
        return HttpResponse.json({ id: 't2', title: 'X' }, { status: 201 })
      })
    )
    const done = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    fireEvent.click(screen.getByText('Clone task'))
    await waitFor(() => expect(cloned).toBe(true))
    await waitFor(() => expect(done).toHaveBeenCalled())
  })

  it('move lists only OTHER projects and posts the chosen target', async () => {
    mockProjects()
    let movedTo: unknown = null
    server.use(
      http.post(`${BASE}/projects/p1/tasks/t1/move`, async ({ request }) => {
        movedTo = await request.json()
        return HttpResponse.json({ id: 't1', project_id: 'p2' })
      })
    )
    const done = renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    fireEvent.click(screen.getByText('Move to project…'))

    expect(await screen.findByText('Target')).toBeInTheDocument()
    expect(screen.queryByText('Source')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Target'))
    await waitFor(() => expect(movedTo).toEqual({ target_project_id: 'p2' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
  })

  it('shows an error when move is rejected', async () => {
    mockProjects()
    server.use(
      http.post(`${BASE}/projects/p1/tasks/t1/move`, () =>
        HttpResponse.json(
          { error: { code: 'conflict', message: 'This task has nested children.' } },
          { status: 409 }
        )
      )
    )
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /task actions/i }))
    fireEvent.click(screen.getByText('Move to project…'))
    fireEvent.click(await screen.findByText('Target'))
    expect(await screen.findByText(/nested children/i)).toBeInTheDocument()
  })
})
