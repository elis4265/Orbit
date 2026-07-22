// REQ-154 — forgot-password flow on the login page
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeAll, afterEach, afterAll } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import LoginPage from '../../src/pages/LoginPage'
import { server } from '../setup/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function openModalAndRequestCode() {
  renderLogin()
  fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'reset@test.com' },
  })
  fireEvent.click(screen.getByRole('button', { name: /send reset code/i }))
  await screen.findByPlaceholderText('6-digit code')
}

describe('REQ-154 — forgot password on login page', () => {
  it('shows a Forgot password? action that opens the reset modal', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /forgot password/i }))
    expect(screen.getByText(/reset your password/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
  })

  it('submitting the email advances to the code + new password step', async () => {
    await openModalAndRequestCode()
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('New password')).toBeInTheDocument()
  })

  it('full flow shows success after resetting', async () => {
    await openModalAndRequestCode()
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '123456' } })
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'NewPassword2' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/you can now sign in/i)).toBeInTheDocument()
  })

  it('shows API error when the code is rejected', async () => {
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.post('http://localhost/api/v1/auth/reset-password', () =>
        HttpResponse.json(
          { error: { code: 'bad_request', message: 'Invalid or expired reset code.' } },
          { status: 400 }
        )
      )
    )
    await openModalAndRequestCode()
    fireEvent.change(screen.getByPlaceholderText('6-digit code'), { target: { value: '999999' } })
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'NewPassword2' } })
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }))
    expect(await screen.findByText(/invalid or expired reset code/i)).toBeInTheDocument()
    // still on the reset step — user can retry
    await waitFor(() =>
      expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument()
    )
  })
})
