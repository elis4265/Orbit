import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Save, RotateCcw, Keyboard, Bell, User, Camera, Trash2, Sun, Moon, Monitor, KeyRound, Copy, SmilePlus, RefreshCw } from 'lucide-react'
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from '../hooks/useApiTokens'
import { useTheme, type ThemePreference } from '../context/ThemeContext'
import {
  loadKeybindings,
  DEFAULT_KEYBINDINGS,
  ACTION_LABELS,
  CONTEXT_SHORTCUTS,
  type KeyAction,
  type KeyBindings,
} from '../keybindings'
import { useProjects } from '../hooks/useProjects'
import { useEmotes, useCreateEmote, useDeleteEmote } from '../hooks/useEmotes'
import { DEFAULT_EMOTE_NAMES } from '../components/CommentReactions'
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/useNotifications'
import { useMe, useLogout } from '../hooks/useAuth'
import { authApi } from '../api/client'
import { useUpdateProfile, useUploadAvatar, useDeleteAvatar } from '../hooks/useProfile'
import Avatar from '../components/Avatar'
import type { NotificationPreferences } from '../types'

type Tab = 'profile' | 'keybindings' | 'notifications' | 'tokens' | 'emotes'

// ─── Profile tab ────────────────────────────────────────────────────────────

function userDisplayName(u: { first_name?: string | null; last_name?: string | null; username?: string | null; email: string }): string {
  if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`
  return u.username ?? u.email
}

function ProfileTab() {
  const { data: user } = useMe()
  const updateProfile = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const deleteAvatar = useDeleteAvatar()
  const fileRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [username, setUsername]   = useState('')
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [saved, setSaved]         = useState(false)
  const seeded = useRef(false)

  useEffect(() => {
    if (user && !seeded.current) {
      setFirstName(user.first_name ?? '')
      setLastName(user.last_name ?? '')
      setUsername(user.username ?? '')
      seeded.current = true
    }
  }, [user])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!firstName.trim()) e.first_name = 'First name is required.'
    if (!lastName.trim())  e.last_name  = 'Last name is required.'
    if (username && username.length < 3) e.username = 'Username must be at least 3 characters.'
    if (username && !/^[a-zA-Z0-9_-]+$/.test(username)) e.username = 'Only letters, numbers, _ and - allowed.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    try {
      await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        username:   username.trim() || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message
      if (msg?.toLowerCase().includes('username')) {
        setErrors((p) => ({ ...p, username: msg }))
      } else {
        setErrors((p) => ({ ...p, form: msg ?? 'Update failed.' }))
      }
    }
  }

  function handleAvatarClick() {
    let blocking = true
    const absorb = (evt: MouseEvent) => { if (blocking) evt.stopPropagation() }
    window.addEventListener('click', absorb, { capture: true })
    const onFocus = () => {
      setTimeout(() => {
        blocking = false
        window.removeEventListener('click', absorb, { capture: true })
      }, 150)
      window.removeEventListener('focus', onFocus)
    }
    window.addEventListener('focus', onFocus)
    fileRef.current?.click()
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await uploadAvatar.mutateAsync(file)
  }

  if (!user) return <p className="text-gray-500 text-sm">Loading…</p>

  return (
    <div className="space-y-8">
      {/* Avatar */}
      <div className="flex items-center gap-6">
        <div className="relative">
          <Avatar
            firstName={user.first_name}
            lastName={user.last_name}
            username={user.username}
            email={user.email}
            avatarUrl={user.avatar_url}
            size="lg"
          />
          <button
            onClick={handleAvatarClick}
            disabled={uploadAvatar.isPending}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center hover:bg-gray-600 transition-colors"
            title="Upload avatar"
          >
            <Camera size={13} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <p className="font-semibold text-gray-100">
            {userDisplayName(user)}
          </p>
          <p className="text-sm text-gray-400">{user.email}</p>
          {user.avatar_url && (
            <button
              onClick={() => deleteAvatar.mutate()}
              disabled={deleteAvatar.isPending}
              className="mt-1 text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={11} /> Remove avatar
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, first_name: '' })) }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
            />
            {errors.first_name && <p className="text-xs text-red-400 mt-1">{errors.first_name}</p>}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, last_name: '' })) }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
            />
            {errors.last_name && <p className="text-xs text-red-400 mt-1">{errors.last_name}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setErrors((p) => ({ ...p, username: '' })) }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
          />
          {errors.username && <p className="text-xs text-red-400 mt-1">{errors.username}</p>}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Email</label>
          <input
            type="email"
            value={user.email}
            disabled
            className="w-full bg-gray-800/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-600 mt-1">Email cannot be changed.</p>
        </div>

        {errors.form && (
          <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{errors.form}</p>
        )}

        <button
          type="submit"
          disabled={updateProfile.isPending}
          className="px-5 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {updateProfile.isPending ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
        </button>
      </form>

      <ThemeSection />

      {user.password_set_by_user === false
        ? <SetPasswordSection email={user.email} />
        : <ChangePasswordSection />}
    </div>
  )
}

// SSO accounts (Google) get a random password they never saw — the
// current-password gate is a dead end for them. Offer the email-code flow
// inline instead; once a password is set, the normal change form applies.
function SetPasswordSection({ email }: { email: string }) {
  const logout = useLogout()
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [next, setNext] = useState('')
  const [revokeTokens, setRevokeTokens] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSendCode() {
    setError('')
    setPending(true)
    try {
      await authApi.forgotPassword(email)
      setCodeSent(true)
    } catch {
      setError('Could not send the code. Try again.')
    } finally {
      setPending(false)
    }
  }

  async function handleSet(e: FormEvent) {
    e.preventDefault()
    setError('')
    setPending(true)
    try {
      await authApi.resetPassword({
        email, code: code.trim(), new_password: next, revoke_api_tokens: revokeTokens,
      })
      setDone(true)
      setTimeout(() => logout(), 2000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Setting the password failed.')
      setPending(false)
    }
  }

  if (done) {
    return (
      <div className="p-4 bg-green-950/40 border border-green-800/50 rounded-xl">
        <p className="text-sm text-green-300">Password set. Signing you out — you can now log in with it or with Google.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Set a password</h3>
      <p className="text-xs text-gray-500 mb-3">
        Your account was created with Google sign-in, so it has no password you know.
        Set one to also log in directly — Google sign-in keeps working either way.
      </p>
      {!codeSent ? (
        <button
          onClick={handleSendCode}
          disabled={pending}
          className="px-5 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {pending ? 'Sending…' : `Email a code to ${email}`}
        </button>
      ) : (
        <form onSubmit={handleSet} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sp-code" className="block text-xs text-gray-400 mb-1">6-digit code</label>
              <input
                id="sp-code"
                type="text"
                required
                minLength={6}
                maxLength={6}
                value={code}
                onChange={(e) => { setCode(e.target.value); setError('') }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 tracking-[0.3em] focus:outline-none focus:border-brand transition-colors"
              />
            </div>
            <div>
              <label htmlFor="sp-new" className="block text-xs text-gray-400 mb-1">New password</label>
              <input
                id="sp-new"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={next}
                onChange={(e) => { setNext(e.target.value); setError('') }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={revokeTokens}
              onChange={(e) => setRevokeTokens(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-brand"
            />
            <span className="text-sm text-gray-200">Also revoke my API tokens</span>
          </label>
          {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          <button
            type="submit"
            disabled={pending || code.trim().length !== 6 || !next}
            className="px-5 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {pending ? 'Setting…' : 'Set password'}
          </button>
        </form>
      )}
    </div>
  )
}

// REQ-154 follow-up: logged-in password change, gated by the current password.
// API tokens survive by default; per-event checkbox purges them (design: the
// checkbox lives inside the already-gated form — no persistent toggle to attack).
function ChangePasswordSection() {
  const logout = useLogout()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [revokeTokens, setRevokeTokens] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (next !== confirm) { setError('New passwords do not match.'); return }
    setPending(true)
    try {
      await authApi.changePassword({
        current_password: current,
        new_password: next,
        revoke_api_tokens: revokeTokens,
      })
      setDone(true)
      // All other sessions are revoked server-side; sign this one out too so
      // the user re-authenticates with the new password everywhere.
      setTimeout(() => logout(), 2000)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Password change failed.')
      setPending(false)
    }
  }

  if (done) {
    return (
      <div className="p-4 bg-green-950/40 border border-green-800/50 rounded-xl">
        <p className="text-sm text-green-300">Password changed. Signing you out — log in with the new password.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-200 mb-1">Change password</h3>
      <p className="text-xs text-gray-500 mb-3">
        All other sessions are signed out after a change. You'll be asked to sign in again.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="cp-current" className="block text-xs text-gray-400 mb-1">Current password</label>
          <input
            id="cp-current"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setError('') }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cp-new" className="block text-xs text-gray-400 mb-1">New password</label>
            <input
              id="cp-new"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={next}
              onChange={(e) => { setNext(e.target.value); setError('') }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
            />
          </div>
          <div>
            <label htmlFor="cp-confirm" className="block text-xs text-gray-400 mb-1">Confirm new password</label>
            <input
              id="cp-confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError('') }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
            />
          </div>
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
            <span className="text-xs text-gray-500">Off by default — scripts and integrations keep working. Turn on if you suspect a token leaked.</span>
          </span>
        </label>
        {error && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        <button
          type="submit"
          disabled={pending || !current || !next || !confirm}
          className="px-5 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {pending ? 'Changing…' : 'Change password'}
        </button>
      </form>
    </div>
  )
}

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

function ThemeSection() {
  const { preference, setPreference } = useTheme()
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-200 mb-3">Appearance</h3>
      <div className="flex flex-wrap gap-3">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <button
            key={value}
            onClick={() => setPreference(value)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
              preference === value
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Key bindings tab ────────────────────────────────────────────────────────

const BROWSER_RESERVED = new Set([
  'Ctrl+n', 'Ctrl+t', 'Ctrl+w', 'Ctrl+r', 'Ctrl+l',
  'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Ctrl+Shift+t', 'Ctrl+Shift+r', 'Ctrl+Shift+w',
  'Alt+ArrowLeft', 'Alt+ArrowRight', 'F5',
])

function captureKey(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey)  parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey)   parts.push('Alt')
  parts.push(e.key)
  return parts.join('+')
}

function getConflicts(b: KeyBindings): Set<KeyAction> {
  const seen = new Map<string, KeyAction>()
  const conflicts = new Set<KeyAction>()
  for (const [action, key] of Object.entries(b) as [KeyAction, string][]) {
    if (seen.has(key)) {
      conflicts.add(action)
      conflicts.add(seen.get(key)!)
    } else {
      seen.set(key, action)
    }
  }
  return conflicts
}

function KeyChip({ binding }: { binding: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {binding.split('+').map((part, i) => (
        <kbd key={i} className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-700 border border-gray-600 rounded text-gray-200">
          {part}
        </kbd>
      ))}
    </span>
  )
}

function KeyBindingsTab() {
  const [bindings, setBindings] = useState<KeyBindings>(loadKeybindings)
  const [editing, setEditing]   = useState<KeyAction | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const editingRef  = useRef(editing)
  const bindingsRef = useRef(bindings)
  editingRef.current  = editing
  bindingsRef.current = bindings

  const conflicts = getConflicts(bindings)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!editingRef.current) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setEditing(null); setCaptureError(null); return }
      const key = captureKey(e)
      if (!key) return
      if (BROWSER_RESERVED.has(key)) {
        setCaptureError(`${key} is reserved by the browser and cannot be used`)
        setEditing(null)
        return
      }
      const conflicting = (Object.entries(bindingsRef.current) as [KeyAction, string][])
        .find(([a, k]) => k === key && a !== editingRef.current)
      if (conflicting) {
        setCaptureError(`"${key}" is already used by "${ACTION_LABELS[conflicting[0]]}" — choose a different key`)
        setEditing(null)
        return
      }
      setBindings((prev) => ({ ...prev, [editingRef.current!]: key }))
      setEditing(null)
      setCaptureError(null)
      setSaved(false)
    }
    function onBlur() {
      if (editingRef.current) {
        setEditing(null)
        setCaptureError('Key combination intercepted by the browser — try a different one')
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  function save() {
    if (conflicts.size > 0) { setCaptureError('Resolve all conflicts before saving'); return }
    localStorage.setItem('orbit:keybindings', JSON.stringify(bindings))
    setSaved(true)
    setCaptureError(null)
  }

  function reset() {
    localStorage.removeItem('orbit:keybindings')
    setBindings({ ...DEFAULT_KEYBINDINGS })
    setSaved(false)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {(Object.entries(ACTION_LABELS) as [KeyAction, string][]).map(([action, label]) => (
          <div
            key={action}
            onClick={() => { setEditing(action === editing ? null : action); setCaptureError(null) }}
            className={`flex items-center justify-between bg-gray-900 border rounded-xl px-4 py-3 cursor-pointer select-none transition-colors ${
              editing === action        ? 'border-brand ring-1 ring-brand/40'
              : conflicts.has(action)  ? 'border-red-700 bg-red-950/20'
              :                          'border-gray-800 hover:border-gray-700'
            }`}
          >
            <span className="text-sm text-gray-200">{label}</span>
            {editing === action
              ? <span className="text-xs text-brand animate-pulse font-medium">Press any key…</span>
              : <KeyChip binding={bindings[action]} />}
          </div>
        ))}
      </div>

      {captureError && (
        <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
          {captureError}
        </p>
      )}

      <p className="text-[11px] text-gray-600 leading-relaxed -mt-2">
        Browser-reserved shortcuts (Ctrl+N, Ctrl+T, Ctrl+W, Ctrl+R, etc.) cannot be captured.
      </p>

      <div className="border-t border-gray-800 pt-4">
        <p className="text-xs text-gray-500 mb-3">Context-specific (not customisable)</p>
        {CONTEXT_SHORTCUTS.map((s) => (
          <div key={s.label} className="flex items-center justify-between py-1.5 px-1">
            <span className="text-sm text-gray-400">{s.label}</span>
            <KeyChip binding={s.key} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand/80 text-white text-sm font-semibold rounded-xl transition-colors">
          <Save size={14} /> Save bindings
        </button>
        <button onClick={reset} className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-xl transition-colors">
          <RotateCcw size={14} /> Reset defaults
        </button>
        {saved && <span className="text-xs text-green-400">Saved!</span>}
      </div>
    </div>
  )
}

// ─── Notifications tab ───────────────────────────────────────────────────────

const TRIGGER_LABELS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'on_comment',             label: 'Comments',        description: 'When someone comments on a task you watch' },
  { key: 'on_mention',             label: 'Mentions',        description: 'When someone @mentions you in a comment' },
  { key: 'on_status_change',       label: 'Status changes',  description: 'When the status of a watched task changes' },
  { key: 'on_assignee_change',     label: 'Assignee changes',description: 'When a watched task is reassigned' },
  { key: 'on_priority_change',     label: 'Priority changes',description: 'When the priority of a watched task changes' },
  { key: 'on_due_date_approaching',label: 'Due date reminder',description: "Before a watched task's due date" },
  { key: 'on_task_deleted',        label: 'Task deleted',    description: 'When a watched task is deleted' },
]

function NotificationsTab() {
  const { data: projects = [] } = useProjects()
  const [selectedWsId, setSelectedWsId] = useState<string>('')

  useEffect(() => {
    if (projects.length > 0 && !selectedWsId) setSelectedWsId(projects[0].id)
  }, [projects, selectedWsId])

  const { data: prefs, isLoading } = useNotificationPreferences(selectedWsId)
  const update = useUpdateNotificationPreferences(selectedWsId)
  const [local, setLocal] = useState<NotificationPreferences | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => { setLocal(null); setSaved(false) }, [selectedWsId])
  useEffect(() => { if (prefs && !local) setLocal(prefs) }, [prefs, local])

  function toggle(key: keyof NotificationPreferences) {
    if (!local) return
    setSaved(false)
    setLocal((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev))
  }
  function setHours(hours: number) {
    if (!local) return
    setSaved(false)
    setLocal((prev) => (prev ? { ...prev, due_date_reminder_hours: hours } : prev))
  }
  async function handleSave() {
    if (!local) return
    await update.mutateAsync(local)
    setSaved(true)
  }

  if (!projects.length) return <p className="text-gray-500 text-sm">No projects yet.</p>

  return (
    <div className="space-y-6">
      {projects.length > 1 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Project</label>
          <select
            value={selectedWsId}
            onChange={(e) => setSelectedWsId(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-brand"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {isLoading || !local ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <>
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">In-app notifications</h2>
            <div className="space-y-2">
              {TRIGGER_LABELS.map(({ key, label, description }) => (
                <label key={key} className="flex items-center justify-between gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer hover:border-gray-700 transition-colors">
                  <div>
                    <p className="text-sm text-gray-200">{label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                  </div>
                  <input type="checkbox" checked={Boolean(local[key])} onChange={() => toggle(key)} className="w-4 h-4 accent-brand" />
                </label>
              ))}
            </div>
          </section>

          {local.on_due_date_approaching && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Due date reminder timing</h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                <p className="text-sm text-gray-300 mb-3">Notify me this many hours before the due date:</p>
                <div className="flex items-center gap-2">
                  {[6, 12, 24, 48, 72].map((h) => (
                    <button
                      key={h}
                      onClick={() => setHours(h)}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                        local.due_date_reminder_hours === h
                          ? 'border-brand bg-brand/20 text-brand'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Email notifications</h2>
            <label className="flex items-center justify-between gap-4 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 cursor-pointer hover:border-gray-700 transition-colors">
              <div>
                <p className="text-sm text-gray-200">Email delivery</p>
                <p className="text-xs text-gray-500 mt-0.5">Receive notifications by email (stub — logs only)</p>
              </div>
              <input type="checkbox" checked={local.email_enabled} onChange={() => toggle('email_enabled')} className="w-4 h-4 accent-brand" />
            </label>
          </section>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={update.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand/80 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Save size={14} />
              {update.isPending ? 'Saving…' : 'Save preferences'}
            </button>
            {saved && <span className="text-xs text-green-400">Saved!</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Emotes tab ──────────────────────────────────────────────────────────────
// Custom reaction emotes (Teams model): per-project; uploading one named like a
// default replaces that default in the reaction picker.

const EMOTE_NAME_RE = /^[a-z0-9_]{2,32}$/

function EmotesTab() {
  const { data: projects = [] } = useProjects()
  const [selectedWsId, setSelectedWsId] = useState<string>('')

  useEffect(() => {
    if (projects.length > 0 && !selectedWsId) setSelectedWsId(projects[0].id)
  }, [projects, selectedWsId])

  const { data: emotes = [] } = useEmotes(selectedWsId)
  const createEmote = useCreateEmote(selectedWsId)
  const deleteEmote = useDeleteEmote(selectedWsId)

  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const newFileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)
  const replaceNameRef = useRef<string | null>(null)

  useEffect(() => { setError(null); setNewName('') }, [selectedWsId])

  const emotesByName = new Map(emotes.map((e) => [e.name, e]))
  const customs = emotes.filter((e) => !(e.name in DEFAULT_EMOTE_NAMES))

  async function upload(name: string, file: File) {
    setError(null)
    try {
      await createEmote.mutateAsync({ name, file })
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Upload failed.')
    }
  }

  function handleReplaceClick(name: string) {
    replaceNameRef.current = name
    replaceFileRef.current?.click()
  }

  async function handleReplaceFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const name = replaceNameRef.current
    e.target.value = ''
    if (!file || !name) return
    // Replacing an already-replaced default: drop the old custom first (409 otherwise).
    const existing = emotesByName.get(name)
    if (existing) await deleteEmote.mutateAsync(existing.id)
    await upload(name, file)
  }

  async function handleNewFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const name = newName.trim().toLowerCase()
    if (!EMOTE_NAME_RE.test(name)) { setError('Name must be 2-32 chars: a-z, 0-9, _'); return }
    await upload(name, file)
    setNewName('')
  }

  if (!projects.length) return <p className="text-gray-500 text-sm">No projects yet.</p>

  return (
    <div className="space-y-6">
      {projects.length > 1 && (
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Project</label>
          <select
            value={selectedWsId}
            onChange={(e) => setSelectedWsId(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-brand"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Emotes are per-project and appear in the comment reaction picker for everyone.
        Images: PNG / GIF / WebP / JPEG, max 256 KB.
      </p>

      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Default emotes</h2>
        <div className="space-y-2">
          {Object.entries(DEFAULT_EMOTE_NAMES).map(([name, emoji]) => {
            const replacement = emotesByName.get(name)
            return (
              <div key={name} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
                <span className="w-6 text-center text-base">
                  {replacement
                    ? <img src={replacement.url} alt={`:${name}:`} width={20} height={20} className="inline-block object-contain" />
                    : emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200">:{name}:</p>
                  {replacement && <p className="text-[11px] text-gray-500">replaced</p>}
                </div>
                <button
                  onClick={() => handleReplaceClick(name)}
                  disabled={createEmote.isPending || deleteEmote.isPending}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} /> Replace
                </button>
                {replacement && (
                  <button
                    onClick={() => deleteEmote.mutate(replacement.id)}
                    disabled={deleteEmote.isPending}
                    aria-label={`Restore default ${name}`}
                    title="Restore default (removes reactions using the replacement)"
                    className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Custom emotes</h2>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="emote_name"
            maxLength={32}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand placeholder-gray-600"
          />
          <button
            onClick={() => {
              const name = newName.trim().toLowerCase()
              if (!EMOTE_NAME_RE.test(name)) { setError('Name must be 2-32 chars: a-z, 0-9, _'); return }
              setError(null)
              newFileRef.current?.click()
            }}
            disabled={!newName.trim() || createEmote.isPending}
            className="px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
          >
            {createEmote.isPending ? 'Uploading…' : 'Pick image'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <ul className="flex flex-col divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-900 overflow-hidden">
          {customs.length === 0 && <li className="px-4 py-3 text-sm text-gray-600">No custom emotes yet.</li>}
          {customs.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <img src={e.url} alt={`:${e.name}:`} width={20} height={20} className="object-contain" />
              <p className="flex-1 text-sm text-gray-200 truncate">:{e.name}:</p>
              <button
                onClick={() => deleteEmote.mutate(e.id)}
                disabled={deleteEmote.isPending}
                aria-label={`Delete emote ${e.name}`}
                title="Delete (removes reactions using it)"
                className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <input ref={replaceFileRef} type="file" accept="image/png,image/gif,image/webp,image/jpeg" onChange={handleReplaceFile} className="hidden" aria-label="Replacement emote image" />
      <input ref={newFileRef} type="file" accept="image/png,image/gif,image/webp,image/jpeg" onChange={handleNewFile} className="hidden" aria-label="New emote image" />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

// ── REQ-143: personal API tokens ──────────────────────────────────────────────
function ApiTokensTab() {
  const { data: tokens = [] } = useApiTokens()
  const createToken = useCreateApiToken()
  const revokeToken = useRevokeApiToken()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'read' | 'write'>('read')
  const [freshToken, setFreshToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    const created = await createToken.mutateAsync({ name: name.trim(), scope })
    setFreshToken(created.token)
    setCopied(false)
    setName('')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-500">
        Tokens authenticate API calls in place of your session — use them in scripts, CI, or integrations.
        The token value is shown <strong className="text-gray-300">only once</strong> at creation.
      </p>

      {freshToken && (
        <div className="p-3 bg-green-950/40 border border-green-800/50 rounded-xl">
          <p className="text-xs text-green-300 mb-2">Copy your token now — it will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-200 bg-gray-900 rounded-lg px-2 py-1.5 break-all">{freshToken}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(freshToken); setCopied(true) }}
              className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Copy token"
            >
              <Copy size={13} />
            </button>
          </div>
          {copied && <p className="text-[11px] text-gray-500 mt-1">Copied.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. ci-deploy)"
          className="flex-1 min-w-[10rem] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-brand placeholder-gray-600"
        />
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as 'read' | 'write')}
          aria-label="Token scope"
          className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
        >
          <option value="read">Read-only</option>
          <option value="write">Read & write</option>
        </select>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || createToken.isPending}
          className="px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
        >
          Create
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-900 overflow-hidden">
        {tokens.length === 0 && <li className="px-4 py-3 text-sm text-gray-600">No tokens yet.</li>}
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{t.name}</p>
              <p className="text-xs text-gray-600">
                {t.prefix} · {t.scope === 'read' ? 'read-only' : 'read & write'}
                {t.last_used_at && ` · last used ${new Date(t.last_used_at).toLocaleDateString()}`}
              </p>
            </div>
            <button
              onClick={() => revokeToken.mutate(t.id)}
              className="text-gray-600 hover:text-red-400 transition-colors"
              aria-label={`Revoke ${t.name}`}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const VALID_TABS: Tab[] = ['profile', 'keybindings', 'notifications', 'tokens', 'emotes']

export default function UserPreferencesPage() {
  const [searchParams] = useSearchParams()
  const paramTab = searchParams.get('tab') as Tab | null
  const [activeTab, setActiveTab] = useState<Tab>(
    VALID_TABS.includes(paramTab as Tab) ? (paramTab as Tab) : 'profile'
  )

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'profile',       label: 'Profile',       icon: <User size={14} /> },
    { id: 'keybindings',   label: 'Key Bindings',  icon: <Keyboard size={14} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={14} /> },
    { id: 'tokens',        label: 'API Tokens',    icon: <KeyRound size={14} /> },
    { id: 'emotes',        label: 'Emotes',        icon: <SmilePlus size={14} /> },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-8">
        <h1 className="text-sm font-semibold text-gray-200 mb-6">Preferences</h1>
        {/* Below md the five tabs don't fit — the strip scrolls instead of overflowing the page. */}
        <div className="flex flex-nowrap items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-8 overflow-x-auto md:overflow-x-visible">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 flex-1 flex-shrink-0 justify-center whitespace-nowrap px-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-gray-100'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile'       && <ProfileTab />}
        {activeTab === 'keybindings'   && <KeyBindingsTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'tokens'        && <ApiTokensTab />}
        {activeTab === 'emotes'        && <EmotesTab />}
      </div>
    </div>
  )
}
