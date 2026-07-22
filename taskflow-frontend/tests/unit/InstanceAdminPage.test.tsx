// REQ-155 — instance admin page (/admin), superuser-gated
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import InstanceAdminPage from '../../src/pages/InstanceAdminPage'
import { server } from '../setup/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const BASE = 'http://localhost/api/v1'

const ME_SUPER = {
  id: 'user-1', email: 'boss@test.com', username: 'boss', is_verified: true, created_at: '',
  first_name: 'Big', last_name: 'Boss', avatar_url: null, initials: 'BB', is_superuser: true,
}

const USERS = [
  {
    id: 'u-1', email: 'boss@test.com', username: 'boss', first_name: 'Big', last_name: 'Boss',
    is_verified: true, is_active: true, is_superuser: true, created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'u-2', email: 'worker@test.com', username: 'worker', first_name: 'Wage', last_name: 'Slave',
    is_verified: true, is_active: true, is_superuser: false, created_at: '2026-02-01T00:00:00Z',
  },
]

function mockSuperuser() {
  server.use(http.get(`${BASE}/auth/me`, () => HttpResponse.json(ME_SUPER)))
  server.use(http.get(`${BASE}/admin/users`, () => HttpResponse.json({ users: USERS, total: 2 })))
}

function renderPage() {
  localStorage.setItem('access_token', 'test-token')
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<InstanceAdminPage />} />
          <Route path="/" element={<div data-testid="home-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('REQ-155 — Instance Admin page', () => {
  it('lists instance users for a superuser', async () => {
    mockSuperuser()
    renderPage()
    expect(await screen.findByText('worker@test.com')).toBeInTheDocument()
    expect(screen.getByText('boss@test.com')).toBeInTheDocument()
  })

  it('redirects non-superusers home', async () => {
    // default /auth/me handler has no is_superuser → false
    renderPage()
    await waitFor(() => expect(screen.getByTestId('home-probe')).toBeInTheDocument())
  })

  it('deactivate calls PATCH /admin/users/{id}', async () => {
    mockSuperuser()
    let patched: { id: string; body: unknown } | null = null
    server.use(
      http.patch(`${BASE}/admin/users/:id`, async ({ params, request }) => {
        patched = { id: params.id as string, body: await request.json() }
        return HttpResponse.json({ ...USERS[1], is_active: false })
      })
    )
    renderPage()
    await screen.findByText('worker@test.com')
    fireEvent.click(screen.getByRole('button', { name: /deactivate worker@test.com/i }))
    await waitFor(() => expect(patched).toEqual({ id: 'u-2', body: { is_active: false } }))
  })

  it('send reset code calls POST /admin/users/{id}/reset-password', async () => {
    mockSuperuser()
    let posted: string | null = null
    server.use(
      http.post(`${BASE}/admin/users/:id/reset-password`, ({ params }) => {
        posted = params.id as string
        return HttpResponse.json({ message: 'Reset code sent to worker@test.com.' })
      })
    )
    renderPage()
    await screen.findByText('worker@test.com')
    fireEvent.click(screen.getByRole('button', { name: /send reset code to worker@test.com/i }))
    await waitFor(() => expect(posted).toBe('u-2'))
  })
})
