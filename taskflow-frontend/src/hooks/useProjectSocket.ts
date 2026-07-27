import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { setSocketSend, emitSocketMessage } from '../lib/projectSocketBus'

// Mirror the axios base (`/api/v1`). VITE_API_URL is empty in the Docker build,
// so `||` (not `??`) is required — an empty string must fall back, not pass through.
const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

function projectWsUrl(projectId: string): string {
  // Absolute API base (http[s]://host/api/v1) → just swap the scheme.
  if (/^https?:\/\//.test(API_BASE)) {
    return `${API_BASE.replace(/^http/, 'ws')}/ws/projects/${projectId}`
  }
  // Relative base (/api/v1) → same origin as the page, honouring http(s)→ws(s).
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}${API_BASE}/ws/projects/${projectId}`
}

const RECONNECT_DELAY_MS = 3000
const MAX_RECONNECT_DELAY_MS = 30000

const TASK_EVENTS = new Set([
  'task.created',
  'task.updated',
  'task.deleted',
  'tasks.reordered',
  'subtasks.generated',
])

const COMMENT_EVENTS = new Set([
  'comment.created',
  'comment.updated',
  'comment.deleted',
])

const NOTIFICATION_EVENTS = new Set(['notification.created'])

function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.')
    const { exp } = JSON.parse(atob(payload)) as { exp: number }
    return exp * 1000 < Date.now() + 30_000
  } catch {
    return true
  }
}

async function getValidToken(): Promise<string | null> {
  const token = localStorage.getItem('access_token')
  if (!token) return null
  if (!isTokenExpired(token)) return token

  try {
    const resp = await axios.post<{ access_token: string }>(
      `${API_BASE}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    localStorage.setItem('access_token', resp.data.access_token)
    return resp.data.access_token
  } catch {
    localStorage.removeItem('access_token')
    return null
  }
}

export function useProjectSocket(projectId: string) {
  const queryClient = useQueryClient()

  // All connection state is local to one effect run. Sharing it across runs via
  // refs raced on project switch: the new run reset the shared "unmounted" flag,
  // so a stale connect() mid-await slipped past its guard and left a reconnect
  // loop dialing the OLD project id forever alongside the live socket.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let delay = RECONNECT_DELAY_MS

    async function connect() {
      if (cancelled) return

      const token = await getValidToken()
      if (cancelled || !token) return

      const sock = new WebSocket(projectWsUrl(projectId))
      ws = sock

      sock.onopen = () => {
        delay = RECONNECT_DELAY_MS
        sock.send(JSON.stringify({ type: 'auth', token }))
        setSocketSend((m) => sock.send(JSON.stringify(m)))
      }

      sock.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; payload?: { task_id?: string; user_id?: string } }
          emitSocketMessage(msg)
          if (TASK_EVENTS.has(msg.type)) {
            queryClient.invalidateQueries({ queryKey: ['tasks', projectId] })
          }
          if (COMMENT_EVENTS.has(msg.type)) {
            const taskId = msg.payload?.task_id
            if (taskId) {
              queryClient.invalidateQueries({ queryKey: ['comments', projectId, taskId] })
            } else {
              queryClient.invalidateQueries({ queryKey: ['comments', projectId] })
            }
          }
          if (NOTIFICATION_EVENTS.has(msg.type)) {
            queryClient.invalidateQueries({ queryKey: ['notifications'] })
            queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
          }
        } catch {
          // malformed frame — ignore
        }
      }

      sock.onclose = (event) => {
        if (ws === sock) ws = null
        setSocketSend(null)
        if (event.code === 4001 || cancelled) return

        reconnectTimer = setTimeout(() => {
          delay = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS)
          connect()
        }, delay)
      }

      sock.onerror = () => {
        sock.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [projectId, queryClient])
}
