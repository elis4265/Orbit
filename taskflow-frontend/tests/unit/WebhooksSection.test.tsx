import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import WebhooksSection from '../../src/components/WebhooksSection'
import type { OutboundWebhook } from '../../src/types'

const mockCreate = { mutateAsync: vi.fn(), isPending: false }
const mockUpdate = { mutate: vi.fn() }
const mockDelete = { mutate: vi.fn() }
const mockUseWebhooks = vi.fn()

vi.mock('../../src/hooks/useWebhooks', () => ({
  useWebhooks: () => mockUseWebhooks(),
  useCreateWebhook: () => mockCreate,
  useUpdateWebhook: () => mockUpdate,
  useDeleteWebhook: () => mockDelete,
}))

const HOOK: OutboundWebhook = {
  id: 'wh-1', project_id: 'p-1', url: 'https://example.com/hook',
  events: ['task.created'], enabled: true, format: 'json', last_status: 200,
  last_delivery_at: '2026-07-01T00:00:00Z', created_at: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseWebhooks.mockReturnValue({ data: [] })
})

// ── REQ-144 — outbound webhooks UI ───────────────────────────────────────────

describe('REQ-144 — WebhooksSection', () => {
  it('[REQ-144] creating a webhook sends url + selected events and shows the secret once', async () => {
    mockCreate.mutateAsync.mockResolvedValue({ ...HOOK, secret: 'sh-secret-42' })
    render(<WebhooksSection projectId="p-1" />)
    fireEvent.change(screen.getByPlaceholderText(/orbit-hook/), { target: { value: 'https://example.com/hook' } })
    fireEvent.click(screen.getByText('Add webhook'))
    await waitFor(() => expect(mockCreate.mutateAsync).toHaveBeenCalledWith({
      url: 'https://example.com/hook',
      events: expect.arrayContaining(['task.created', 'task.completed']),
      format: 'json',
    }))
    expect(await screen.findByText('sh-secret-42')).toBeInTheDocument()
  })

  it('[REQ-146] slack format sends format and hides the signing-secret banner', async () => {
    mockCreate.mutateAsync.mockResolvedValue({ ...HOOK, format: 'slack', secret: 'never-shown' })
    render(<WebhooksSection projectId="p-1" />)
    fireEvent.change(screen.getByPlaceholderText(/orbit-hook/), { target: { value: 'https://hooks.slack.com/x' } })
    fireEvent.change(screen.getByLabelText('Delivery format'), { target: { value: 'slack' } })
    fireEvent.click(screen.getByText('Add webhook'))
    await waitFor(() => expect(mockCreate.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'slack' }),
    ))
    expect(screen.queryByText('never-shown')).not.toBeInTheDocument()
  })

  it('[REQ-144] lists webhooks with last delivery status', () => {
    mockUseWebhooks.mockReturnValue({ data: [HOOK] })
    render(<WebhooksSection projectId="p-1" />)
    expect(screen.getByText('https://example.com/hook')).toBeInTheDocument()
    expect(screen.getByText(/last delivery 200/)).toBeInTheDocument()
  })

  it('[REQ-144] toggling enabled calls update with the flipped flag', () => {
    mockUseWebhooks.mockReturnValue({ data: [HOOK] })
    render(<WebhooksSection projectId="p-1" />)
    fireEvent.click(screen.getByRole('checkbox', { name: /enabled/i }))
    expect(mockUpdate.mutate).toHaveBeenCalledWith({ id: 'wh-1', data: { enabled: false } })
  })

  it('[REQ-144] delete button calls the delete mutation', () => {
    mockUseWebhooks.mockReturnValue({ data: [HOOK] })
    render(<WebhooksSection projectId="p-1" />)
    fireEvent.click(screen.getByLabelText(/Delete webhook/))
    expect(mockDelete.mutate).toHaveBeenCalledWith('wh-1')
  })
})
