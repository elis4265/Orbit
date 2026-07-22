import { useEffect, useRef } from 'react'
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
  const wsRef = useRef<WebSocket | null>(null)
  const delayRef = useRef(RECONNECT_DELAY_MS)
  const unmountedRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectId) return
    unmountedRef.current = false
    delayRef.current = RECONNECT_DELAY_MS

    async function connect() {
      if (unmountedRef.current) return

      const token = await getValidToken()
      if (!token) return

      const ws = new WebSocket(projectWsUrl(projectId))
      wsRef.current = ws

      ws.onopen = () => {
        delayRef.current = RECONNECT_DELAY_MS
        ws.send(JSON.stringify({ type: 'auth', token }))
        setSocketSend((m) => ws.send(JSON.stringify(m)))
      }

      ws.onmessage = (event) => {
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

      ws.onclose = (event) => {
        wsRef.current = null
        setSocketSend(null)
        if (event.code === 4001 || unmountedRef.current) return

        timeoutRef.current = setTimeout(() => {
          delayRef.current = Math.min(delayRef.current * 2, MAX_RECONNECT_DELAY_MS)
          connect()
        }, delayRef.current)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      wsRef.current?.close()
    }
  }, [projectId, queryClient])
}
