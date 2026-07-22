import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAcceptInvite } from '../hooks/useMembers'
import { useMe } from '../hooks/useAuth'

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { mutateAsync: acceptInvite } = useAcceptInvite()
  const { data: user, isLoading } = useMe()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading || !token) return

    if (!user) {
      navigate(`/register?invite=${token}`, { replace: true })
      return
    }

    let stale = false

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
