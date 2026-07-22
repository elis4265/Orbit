import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { http } from '../api/client'

// REQ-150 — real Google SSO. Renders only when the operator configured
// GOOGLE_OAUTH_CLIENT_ID (checked via /auth/providers); otherwise nothing,
// and the login page keeps its stub-free layout.
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (r: { credential: string }) => void }) => void
          renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export default function GoogleLoginButton() {
  const navigate = useNavigate()
  const buttonRef = useRef<HTMLDivElement>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    http.get<{ google_client_id: string | null }>('/auth/providers')
      .then((res) => setClientId(res.data.google_client_id))
      .catch(() => setClientId(null))
  }, [])

  useEffect(() => {
    if (!clientId || !buttonRef.current) return

    function init() {
      if (!window.google || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: async ({ credential }) => {
          try {
            const res = await http.post<{ access_token: string }>('/auth/google', { credential })
            localStorage.setItem('access_token', res.data.access_token)
            navigate('/')
          } catch {
            setError(true)
          }
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'continue_with',
        locale: 'en',
      })
    }

    if (window.google) {
      init()
      return
    }
    const script = document.createElement('script')
    // ?hl=en — renderButton's locale option loses to the Google session language.
    script.src = 'https://accounts.google.com/gsi/client?hl=en'
    script.async = true
    script.onload = init
    document.head.appendChild(script)
  }, [clientId, navigate])

  if (!clientId) return null
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={buttonRef} />
      {error && <p className="text-xs text-red-400">Google sign-in failed. Try again or use email.</p>}
    </div>
  )
}
