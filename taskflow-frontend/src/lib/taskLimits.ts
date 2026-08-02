// HW-34: server-side task field limits mirrored client-side (app/schemas/task.py).
// The server stays the source of truth — these only gate the form for instant
// inline feedback instead of a silent 422.

export const TASK_SUMMARY_LIMIT = 100
// The live counter fades in well before the limit so the writer can steer.
export const SUMMARY_COUNTER_FROM = 80

// Lengths mirror what the server validates: it receives the trimmed summary,
// so trailing whitespace must not trip the counter or the error.
export function summaryLength(title: string): number {
  return title.trim().length
}

// "87/100" once the summary reaches SUMMARY_COUNTER_FROM; null below that.
export function summaryCounter(title: string): string | null {
  const n = summaryLength(title)
  return n >= SUMMARY_COUNTER_FROM ? `${n}/${TASK_SUMMARY_LIMIT}` : null
}

// Inline error once the summary exceeds the limit; null while within it.
export function summaryError(title: string): string | null {
  const n = summaryLength(title)
  if (n <= TASK_SUMMARY_LIMIT) return null
  return `Summary is ${n} characters — the limit is ${TASK_SUMMARY_LIMIT}.`
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Summary',
  description: 'Description',
  due_date: 'Due date',
  assignee_id: 'Assignee',
}

type FastApiDetail = string | Array<{ loc?: Array<string | number>; msg?: string }>
type ErrorBody = { detail?: FastApiDetail; error?: { message?: string; detail?: FastApiDetail } }

// Map a server 422 to a human-readable inline message. The backend wraps errors
// as {"error": {message, detail}} (app/main.py validation_error_handler, HW-37
// fix — the bare FastAPI {"detail": [...]} shape is kept as a fallback).
// Returns null when the error is not a 422 or carries no usable detail — the
// caller falls back to a generic message so creation never fails silently.
export function validationMessage(err: unknown): string | null {
  const resp = (err as { response?: { status?: number; data?: ErrorBody } })?.response
  if (resp?.status !== 422) return null
  const detail = resp.data?.error?.detail ?? resp.data?.detail
  if (typeof detail === 'string') return detail
  if ((!Array.isArray(detail) || detail.length === 0) && typeof resp.data?.error?.message === 'string'
      && resp.data.error.message && resp.data.error.message !== 'Validation failed.') {
    // An HTTPException 422 (e.g. INVALID_HIERARCHY) carries its text in message.
    return resp.data.error.message
  }
  if (!Array.isArray(detail) || detail.length === 0) return null
  return detail
    .map((d) => {
      const field = [...(d.loc ?? [])].reverse().find((p): p is string => typeof p === 'string' && p !== 'body')
      const label = (field && FIELD_LABELS[field]) || field || 'Input'
      return `${label}: ${d.msg ?? 'invalid value'}`
    })
    .join(' ')
}
