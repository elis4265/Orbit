// REQ-155 — instance admin: user table for the self-hosting operator.
// Superuser-only; is_superuser never grants project access (DD-048).
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, ShieldCheck, UserCheck, UserX } from 'lucide-react'
import { adminApi } from '../api/client'
import { useMe } from '../hooks/useAuth'
import type { AdminUser } from '../types'

export default function InstanceAdminPage() {
  const qc = useQueryClient()
  const { data: me, isLoading: meLoading } = useMe()
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => adminApi.listUsers(search || undefined),
    enabled: !!me?.is_superuser,
  })

  const setActive = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      adminApi.setActive(userId, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      setError(msg ?? 'Failed to update user.')
    },
  })

  const triggerReset = useMutation({
    mutationFn: (userId: string) => adminApi.triggerPasswordReset(userId),
    onSuccess: (res) => setNotice(res.message),
    onError: () => setError('Failed to send reset code.'),
  })

  if (meLoading) return null
  if (!me?.is_superuser) return <Navigate to="/" replace />

  const users = data?.users ?? []

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-gray-100">
      <div className="flex items-center gap-4 max-w-4xl mx-auto px-6 pt-8">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck size={18} className="text-brand" /> Instance Admin
        </h1>
        <span className="text-sm text-gray-500">— user accounts on this Orbit instance</span>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        <form
          onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()) }}
          className="flex gap-3"
        >
          <input
            type="text"
            placeholder="Search by email or username"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="bg-brand hover:bg-brand-hover text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Search
          </button>
        </form>

        {notice && <p className="text-xs text-green-400 bg-green-400/10 rounded-lg px-3 py-2">{notice}</p>}
        {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

        <section>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
            Users {data ? `(${data.total})` : ''}
          </h2>
          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          <ul className="divide-y divide-gray-800">
            {users.map((u: AdminUser) => (
              <li key={u.id} className="flex items-center gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${u.is_active ? 'text-gray-100' : 'text-gray-500 line-through'}`}>
                    {u.email}
                    {u.is_superuser && (
                      <span className="ml-2 text-xs text-brand font-medium">superuser</span>
                    )}
                    {!u.is_active && (
                      <span className="ml-2 text-xs text-red-400 font-medium no-underline">deactivated</span>
                    )}
                  </p>
                  {u.username && <p className="text-xs text-gray-500 truncate">@{u.username}</p>}
                </div>

                <button
                  type="button"
                  aria-label={`Send reset code to ${u.email}`}
                  title="Send password reset code"
                  onClick={() => { setNotice(''); setError(''); triggerReset.mutate(u.id) }}
                  className="text-gray-600 hover:text-brand transition-colors"
                >
                  <KeyRound size={16} />
                </button>

                {u.id !== me.id && (
                  u.is_active ? (
                    <button
                      type="button"
                      aria-label={`Deactivate ${u.email}`}
                      title="Deactivate account"
                      onClick={() => { setNotice(''); setError(''); setActive.mutate({ userId: u.id, isActive: false }) }}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <UserX size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Reactivate ${u.email}`}
                      title="Reactivate account"
                      onClick={() => { setNotice(''); setError(''); setActive.mutate({ userId: u.id, isActive: true }) }}
                      className="text-gray-600 hover:text-green-400 transition-colors"
                    >
                      <UserCheck size={16} />
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
          {!isLoading && users.length === 0 && (
            <p className="text-sm text-gray-500">No users match.</p>
          )}
        </section>
      </main>
    </div>
  )
}
