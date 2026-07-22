import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import VerifyEmailPage from '../../src/pages/VerifyEmailPage'

const mockNavigate = vi.fn()
const mockVerifyAsync = vi.fn()
const mockResendAsync = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../../src/hooks/useAuth', () => ({
  useVerifyEmail: () => ({ mutateAsync: mockVerifyAsync, isPending: false }),
  useResendVerification: () => ({ mutateAsync: mockResendAsync, isPending: false }),
}))

function renderPage(search = '?email=lord%40anon.com') {
  return render(
    <MemoryRouter initialEntries={[`/verify-email${search}`]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function fillDigit(index: number, digit: string) {
  const input = screen.getByLabelText(`Digit ${index + 1}`)
  fireEvent.change(input, { target: { value: digit } })
}

function fillCode(code: string) {
  code.split('').forEach((d, i) => fillDigit(i, d))
}

function fillPassword(pw = 'Password123') {
  fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: pw } })
  fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: pw } })
}

function clickVerify() {
  fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }))
}

beforeEach(() => {
  mockNavigate.mockReset()
  mockVerifyAsync.mockReset()
  mockResendAsync.mockReset()
})

// ── REQ-030/031: Verify Email Page ───────────────────────────────────────────

describe('REQ-030/031 — Verify Email Page', () => {
  it('[REQ-031] redirects to /login when no email param', () => {
    renderPage('')
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('[REQ-031] shows the email address the code was sent to', () => {
    renderPage()
    expect(screen.getByText(/lord@anon\.com/)).toBeInTheDocument()
  })

  it('[REQ-031] renders 6 individual digit inputs', () => {
    renderPage()
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i}`)).toBeInTheDocument()
    }
  })

  it('[REQ-031] renders password and confirm-password fields', () => {
    renderPage()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument()
  })

  it('[REQ-031] shows countdown timer starting at 15:00', () => {
    renderPage()
    expect(screen.getByText('15:00')).toBeInTheDocument()
  })

  it('[REQ-031] shows resend button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /resend code/i })).toBeInTheDocument()
  })

  it('[REQ-031] submitting code + password calls verify with new_password', async () => {
    mockVerifyAsync.mockResolvedValue({ access_token: 'tok' })
    renderPage()
    fillCode('123456')
    fillPassword('Password123')
    clickVerify()
    await waitFor(() => expect(mockVerifyAsync).toHaveBeenCalledWith({
      email: 'lord@anon.com',
      code: '123456',
      new_password: 'Password123',
    }))
  })

  it('[REQ-031] successful verification navigates to /', async () => {
    mockVerifyAsync.mockResolvedValue({ access_token: 'tok' })
    renderPage()
    fillCode('123456')
    fillPassword('Password123')
    clickVerify()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/'))
  })

  it('[REQ-031] does not submit until the Verify & continue button is clicked', async () => {
    mockVerifyAsync.mockResolvedValue({ access_token: 'tok' })
    renderPage()
    fillCode('123456')
    fillPassword('Password123')
    await new Promise((r) => setTimeout(r, 50))
    expect(mockVerifyAsync).not.toHaveBeenCalled()
  })

  it('[REQ-031] invalid password (no uppercase) blocks submit and shows error', async () => {
    renderPage()
    fillCode('123456')
    fillPassword('password123')
    clickVerify()
    expect(await screen.findByText(/must contain at least 1 uppercase/i)).toBeInTheDocument()
    expect(mockVerifyAsync).not.toHaveBeenCalled()
  })

  it('[REQ-031] mismatched confirm password blocks submit and shows error', async () => {
    renderPage()
    fillCode('123456')
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'Password123' } })
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'Password124' } })
    clickVerify()
    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(mockVerifyAsync).not.toHaveBeenCalled()
  })

  it('[REQ-031] wrong code shows error message', async () => {
    mockVerifyAsync.mockRejectedValue({
      response: { data: { error: { message: 'Invalid or expired code.' } } },
    })
    renderPage()
    fillCode('000000')
    fillPassword('Password123')
    clickVerify()
    expect(await screen.findByText('Invalid or expired code.')).toBeInTheDocument()
  })

  it('[REQ-031] resend button calls resendVerification', async () => {
    mockResendAsync.mockResolvedValue({})
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /resend code/i }))
    await waitFor(() => expect(mockResendAsync).toHaveBeenCalledWith('lord@anon.com'))
  })

  // DD-010 — paste support
  it('[DD-010] pasting a 6-digit code fills all inputs; submit sends code and password', async () => {
    mockVerifyAsync.mockResolvedValue({ access_token: 'tok' })
    renderPage()
    fireEvent.paste(screen.getByLabelText('Digit 1'), {
      clipboardData: { getData: () => '123456' },
    })
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(`Digit ${i}`)).toHaveValue(String(i))
    }
    fillPassword('Password123')
    clickVerify()
    await waitFor(() => expect(mockVerifyAsync).toHaveBeenCalledWith({
      email: 'lord@anon.com',
      code: '123456',
      new_password: 'Password123',
    }))
  })

  it('[DD-010] pasting fewer than 6 digits fills what is available and does not submit', async () => {
    renderPage()
    fireEvent.paste(screen.getByLabelText('Digit 1'), {
      clipboardData: { getData: () => '123' },
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByLabelText('Digit 1')).toHaveValue('1')
    expect(screen.getByLabelText('Digit 2')).toHaveValue('2')
    expect(screen.getByLabelText('Digit 3')).toHaveValue('3')
    expect(screen.getByLabelText('Digit 4')).toHaveValue('')
    expect(mockVerifyAsync).not.toHaveBeenCalled()
  })

  // TC_20 — digit input validation
  it('[TC_20] non-digit input is ignored', () => {
    renderPage()
    const input = screen.getByLabelText('Digit 1')
    fireEvent.change(input, { target: { value: 'a' } })
    expect(input).toHaveValue('')
  })

  it('[TC_20] clicking Verify with fewer than 6 digits does not call verify', async () => {
    renderPage()
    fillCode('12345')
    fillPassword('Password123')
    clickVerify()
    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument()
    expect(mockVerifyAsync).not.toHaveBeenCalled()
  })

  // TC_19 — resend resets the digit inputs
  it('[TC_19] resend clears the digit inputs', async () => {
    mockResendAsync.mockResolvedValue({})
    renderPage()
    ;['1', '2', '3'].forEach((d, i) => fillDigit(i, d))
    fireEvent.click(screen.getByRole('button', { name: /resend code/i }))
    await waitFor(() => {
      for (let i = 1; i <= 6; i++) {
        expect(screen.getByLabelText(`Digit ${i}`)).toHaveValue('')
      }
    })
  })
})
