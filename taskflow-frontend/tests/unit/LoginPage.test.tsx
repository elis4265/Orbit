import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LoginPage from '../../src/pages/LoginPage'
import { server } from '../setup/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderLogin(search = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/login${search}`]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LoginPage', () => {
  it('renders sign in form by default', () => {
    renderLogin()
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('clicking Sign up opens the sign-up modal', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))
    expect(screen.getByText('Sign Up for Orbit')).toBeInTheDocument()
  })

  it('submits login form', async () => {
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!)
    await waitFor(() => expect(localStorage.getItem('access_token')).toBe('test-token'))
  })
})

// ── REQ-042: Login with invite token ─────────────────────────────────────────

describe('REQ-042 — Login Page with invite token', () => {
  it('[REQ-042] after login with invite token, calls accept and redirects to workspace', async () => {
    renderLogin('?invite=abc-invite-token')
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/projects/ws-1'))
  })

  it('[REQ-042] login without invite token navigates to home', async () => {
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('[REQ-042] shows error when accept fails after login', async () => {
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.post('http://localhost/api/v1/invites/:token/accept', () =>
        HttpResponse.json({ error: { code: 'bad_request', message: 'Invite expired.' } }, { status: 400 })
      )
    )
    renderLogin('?invite=abc-invite-token')
    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'password123' } })
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!)
    expect(await screen.findByText(/expired|invalid/i)).toBeInTheDocument()
  })
})
