import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach, afterAll } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RegisterPage from '../../src/pages/RegisterPage'
import { server } from '../setup/server'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const mockNavigate = vi.fn()
const mockMutateAsync = vi.fn()
const mockGetInviteMetadata = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../src/hooks/useAuth', () => ({
  useRegister: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

// The invite path loads invite metadata directly via memberApi.
vi.mock('../../src/api/client', () => ({
  memberApi: { getInviteMetadata: (...args: unknown[]) => mockGetInviteMetadata(...args) },
}))

function renderPage(search = '?email=lord%40anon.com') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/register${search}`]}>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// Invite-path render: waits for invite metadata to load so the password fields render.
async function renderInvitePage() {
  mockGetInviteMetadata.mockResolvedValue({
    project_id: 'ws-1',
    workspace_name: 'Acme',
    email: 'invited@anon.com',
    expired: false,
    used: false,
  })
  renderPage('?invite=abc-invite-token')
  await screen.findByPlaceholderText('Confirm password')
}

beforeEach(() => {
  mockNavigate.mockReset()
  mockMutateAsync.mockReset()
  mockGetInviteMetadata.mockReset()
})

// ── REQ-029: Registration Page ────────────────────────────────────────────────

describe('REQ-029 — Registration Page', () => {
  it('[REQ-029] redirects to /login when no email param', () => {
    renderPage('')
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('[REQ-029] shows the pre-filled email address', () => {
    renderPage()
    expect(screen.getByText(/lord@anon\.com/)).toBeInTheDocument()
  })

  it('[REQ-029] non-invite path renders username + Continue, no password fields', () => {
    renderPage()
    expect(screen.getByPlaceholderText('yourhandle')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Password')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Confirm password')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('[REQ-029] non-invite path shows the "password set at next step" notice', () => {
    renderPage()
    expect(screen.getByText(/6-digit code to confirm your address/i)).toBeInTheDocument()
    expect(screen.getByText(/set your password on the next step/i)).toBeInTheDocument()
  })

  it('[REQ-029] invite path renders username, password, confirm and Create account', async () => {
    await renderInvitePage()
    expect(screen.getByPlaceholderText('yourhandle')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('Password').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('[REQ-029] invite path shows password hint text', async () => {
    await renderInvitePage()
    expect(screen.getByText(/min 8 characters/i)).toBeInTheDocument()
  })

  it('[REQ-029] username too short shows validation error', async () => {
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Jan'), { target: { value: 'Lord' } })
    fireEvent.change(screen.getByPlaceholderText('Mrkvicka'), { target: { value: 'Anon' } })
    fireEvent.change(screen.getByPlaceholderText('yourhandle'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText(/at least 3 characters/i)).toBeInTheDocument()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('[REQ-029] mismatched passwords shows error (invite path)', async () => {
    await renderInvitePage()
    fireEvent.change(screen.getByPlaceholderText('Jan'), { target: { value: 'Lord' } })
    fireEvent.change(screen.getByPlaceholderText('Mrkvicka'), { target: { value: 'Anon' } })
    fireEvent.change(screen.getByPlaceholderText('yourhandle'), { target: { value: 'lordanon' } })
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'ValidPass1' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'DifferentPass1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('[REQ-029] successful non-invite submit calls register (no password) and navigates to /verify-email', async () => {
    mockMutateAsync.mockResolvedValue({ message: 'ok', expires_in_minutes: 15 })
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Jan'), { target: { value: 'Lord' } })
    fireEvent.change(screen.getByPlaceholderText('Mrkvicka'), { target: { value: 'Anon' } })
    fireEvent.change(screen.getByPlaceholderText('yourhandle'), { target: { value: 'lordanon' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({
      email: 'lord@anon.com',
      username: 'lordanon',
      first_name: 'Lord',
      last_name: 'Anon',
    }))
    expect(mockNavigate).toHaveBeenCalledWith('/verify-email?email=lord%40anon.com')
  })

  // TC_12 — password complexity (invite path — password is set here only for invites)
  it('[TC_12] password too short shows error (invite path)', async () => {
    await renderInvitePage()
    fireEvent.change(screen.getByPlaceholderText('Jan'), { target: { value: 'Lord' } })
    fireEvent.change(screen.getByPlaceholderText('Mrkvicka'), { target: { value: 'Anon' } })
    fireEvent.change(screen.getByPlaceholderText('yourhandle'), { target: { value: 'lordanon' } })
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'Short1' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'Short1' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('[TC_12] password without digit shows error (invite path)', async () => {
    await renderInvitePage()
    fireEvent.change(screen.getByPlaceholderText('Jan'), { target: { value: 'Lord' } })
    fireEvent.change(screen.getByPlaceholderText('Mrkvicka'), { target: { value: 'Anon' } })
    fireEvent.change(screen.getByPlaceholderText('yourhandle'), { target: { value: 'lordanon' } })
    fireEvent.change(screen.getAllByPlaceholderText('Password')[0], { target: { value: 'NoDigitPass' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'NoDigitPass' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText('Must contain at least 1 digit.')).toBeInTheDocument()
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('[REQ-029] server username-taken error shows under username field', async () => {
    mockMutateAsync.mockRejectedValue({
      response: { data: { error: { message: 'Username already taken.' } } },
    })
    renderPage()
    fireEvent.change(screen.getByPlaceholderText('Jan'), { target: { value: 'Lord' } })
    fireEvent.change(screen.getByPlaceholderText('Mrkvicka'), { target: { value: 'Anon' } })
    fireEvent.change(screen.getByPlaceholderText('yourhandle'), { target: { value: 'lordanon' } })
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByText('Username already taken.')).toBeInTheDocument()
  })
})
