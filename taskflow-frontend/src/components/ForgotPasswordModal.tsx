// REQ-154 — request a reset code by email, then set a new password.
import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { authApi } from '../api/client'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'request' | 'reset' | 'done'

type ApiErrorShape = { response?: { data?: { error?: { message?: string }; detail?: string } } }

function extractApiError(err: unknown, fallback: string): string {
  const data = (err as ApiErrorShape)?.response?.data
  const msg = data?.error?.message ?? data?.detail ?? fallback
  return typeof msg === 'string' ? msg : fallback
}

export default function ForgotPasswordModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [revokeTokens, setRevokeTokens] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  if (!open) return null

  function reset() {
    setStep('request')
    setCode('')
    setNewPassword('')
    setRevokeTokens(false)
    setError('')
  }

  function close() {
    reset()
    setEmail('')
    onClose()
  }

  async function handleRequest(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await authApi.forgotPassword(email.trim())
      setStep('reset')
    } catch (err: unknown) {
      setError(extractApiError(err, 'Something went wrong. Try again.'))
    } finally {
      setPending(false)
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await authApi.resetPassword({ email: email.trim(), code: code.trim(), new_password: newPassword, revoke_api_tokens: revokeTokens })
      setStep('done')
    } catch (err: unknown) {
      setError(extractApiError(err, 'Something went wrong. Try again.'))
    } finally {
      setPending(false)
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Orbit" className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(124,106,247,0.7)]" />
              <h2 className="text-xl font-bold text-brand">Orbit</h2>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Reset your password</p>
          </div>
          <button onClick={close} aria-label="Close" className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {step === 'request' && (
          <form onSubmit={handleRequest} className="px-6 pb-6 space-y-4 mt-4">
            <div>
              <label htmlFor="forgot-email" className="block text-xs text-gray-400 mb-1">Email</label>
              <input
                id="forgot-email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                className={inputClass}
              />
            </div>
            <p className="text-xs text-gray-500">
              If the address is registered, we'll email a 6-digit code. It expires in 15 minutes.
            </p>
            {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {pending ? 'Sending…' : 'Send reset code'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleReset} className="px-6 pb-6 space-y-4 mt-4">
            <p className="text-xs text-gray-500">
              Enter the code sent to <span className="text-gray-300">{email}</span> and choose a new password.
            </p>
            <div>
              <label htmlFor="reset-code" className="block text-xs text-gray-400 mb-1">Reset code</label>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                required
                minLength={6}
                maxLength={6}
                placeholder="6-digit code"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError('') }}
                className={`${inputClass} tracking-[0.3em]`}
              />
            </div>
            <div>
              <label htmlFor="reset-password" className="block text-xs text-gray-400 mb-1">New password</label>
              <input
                id="reset-password"
                type="password"
                required
                minLength={8}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError('') }}
                className={inputClass}
              />
              <p className="text-xs text-gray-500 mt-1">At least 8 characters, one uppercase letter and one digit.</p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={revokeTokens}
                onChange={(e) => setRevokeTokens(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-brand"
              />
              <span>
                <span className="text-sm text-gray-200 block">Also revoke my API tokens</span>
                <span className="text-xs text-gray-500">Recommended if you suspect your account was compromised — removes any token an attacker may have created.</span>
              </span>
            </label>
            {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {pending ? 'Resetting…' : 'Reset password'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="px-6 pb-6 space-y-4 mt-4">
            <p className="text-sm text-gray-300 bg-green-400/10 rounded-lg px-3 py-2">
              Password updated. You can now sign in.
            </p>
            <button
              type="button"
              onClick={close}
              className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
