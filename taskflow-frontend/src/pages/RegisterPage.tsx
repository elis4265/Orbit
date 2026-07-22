import { useState, type FormEvent, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { useRegister } from '../hooks/useAuth'
import { memberApi } from '../api/client'
import type { InviteMetadata } from '../types'

const PASSWORD_HINT = 'Min 8 characters, at least 1 uppercase letter and 1 digit.'

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs text-red-400 mt-1">{msg}</p>
}

function PasswordField({
  label, value, show, placeholder, error,
  onChange, onToggleShow,
}: {
  label: string
  value: string
  show: boolean
  placeholder: string
  error?: string
  onChange: (v: string) => void
  onToggleShow: () => void
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
        />
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <FieldError msg={error} />
    </div>
  )
}

function InviteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <p className="text-gray-400 text-sm">Loading invite…</p>
    </div>
  )
}

function InviteError({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center space-y-3">
        <p className="text-red-400 text-sm">{message}</p>
        <button onClick={onBack} className="text-xs text-brand hover:underline">Go to sign in</button>
      </div>
    </div>
  )
}

function extractRegisterError(err: unknown): { field: 'username' | 'form'; message: string } {
  const data = (err as { response?: { data?: { error?: { message?: string }; detail?: string } } })?.response?.data
  const detail = data?.error?.message ?? data?.detail ?? 'Registration failed.'
  const msg = typeof detail === 'string' ? detail : 'Registration failed.'
  if (msg.toLowerCase().includes('username')) return { field: 'username', message: msg }
  return { field: 'form', message: msg }
}

function validateFields(
  firstName: string, lastName: string, username: string,
  password: string, confirm: string, requirePassword: boolean,
): Record<string, string> {
  const e: Record<string, string> = {}
  if (!firstName.trim()) e.first_name = 'First name is required.'
  if (!lastName.trim()) e.last_name = 'Last name is required.'
  if (!username.trim()) e.username = 'Username is required.'
  else if (username.length < 3) e.username = 'Username must be at least 3 characters.'
  else if (!/^[a-zA-Z0-9_-]+$/.test(username)) e.username = 'Only letters, numbers, _ and - allowed.'
  // Non-invite sign-up sets the password at email verification, not here.
  if (requirePassword) {
    if (password.length < 8) e.password = 'Password must be at least 8 characters.'
    else if (!/[A-Z]/.test(password)) e.password = 'Must contain at least 1 uppercase letter.'
    else if (!/\d/.test(password)) e.password = 'Must contain at least 1 digit.'
    if (password !== confirm) e.confirm = 'Passwords do not match.'
  }
  return e
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const register = useRegister()

  const inviteToken = params.get('invite')
  const directEmail = params.get('email') ?? ''

  const [invite, setInvite] = useState<InviteMetadata | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)

  const email = invite ? invite.email : directEmail

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  function loadInvite() {
    if (!inviteToken) {
      if (!directEmail) navigate('/login', { replace: true })
      return
    }
    memberApi.getInviteMetadata(inviteToken)
      .then((meta) => {
        if (meta.expired || meta.used) {
          setInviteError('This invite link is no longer valid.')
        } else {
          setInvite(meta)
        }
      })
      .catch(() => setInviteError('Invite not found or already used.'))
      .finally(() => setInviteLoading(false))
  }
  useEffect(loadInvite, [inviteToken, directEmail, navigate])  

  const requiresPassword = !!inviteToken

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateFields(firstName, lastName, username, password, confirm, requiresPassword)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    try {
      const base = { email, username, first_name: firstName, last_name: lastName }
      const payload = inviteToken
        ? { ...base, password, invite_token: inviteToken }
        : base
      const res = await register.mutateAsync(payload)

      if (inviteToken && res.project_id) {
        if (res.access_token) localStorage.setItem('access_token', res.access_token)
        qc.clear()
        navigate(`/projects/${res.project_id}`)
        return
      }
      navigate(`/verify-email?email=${encodeURIComponent(email)}`)
    } catch (err: unknown) {
      const { field, message } = extractRegisterError(err)
      setErrors((prev) => ({ ...prev, [field]: message }))
    }
  }

  const busy = register.isPending
  const baseFilled = [firstName.trim(), lastName.trim(), username.trim()].every(Boolean)
  const allFilled = baseFilled && (!requiresPassword || [password, confirm].every(Boolean))

  if (inviteLoading) return <InviteLoading />
  if (inviteError) return <InviteError message={inviteError} onBack={() => navigate('/login')} />

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-1">
            <img src="/logo.png" alt="Orbit" className="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(124,106,247,0.7)]" />
            <h1 className="text-3xl font-bold text-brand">Orbit</h1>
          </div>
          {invite ? (
            <p className="text-gray-400 mt-1 text-sm">
              You've been invited to <span className="text-gray-200">{invite.workspace_name}</span>
            </p>
          ) : (
            <p className="text-gray-400 mt-1 text-sm">Create your account</p>
          )}
        </div>

        <div className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
          <p className="text-xs text-gray-500 mb-4 truncate">
            Signing up as <span className="text-gray-300">{email}</span>
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">First name</label>
                <input
                  type="text"
                  placeholder="Jan"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, first_name: '' })) }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
                />
                <FieldError msg={errors.first_name} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Last name</label>
                <input
                  type="text"
                  placeholder="Mrkvicka"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, last_name: '' })) }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
                />
                <FieldError msg={errors.last_name} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Username</label>
              <input
                type="text"
                placeholder="yourhandle"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: '' })) }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
              />
              <FieldError msg={errors.username} />
            </div>

            {requiresPassword ? (
              <>
                <PasswordField
                  label="Password"
                  value={password}
                  show={showPassword}
                  placeholder="Password"
                  error={errors.password}
                  onChange={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: '' })) }}
                  onToggleShow={() => setShowPassword((v) => !v)}
                />
                <p className="text-xs text-gray-500 -mt-3">{PASSWORD_HINT}</p>

                <PasswordField
                  label="Confirm password"
                  value={confirm}
                  show={showConfirm}
                  placeholder="Confirm password"
                  error={errors.confirm}
                  onChange={(v) => { setConfirm(v); setErrors((p) => ({ ...p, confirm: '' })) }}
                  onToggleShow={() => setShowConfirm((v) => !v)}
                />
              </>
            ) : (
              <p className="text-xs text-gray-500">
                We'll email you a 6-digit code to confirm your address. You'll set your password on the next step.
              </p>
            )}

            {errors.form && (
              <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{errors.form}</p>
            )}

            <button
              type="submit"
              disabled={busy || !allFilled}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {busy ? 'Please wait…' : requiresPassword ? 'Create account' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
