import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '../api/client'
import type { NotificationPreferences } from '../types'

export function useNotifications(unread?: boolean) {
  return useQuery({
    queryKey: ['notifications', unread],
    queryFn: () => notificationApi.list(unread),
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => notificationApi.unreadCount(),
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationApi.markRead(id),
    onSuccess: () => {
qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationApi.markAllRead(),
    onSuccess: () => {
qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => notificationApi.deleteOne(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export function useDeleteAllNotifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => notificationApi.deleteAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] })
    },
  })
}

export function useNotificationPreferences(workspaceId: string) {
  return useQuery({
    queryKey: ['notification-prefs', workspaceId],
    queryFn: () => notificationApi.getPreferences(workspaceId),
  })
}

export function useUpdateNotificationPreferences(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prefs: NotificationPreferences) =>
      notificationApi.updatePreferences(workspaceId, prefs),
    onSuccess: () => {
qc.invalidateQueries({ queryKey: ['notification-prefs', workspaceId] })
    },
  })
}
