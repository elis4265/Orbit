import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AcceptInvitePage from '../../src/pages/AcceptInvitePage'
import * as useMembers from '../../src/hooks/useMembers'
import * as useAuth from '../../src/hooks/useAuth'

const mockAccept = vi.fn()
const mockNavigate = vi.fn()
const mockGetMetadata = vi.fn()

vi.mock('../../src/hooks/useMembers', () => ({
  useAcceptInvite: vi.fn(),
  useMembers: vi.fn(),
  useInviteMember: vi.fn(),
  useRemoveMember: vi.fn(),
}))

// HW-23: the page fetches invite metadata to route logged-out visitors
vi.mock('../../src/api/client', () => ({
  memberApi: { getInviteMetadata: (token: string) => mockGetMetadata(token) },
}))

vi.mock('../../src/hooks/useAuth', () => ({
  useMe: vi.fn(),
  useLogin: vi.fn(),
  useRegister: vi.fn(),
  useLogout: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function setup(token = 'abc-token', authenticated = true) {
  vi.mocked(useMembers.useAcceptInvite).mockReturnValue({
    mutateAsync: mockAccept,
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useMembers.useAcceptInvite>)

  vi.mocked(useAuth.useMe).mockReturnValue(
    authenticated
      ? { data: { id: 'user-1', email: 'test@test.com', username: 'testuser', is_verified: true }, isLoading: false } as unknown as ReturnType<typeof useAuth.useMe>
      : { data: undefined, isLoading: false } as unknown as ReturnType<typeof useAuth.useMe>
  )

  return render(
    <MemoryRouter initialEntries={[`/invites/${token}`]}>
      <Routes>
        <Route path="/invites/:token" element={<AcceptInvitePage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockAccept.mockReset()
  mockNavigate.mockReset()
  mockGetMetadata.mockReset()
})

// ── REQ-040: Authenticated user ───────────────────────────────────────────────

describe('REQ-040 — Accept Invite Page (authenticated)', () => {
  it('[REQ-040] shows joining message on mount', () => {
    mockAccept.mockReturnValue(new Promise(() => {}))
    setup()
    expect(screen.getByText(/joining/i)).toBeDefined()
  })

  it('[REQ-040] calls acceptInvite with token on mount', async () => {
    mockAccept.mockResolvedValue({ project_id: 'ws-1' })
    setup('test-token-123')
    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith('test-token-123'))
  })

  it('[REQ-040] navigates to workspace on success', async () => {
    mockAccept.mockResolvedValue({ project_id: 'ws-1' })
    setup()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/projects/ws-1'))
  })

  it('[REQ-040] shows error message when invite is invalid', async () => {
    mockAccept.mockRejectedValue({ response: { data: { error: { message: 'Invite expired.' } } } })
    vi.mocked(useMembers.useAcceptInvite).mockReturnValue({
      mutateAsync: mockAccept,
      isPending: false,
      isError: true,
      error: { response: { data: { error: { message: 'Invite expired.' } } } },
    } as unknown as ReturnType<typeof useMembers.useAcceptInvite>)
    setup()
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeDefined())
  })
})

// ── REQ-040: Unauthenticated user ─────────────────────────────────────────────

describe('REQ-040/HW-23 — Accept Invite Page (unauthenticated)', () => {
  it('[HW-23] routes a NEW invitee to /register?invite=:token', async () => {
    mockGetMetadata.mockResolvedValue({ user_exists: false, email: 'new@test.io' })
    setup('my-token', false)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/register?invite=my-token', { replace: true }
    ))
  })

  it('[HW-23] routes a REGISTERED invitee to /login?invite=:token', async () => {
    mockGetMetadata.mockResolvedValue({ user_exists: true, email: 'known@test.io' })
    setup('my-token', false)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/login?invite=my-token', { replace: true }
    ))
  })

  it('[HW-23] falls back to /register when metadata fetch fails (register owns the error surface)', async () => {
    mockGetMetadata.mockRejectedValue(new Error('404'))
    setup('bad-token', false)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(
      '/register?invite=bad-token', { replace: true }
    ))
  })

  it('[REQ-040] does not call acceptInvite when unauthenticated', async () => {
    mockGetMetadata.mockResolvedValue({ user_exists: false, email: 'x@test.io' })
    setup('abc-token', false)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
    expect(mockAccept).not.toHaveBeenCalled()
  })
})
