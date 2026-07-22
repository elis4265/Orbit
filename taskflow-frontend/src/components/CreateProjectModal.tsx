import { useState, useEffect, useRef } from 'react'
import { X, Check, ExternalLink } from 'lucide-react'
import type { ProjectMode } from '../types'
import openImg from '../assets/open.png'
import guidedImg from '../assets/guided.png'
import enforcedImg from '../assets/enforced.png'

interface ModeOption {
  id: ProjectMode
  label: string
  subtitle: string
  description: string
  image: string
}

// Copy and imagery mirror the Mode tab in ProjectSettingsPage so the first-run
// picker and the settings page read as the same choice. 'open' is labelled "Flow".
const MODE_OPTIONS: ModeOption[] = [
  {
    id: 'open',
    label: 'Flow',
    subtitle: 'Standard Sty',
    description: '3 fixed statuses — To Do, In Progress, Done. Automated cycles roll unfinished work forward. Best for solo or small teams.',
    image: openImg,
  },
  {
    id: 'guided',
    label: 'Guided',
    subtitle: 'DIY Pasture',
    description: 'Create your own statuses, grouped by category. Tasks move freely between any status. Best for teams with a defined process.',
    image: guidedImg,
  },
  {
    id: 'enforced',
    label: 'Enforced',
    subtitle: 'Hydraulic Labyrinth',
    description: 'Everything in Guided, plus admin-defined transition rules — tasks only move along approved paths. Best for QA and compliance flows.',
    image: enforcedImg,
  },
]

interface Props {
  open: boolean
  /** First project ever — shows a welcome header and is not dismissible to an empty screen. */
  firstRun?: boolean
  onClose: () => void
  onCreate: (name: string, mode: ProjectMode) => Promise<void>
}

export default function CreateProjectModal({ open, firstRun = false, onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ProjectMode>('open')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // Reset each time the modal opens so a reopened modal is always clean.
  useEffect(() => {
    if (open) {
      setName('')
      setMode('open')
      setError(null)
      setSubmitting(false)
      // autofocus after the modal paints
      const t = setTimeout(() => nameRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !firstRun && !submitting) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, firstRun, submitting, onClose])

  if (!open) return null

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onCreate(trimmed, mode)
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(detail ?? 'Failed to create project. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !firstRun && !submitting) onClose()
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between px-6 pt-5 pb-3 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-100">
              {firstRun ? 'Welcome to Orbit' : 'Create project'}
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {firstRun
                ? 'Create your first project and pick how its workflow behaves.'
                : 'Name it and choose a workflow mode to start.'}
            </p>
          </div>
          {!firstRun && (
            <button
              onClick={onClose}
              disabled={submitting}
              aria-label="Close"
              className="text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="px-6 py-4 space-y-5">
          <div>
            <label htmlFor="new-project-name" className="block text-xs font-medium text-gray-400 mb-1.5">
              Project name
            </label>
            <input
              id="new-project-name"
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="e.g. Mobile App"
              maxLength={100}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <p className="block text-xs font-medium text-gray-400 mb-2">Workflow mode</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {MODE_OPTIONS.map((opt) => {
                const active = mode === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    aria-pressed={active}
                    className={`relative flex flex-col rounded-xl border-2 overflow-hidden text-left transition-all duration-200 focus:outline-none ${
                      active
                        ? 'border-brand shadow-[0_0_0_3px_rgba(124,106,247,0.25)]'
                        : 'border-gray-700 bg-gray-800/40 hover:border-brand/50'
                    }`}
                  >
                    <div className={`w-full transition-all duration-200 ${active ? '' : 'brightness-60 hover:brightness-90'}`}>
                      <img src={opt.image} alt={opt.label} className="w-full object-contain" />
                    </div>
                    <div className="p-3 flex flex-col gap-1.5 flex-1 bg-gray-900">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-gray-100">{opt.label}</span>
                          <span className="ml-1.5 text-[11px] text-gray-500 italic">{opt.subtitle}</span>
                        </div>
                        {active && <Check size={14} className="text-brand shrink-0 mt-0.5" />}
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{opt.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              You can change the mode later in Project Settings — switching never deletes your statuses.{' '}
              <a
                href="/help#project-modes"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-brand hover:underline"
              >
                Learn more about modes <ExternalLink size={10} />
              </a>
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-800">
          {!firstRun && (
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-sm px-4 py-2 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            className="text-sm px-4 py-2 rounded-lg bg-brand hover:bg-brand-hover text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
