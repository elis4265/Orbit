import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useLogin } from '../hooks/useAuth'
import { memberApi } from '../api/client'
import SignUpModal from '../components/SignUpModal'
import ForgotPasswordModal from '../components/ForgotPasswordModal'
import GoogleLoginButton from '../components/GoogleLoginButton'

type ApiErrorShape = { response?: { data?: { error?: { message?: string }; detail?: string } } }

function extractApiError(err: unknown, fallback: string): string {
  const data = (err as ApiErrorShape)?.response?.data
  const msg = data?.error?.message ?? data?.detail ?? fallback
  return typeof msg === 'string' ? msg : fallback
}

function extractInviteError(err: unknown): string {
  return (err as { response?: { data?: { error?: { message?: string } } } })
    ?.response?.data?.error?.message ?? 'Invite is invalid or has expired.'
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const login = useLogin()
  const inviteToken = params.get('invite')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signUpOpen, setSignUpOpen] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // HW-23: arriving via an invite — pre-fill the invited email and show where
  // the invite leads. The field stays editable (the token is the capability;
  // accepting with another signed-in account is allowed).
  const [inviteWorkspace, setInviteWorkspace] = useState<string | null>(null)
  useEffect(() => {
    if (!inviteToken) return
    memberApi.getInviteMetadata(inviteToken)
      .then((meta) => {
        setInviteWorkspace(meta.workspace_name)
        setEmail((prev) => prev || meta.email)
      })
      .catch(() => { /* invalid invite — accept() after login owns the error */ })
  }, [inviteToken])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    console.log('[Login] submit — email:', email)
    try {
      console.log('[Login] calling login.mutateAsync')
      await login.mutateAsync({ username: email, password })
      console.log('[Login] mutateAsync resolved OK')
      if (inviteToken) {
        try {
          const res = await memberApi.acceptInvite(inviteToken)
          navigate(`/projects/${res.project_id}`)
        } catch (inviteErr: unknown) {
          setError(extractInviteError(inviteErr))
        }
        return
      }
      navigate('/')
    } catch (err: unknown) {
      console.error('[Login] error:', err)
      setError(extractApiError(err, 'Something went wrong'))
    }
  }

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-1">
              <img src="/logo.png" alt="Orbit" className="h-9 w-9 object-contain drop-shadow-[0_0_12px_rgba(124,106,247,0.7)]" />
              <h1 className="text-3xl font-bold text-brand">Orbit</h1>
            </div>
            <p className="text-gray-400 mt-1 text-sm">Keep your work in orbit</p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-8 shadow-xl border border-gray-800">
            <h2 className={`text-base font-semibold text-gray-100 ${inviteWorkspace ? 'mb-1' : 'mb-6'}`}>Sign in</h2>
            {inviteWorkspace && (
              <p className="text-xs text-gray-500 mb-5">
                to join <span className="text-gray-300">{inviteWorkspace}</span>
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-gray-500 hover:text-brand transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={login.isPending}
                className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-5 flex justify-center">
              <GoogleLoginButton />
            </div>

            <p className="text-center text-sm text-gray-500 mt-6">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setSignUpOpen(true)}
                className="text-brand hover:underline"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>

      <SignUpModal open={signUpOpen} onClose={() => setSignUpOpen(false)} />
      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </>
  )
}
