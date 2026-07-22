import { Lock, Filter, Pencil, RotateCcw, EyeOff } from 'lucide-react'
import type { ActiveFilter } from './SmartFilterBar'

interface Props {
  filters: ActiveFilter[]
  mode: 'guided' | 'enforced'
  active: boolean                         // guided only: whether the filter is currently applied
  onToggleActive: (value: boolean) => void
  isAdmin: boolean
  onEdit: () => void
}

function ReadonlyPill({ f }: { f: ActiveFilter }) {
  return (
    // max-w-full + a truncating value keep one long pill from overflowing a phone screen.
    <span className="inline-flex max-w-full min-w-0 items-center gap-1 text-xs rounded-lg px-2 py-0.5 whitespace-nowrap border border-gray-700 bg-gray-800/50 text-gray-400">
      {f.negate && <span className="text-red-400 font-semibold text-[10px] uppercase tracking-wide flex-shrink-0">NOT</span>}
      <span className="text-gray-500 flex-shrink-0">{f.fieldLabel}:</span>
      {f.color && <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />}
      <span className="min-w-0 truncate">{f.label}</span>
    </span>
  )
}

/**
 * The admin-defined board scope filter, shown above the personal filter bar.
 * - guided  → a default the user can disable / reset back to (YouTrack-style).
 * - enforced → a hard, non-removable scope; the user can only narrow within it (Jira-style).
 */
export default function ProjectFilterBar({ filters, mode, active, onToggleActive, isAdmin, onEdit }: Props) {
  const hasFilter = filters.length > 0
  if (!hasFilter && !isAdmin) return null

  const locked = mode === 'enforced'
  const dimmed = mode === 'guided' && !active

  return (
    <div className="mb-2 flex items-center gap-2 flex-wrap text-xs">
      <span
        className="inline-flex items-center gap-1 font-medium text-gray-500"
        title={
          locked
            ? 'Set by an admin. Enforced mode: you can only narrow within it — tasks outside are hidden.'
            : 'Set by an admin as the default board scope. You can disable it or reset back to it.'
        }
      >
        {locked ? <Lock size={11} className="text-purple-400/80" /> : <Filter size={11} />}
        Board filter
        {locked && <span className="text-purple-400/80">· enforced</span>}
        {dimmed && <span className="text-gray-600">· off</span>}
      </span>

      {hasFilter ? (
        <div className={`flex items-center gap-1 flex-wrap ${dimmed ? 'opacity-40' : ''}`}>
          {filters.map((f) => (
            <ReadonlyPill key={f.instanceId} f={f} />
          ))}
        </div>
      ) : (
        <span className="italic text-gray-600">none set</span>
      )}

      {/* Guided: disable / reset-to toggle */}
      {hasFilter && mode === 'guided' && (
        active ? (
          <button
            onClick={() => onToggleActive(false)}
            className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors"
            title="Stop applying the board filter"
          >
            <EyeOff size={11} /> Disable
          </button>
        ) : (
          <button
            onClick={() => onToggleActive(true)}
            className="inline-flex items-center gap-1 text-brand hover:brightness-110 transition-colors"
            title="Re-apply the board filter"
          >
            <RotateCcw size={11} /> Reset to board filter
          </button>
        )
      )}

      {isAdmin && (
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1 text-gray-500 hover:text-brand transition-colors"
          title="Edit the board filter (admin)"
        >
          <Pencil size={11} /> {hasFilter ? 'Edit' : 'Set board filter'}
        </button>
      )}
    </div>
  )
}
