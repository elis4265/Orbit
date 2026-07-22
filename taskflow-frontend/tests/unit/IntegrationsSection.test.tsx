import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import IntegrationsSection from '../../src/components/IntegrationsSection'
import type { ProvidersInfo, VcsConnection } from '../../src/types'

const providersInfo: ProvidersInfo = {
  encryption_configured: true,
  providers: {
    github: { auth: 'device', device_flow: true },
    gitlab: { auth: 'device', device_flow: true },
    bitbucket: { auth: 'token', device_flow: false },
  },
}

let mockConnections: VcsConnection[] = []
const mockCreate = vi.fn()
const mockDelete = vi.fn()

vi.mock('../../src/hooks/useVcs', () => ({
  useProviders: () => ({ data: providersInfo }),
  useVcsConnections: () => ({ data: mockConnections }),
  useCreateVcsConnection: () => ({ mutateAsync: mockCreate, isPending: false }),
  useDeleteVcsConnection: () => ({ mutate: mockDelete }),
}))

beforeEach(() => {
  mockConnections = []
  mockCreate.mockReset()
  mockDelete.mockReset()
})

describe('IntegrationsSection', () => {
  it('lists existing connections with status', () => {
    mockConnections = [{
      id: 'c1', project_id: 'p1', provider: 'github', repo_identifier: 'o/r',
      webhook_url: 'http://x/webhook/c1', connected: true, created_at: '',
    }]
    render(<IntegrationsSection projectId="p1" />)
    expect(screen.getByText('o/r')).toBeInTheDocument()
    expect(screen.getByText(/token stored/i)).toBeInTheDocument()
  })

  it('creating a connection reveals the webhook next-steps panel', async () => {
    mockCreate.mockResolvedValue({
      id: 'c2', project_id: 'p1', provider: 'github', repo_identifier: 'o/r',
      webhook_url: 'http://x/api/v1/vcs/github/webhook/c2', webhook_secret: 'shh',
      connected: false, created_at: '',
    })
    render(<IntegrationsSection projectId="p1" />)
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'o/r' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({
      provider: 'github', repo_identifier: 'o/r', token: undefined,
    }))
    expect(await screen.findByTestId('connect-next-steps')).toBeInTheDocument()
    expect(screen.getByText(/shh/)).toBeInTheDocument()
    // device-flow provider → Authorize button shown
    expect(screen.getByRole('button', { name: /authorize with github/i })).toBeInTheDocument()
  })

  it('shows the token field for Bitbucket', () => {
    render(<IntegrationsSection projectId="p1" />)
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'bitbucket' } })
    expect(screen.getByLabelText('Access token')).toBeInTheDocument()
  })
})
