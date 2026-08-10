import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAcceptInvite } from '../hooks/useMembers'
import { useMe } from '../hooks/useAuth'
import { memberApi } from '../api/client'

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { mutateAsync: acceptInvite } = useAcceptInvite()
  const { data: user, isLoading } = useMe()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading || !token) return

    let stale = false

    if (!user) {
      // HW-23: a registered invitee gets Sign in (password + SSO), not a
      // Register form that would reject the duplicate email. Metadata fetch
      // failure falls back to Register, which owns the invite error surface.
      memberApi.getInviteMetadata(token)
        .then((meta) => {
          if (!stale) navigate(meta.user_exists ? `/login?invite=${token}` : `/register?invite=${token}`, { replace: true })
        })
        .catch(() => {
          if (!stale) navigate(`/register?invite=${token}`, { replace: true })
        })
      return () => { stale = true }
    }

    acceptInvite(token)
      .then((res) => { if (!stale) navigate(`/projects/${res.project_id}`) })
      .catch((err: { response?: { data?: { error?: { message?: string } } } }) => {
        if (!stale) setErrorMsg(
          err?.response?.data?.error?.message ?? 'Invite is invalid or has expired.'
        )
      })

    return () => { stale = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user, isLoading, navigate])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading…</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm">{errorMsg}</p>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-brand hover:underline"
          >
            Go to board
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Joining workspace…</p>
    </div>
  )
}
