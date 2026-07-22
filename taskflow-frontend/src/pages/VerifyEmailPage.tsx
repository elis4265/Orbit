import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useVerifyEmail, useResendVerification } from '../hooks/useAuth'

const CODE_LENGTH = 6
const EXPIRY_SECONDS = 15 * 60
const PASSWORD_HINT = 'Min 8 characters, at least 1 uppercase letter and 1 digit.'

function validatePassword(password: string, confirm: string): string | undefined {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password)) return 'Must contain at least 1 uppercase letter.'
  if (!/\d/.test(password)) return 'Must contain at least 1 digit.'
  if (password !== confirm) return 'Passwords do not match.'
  return undefined
}

export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const email = params.get('email') ?? ''

  const verifyEmail = useVerifyEmail()
  const verifyMutateAsync = verifyEmail.mutateAsync
  const resend = useResendVerification()

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [resendMsg, setResendMsg] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(EXPIRY_SECONDS)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!email) navigate('/login', { replace: true })
  }, [email, navigate])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  function handleDigitChange(idx: number, val: string) {
    const char = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[idx] = char
    setDigits(next)
    setError('')
    if (char && idx < CODE_LENGTH - 1) inputRefs.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (!pasted) return
    const next = Array(CODE_LENGTH).fill('')
    pasted.split('').forEach((char, i) => { next[i] = char })
    setDigits(next)
    setError('')
    const nextFocus = Math.min(pasted.length, CODE_LENGTH - 1)
    inputRefs.current[nextFocus]?.focus()
  }

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const code = digits.join('')
    if (code.length !== CODE_LENGTH) {
      setError('Enter the 6-digit code.')
      return
    }
    const pwError = validatePassword(password, confirm)
    if (pwError) {
      setError(pwError)
      return
    }
    try {
      await verifyMutateAsync({ email, code, new_password: password })
      navigate('/')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string }; detail?: string } } })
        ?.response?.data
      setError(msg?.error?.message ?? msg?.detail ?? 'Invalid or expired code.')
    }
  }, [email, digits, password, confirm, navigate, verifyMutateAsync])

  async function handleResend() {
    setResendMsg('')
    setError('')
    try {
      await resend.mutateAsync(email)
      setSecondsLeft(EXPIRY_SECONDS)
      setDigits(Array(CODE_LENGTH).fill(''))
      setResendMsg('A new code has been sent.')
      inputRefs.current[0]?.focus()
    } catch {
      setError('Failed to resend. Try again.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <img src="/logo.png" alt="Orbit" className="h-9 w-9 object-contain" />
          <h1 className="text-3xl font-bold text-brand">Orbit</h1>
        </div>
        <p className="text-gray-300 font-medium mb-1">Confirm your email</p>
        <p className="text-sm text-gray-400 mb-6">
          We sent a 6-digit code to <span className="text-gray-200">{email}</span>. Enter it and choose a password to finish.
        </p>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800 space-y-6">
          <div className="flex justify-center gap-2">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={handlePaste}
                aria-label={`Digit ${i + 1}`}
                disabled={verifyEmail.isPending}
                className="w-11 h-14 text-center text-xl font-bold bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              />
            ))}
          </div>

          <div className="space-y-3 text-left">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  disabled={verifyEmail.isPending}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">{PASSWORD_HINT}</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError('') }}
                disabled={verifyEmail.isPending}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          {resendMsg && <p className="text-xs text-green-400">{resendMsg}</p>}

          <button
            type="submit"
            disabled={verifyEmail.isPending}
            className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {verifyEmail.isPending ? 'Verifying…' : 'Verify & continue'}
          </button>

          <div className="text-xs text-gray-500 space-y-2">
            {secondsLeft > 0 ? (
              <p>Code expires in <span className="text-gray-300 font-mono">{formatTime(secondsLeft)}</span></p>
            ) : (
              <p className="text-red-400">Code expired.</p>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={resend.isPending}
              className="text-brand hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {resend.isPending ? 'Sending…' : 'Resend code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
