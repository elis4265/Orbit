import { Zap, Bookmark, CheckSquare, Bug } from 'lucide-react'
import type { IssueType } from '../types'

interface Props {
  type: IssueType
  size?: number
  showLabel?: boolean
  pill?: boolean   // colored chip (bg + border) — high-visibility variant
}

const CONFIG: Record<IssueType, { icon: React.ElementType; label: string; className: string; pillClassName: string }> = {
  epic:  { icon: Zap,         label: 'Epic',  className: 'text-purple-400', pillClassName: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  story: { icon: Bookmark,    label: 'Story', className: 'text-blue-400',   pillClassName: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  task:  { icon: CheckSquare, label: 'Task',  className: 'text-gray-400',   pillClassName: 'bg-gray-500/15 text-gray-300 border-gray-600/40' },
  bug:   { icon: Bug,         label: 'Bug',   className: 'text-red-400',    pillClassName: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

export default function IssueTypeBadge({ type, size = 12, showLabel = false, pill = false }: Props) {
  const { icon: Icon, label, className, pillClassName } = CONFIG[type] ?? CONFIG.task

  if (pill) {
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${pillClassName}`} title={label}>
        <Icon size={size} />
        {label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={label}>
      <Icon size={size} />
      {showLabel && <span className="text-[10px] font-medium">{label}</span>}
    </span>
  )
}

// Solid accent colour per type — for the top strip of the task modal ("envelope").
export const ISSUE_TYPE_ACCENT: Record<IssueType, string> = {
  epic:  'bg-purple-500',
  story: 'bg-blue-500',
  task:  'bg-gray-500',
  bug:   'bg-red-500',
}

// Left-border accent per type — for cards + list rows across all board views.
export const ISSUE_TYPE_BORDER: Record<IssueType, string> = {
  epic:  'border-l-purple-500',
  story: 'border-l-blue-500',
  task:  'border-l-gray-500',
  bug:   'border-l-red-500',
}

export const ISSUE_TYPE_OPTIONS: { value: IssueType; label: string }[] = [
  { value: 'epic',  label: 'Epic' },
  { value: 'story', label: 'Story' },
  { value: 'task',  label: 'Task' },
  { value: 'bug',   label: 'Bug' },
]
