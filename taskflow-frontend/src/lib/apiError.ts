// HW-37 (REQ-169-6): admin-only actions must never fail silently.
// The backend wraps every HTTPException as {"error": {code, message, detail}}
// (app/main.py http_error_handler); bare {"detail": "..."} is kept as a
// fallback for unwrapped shapes (tests, proxies).
export function errorDetail(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: { message?: unknown }; detail?: unknown } } })?.response?.data
  const wrapped = data?.error?.message
  if (typeof wrapped === 'string' && wrapped) return wrapped
  const bare = data?.detail
  if (typeof bare === 'string' && bare) return bare
  return fallback
}
