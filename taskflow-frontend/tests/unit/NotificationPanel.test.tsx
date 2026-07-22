import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationPanel from '../../src/components/NotificationPanel'

const mockMarkRead = vi.fn()
const mockMarkAllRead = vi.fn()

vi.mock('../../src/hooks/useNotifications', () => ({
  useNotifications: () => ({ data: mockNotifications }),
  useMarkRead: () => ({ mutate: mockMarkRead }),
  useMarkAllRead: () => ({ mutate: mockMarkAllRead }),
  useDeleteNotification: () => ({ mutate: vi.fn() }),
  useDeleteAllNotifications: () => ({ mutate: vi.fn() }),
  useUnreadCount: () => ({ data: { count: 2 } }),
  useNotificationPreferences: () => ({ data: null }),
  useUpdateNotificationPreferences: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

let mockNotifications: Array<{
  id: string
  workspace_id: string
  task_id: string | null
  type: string
  read: boolean
  payload: Record<string, unknown>
  created_at: string
}>

beforeEach(() => {
  vi.clearAllMocks()
  mockNotifications = [
    { id: 'n-1', workspace_id: 'ws-1', task_id: 't-1', type: 'comment_added', read: false, payload: { message: 'Alice commented' }, created_at: '2026-06-13T10:00:00Z' },
    { id: 'n-2', workspace_id: 'ws-1', task_id: 't-2', type: 'status_changed', read: true, payload: { message: 'Status → Done' }, created_at: '2026-06-12T08:00:00Z' },
  ]
})

function renderPanel(onClose = vi.fn()) {
  return render(<MemoryRouter><NotificationPanel onClose={onClose} /></MemoryRouter>)
}

describe('NotificationPanel', () => {
  it('renders notification type labels', () => {
    renderPanel()
    expect(screen.getByText('New comment')).toBeInTheDocument()
    expect(screen.getByText('Status changed')).toBeInTheDocument()
  })

  it('renders payload messages', () => {
    renderPanel()
    expect(screen.getByText('Alice commented')).toBeInTheDocument()
    expect(screen.getByText('Status → Done')).toBeInTheDocument()
  })

  it('shows unread dot on unread notifications', () => {
    const { container } = renderPanel()
    const dots = container.querySelectorAll('.bg-brand.rounded-full')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('calls markRead when clicking an unread notification', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Alice commented').closest('div.cursor-pointer')!)
    expect(mockMarkRead).toHaveBeenCalledWith('n-1')
  })

  it('does not call markRead when clicking an already-read notification', () => {
    renderPanel()
    fireEvent.click(screen.getByText('Status → Done').closest('div.cursor-pointer')!)
    expect(mockMarkRead).not.toHaveBeenCalled()
  })

  it('shows "All read" button when there are unread notifications', () => {
    renderPanel()
    expect(screen.getByText(/All read/i)).toBeInTheDocument()
  })

  it('calls markAllRead when "All read" is clicked', () => {
    renderPanel()
    fireEvent.click(screen.getByText(/All read/i))
    expect(mockMarkAllRead).toHaveBeenCalled()
  })

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn()
    renderPanel(onClose)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty state when no notifications', () => {
    mockNotifications = []
    renderPanel()
    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  it('hides "All read" button when all are read', () => {
    mockNotifications = [
      { id: 'n-1', workspace_id: 'ws-1', task_id: 't-1', type: 'comment_added', read: true, payload: {}, created_at: '2026-06-13T10:00:00Z' },
    ]
    renderPanel()
    expect(screen.queryByText(/All read/i)).not.toBeInTheDocument()
  })
})
