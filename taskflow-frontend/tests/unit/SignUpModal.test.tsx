import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import SignUpModal from '../../src/components/SignUpModal'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderModal(open: boolean, onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <SignUpModal open={open} onClose={onClose} />
    </MemoryRouter>
  )
}

beforeEach(() => mockNavigate.mockReset())

// ── REQ-028: Sign Up Modal ────────────────────────────────────────────────────

describe('REQ-028 — Sign Up Modal', () => {
  it('[REQ-028] renders nothing when closed', () => {
    renderModal(false)
    expect(screen.queryByText('Sign Up for Orbit')).not.toBeInTheDocument()
  })

  it('[REQ-028] renders modal content when open', () => {
    renderModal(true)
    expect(screen.getByText('Sign Up for Orbit')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument()
  })

  it('[REQ-028] shows no SSO sign-up buttons (deferred 2026-07-13)', () => {
    renderModal(true)
    expect(screen.queryByRole('button', { name: /sign up with/i })).not.toBeInTheDocument()
  })

  it('[REQ-028] invalid email shows inline error', () => {
    renderModal(true)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'notanemail' } })
    // Use fireEvent.submit directly — jsdom's native email validation blocks click→submit for invalid values
    fireEvent.submit(screen.getByRole('button', { name: 'Sign Up' }).closest('form')!)
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('[REQ-028] valid email navigates to /register with email param', () => {
    renderModal(true)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'lord@anon.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }))
    expect(mockNavigate).toHaveBeenCalledWith('/register?email=lord%40anon.com')
  })

  it('[REQ-028] clicking backdrop calls onClose', () => {
    const onClose = vi.fn()
    renderModal(true, onClose)
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('[REQ-028] Close button calls onClose', () => {
    const onClose = vi.fn()
    renderModal(true, onClose)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })
})
