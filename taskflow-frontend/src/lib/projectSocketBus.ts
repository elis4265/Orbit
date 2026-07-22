// Lightweight bus so the single project WebSocket (useProjectSocket) can be
// reused for ad-hoc real-time features (planning poker) without a 2nd connection.
type SocketMessage = { type: string; [k: string]: unknown }
type Listener = (msg: SocketMessage) => void

let activeSend: ((msg: SocketMessage) => void) | null = null
const listeners = new Set<Listener>()

export function setSocketSend(fn: ((msg: SocketMessage) => void) | null) {
  activeSend = fn
}

export function sendSocket(msg: SocketMessage): boolean {
  if (!activeSend) return false
  activeSend(msg)
  return true
}

export function emitSocketMessage(msg: SocketMessage) {
  listeners.forEach((l) => l(msg))
}

export function subscribeSocket(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
