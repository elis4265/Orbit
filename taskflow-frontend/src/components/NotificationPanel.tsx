import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, CheckCheck, Bell, Trash2 } from 'lucide-react'
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useDeleteNotification,
  useDeleteAllNotifications,
} from '../hooks/useNotifications'
import type { Notification, NotificationType } from '../types'

const TYPE_LABELS: Record<NotificationType, string> = {
  comment_added: 'New comment',
  mentioned: 'You were mentioned',
  status_changed: 'Status changed',
  assignee_changed: 'Assignee changed',
  priority_changed: 'Priority changed',
  task_deleted: 'Task deleted',
  due_date_approaching: 'Due date soon',
}

interface Props {
  onClose: () => void
  onOpenTask?: (workspaceId: string, taskId: string) => void
}

export default function NotificationPanel({ onClose, onOpenTask }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { data: notifications = [] } = useNotifications()
  const markRead = useMarkRead()
  const markAllRead = useMarkAllRead()
  const deleteOne = useDeleteNotification()
  const deleteAll = useDeleteAllNotifications()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead.mutate(n.id)
    if (n.task_id && n.type !== 'task_deleted') {
      onClose()
      if (onOpenTask) {
        onOpenTask(n.project_id, n.task_id)
      } else {
        navigate(`/projects/${n.project_id}?task=${n.task_id}`)
      }
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          <Bell size={14} /> Notifications
        </span>
        <div className="flex items-center gap-2">
          {notifications.some((n) => !n.read) && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
              title="Mark all as read"
            >
              <CheckCheck size={13} /> All read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => deleteAll.mutate()}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
              title="Delete all notifications"
            >
              <Trash2 size={13} /> Clear all
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="text-gray-600 hover:text-gray-300 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600">
            No notifications
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 border-b border-gray-800/60 transition-colors group relative ${
                n.task_id && n.type !== 'task_deleted' ? 'cursor-pointer hover:bg-gray-800/50' : ''
              } ${!n.read ? 'bg-brand/5' : ''}`}
              onClick={() => handleNotificationClick(n)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-300">
                    {TYPE_LABELS[n.type] ?? n.type}
                    {!n.read && (
                      <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-brand align-middle" />
                    )}
                  </p>
                  {!!n.payload?.message && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {n.payload.message as string}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[10px] text-gray-600">
                    {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteOne.mutate(n.id) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all ml-1"
                    aria-label="Delete notification"
                  >
                    <X size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
