import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import GoogleLoginButton from './GoogleLoginButton'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SignUpModal({ open, onClose }: Props) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')

  if (!open) return null

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setEmailError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Please enter a valid email address.')
      return
    }
    navigate(`/register?email=${encodeURIComponent(email.trim())}`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Orbit" className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(124,106,247,0.7)]" />
              <h2 className="text-xl font-bold text-brand">Orbit</h2>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">Sign Up for Orbit</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 mt-4">
          <div>
            <label htmlFor="signup-email" className="block text-xs text-gray-400 mb-1">Email</label>
            <input
              id="signup-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
            />
            {emailError && <p className="text-xs text-red-400 mt-1">{emailError}</p>}
          </div>

          <p className="text-xs text-gray-500">
            By signing up, you agree to our{' '}
            <span className="text-brand cursor-pointer hover:underline">Terms of Service</span>
            {' '}and{' '}
            <span className="text-brand cursor-pointer hover:underline">Privacy Policy</span>.
          </p>

          <button
            type="submit"
            className="w-full bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            Sign Up
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-800" />
            <span className="text-[11px] uppercase tracking-wide text-gray-600">or</span>
            <div className="flex-1 border-t border-gray-800" />
          </div>

          <div className="flex justify-center">
            <GoogleLoginButton />
          </div>
        </form>
      </div>
    </div>
  )
}
