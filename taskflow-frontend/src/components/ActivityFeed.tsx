import React, { useState } from 'react'
import { Download, ArrowUpDown } from 'lucide-react'
import type { ActivityEntry } from '../types'
import { activityApi } from '../api/client'
import { useTaskActivity } from '../hooks/useActivity'

interface Props {
  projectId: string
  taskId: string
}

const ACTION_LABELS: Record<string, string> = {
  task_created: 'created this task',
  task_deleted: 'deleted this task',
  status_changed: 'changed status',
  priority_changed: 'changed priority',
  assignee_changed: 'changed assignee',
  due_date_changed: 'changed due date',
  title_changed: 'renamed task',
  comment_added: 'added a comment',
  comment_edited: 'edited a comment',
  comment_deleted: 'deleted a comment',
  attachment_added: 'added an attachment',
  attachment_deleted: 'removed an attachment',
  tag_applied: 'applied a tag',
  tag_removed: 'removed a tag',
  subtask_added: 'added a subtask',
  subtask_completed: 'completed a subtask',
  subtask_uncompleted: 'unchecked a subtask',
  subtask_deleted: 'deleted a subtask',
  subtask_promoted: 'promoted a subtask to standalone task —',
  task_promoted: 'promoted this task out of',
  link_added: 'linked an issue',
  link_removed: 'removed a link',
}

const CATEGORIES = [
  {
    id: 'history',
    label: 'History',
    actions: ['task_created', 'status_changed', 'priority_changed', 'assignee_changed', 'due_date_changed', 'title_changed', 'task_promoted'],
  },
  {
    id: 'comments',
    label: 'Comments',
    actions: ['comment_added', 'comment_edited', 'comment_deleted'],
  },
  {
    id: 'attachments',
    label: 'Attachments',
    actions: ['attachment_added', 'attachment_deleted'],
  },
  {
    id: 'tags',
    label: 'Tags',
    actions: ['tag_applied', 'tag_removed'],
  },
  {
    id: 'subtasks',
    label: 'Subtasks',
    actions: ['subtask_added', 'subtask_completed', 'subtask_uncompleted', 'subtask_deleted', 'subtask_promoted'],
  },
  {
    id: 'links',
    label: 'Links',
    actions: ['link_added', 'link_removed'],
  },
]

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Meta = Record<string, unknown> | null | undefined

function renderNoChange(label: string, meta: Meta): React.ReactNode {
  if (!meta) return <span>{label}</span>
  if (meta.filename)     return <span>{label} — <em className="text-gray-300">{meta.filename as string}</em></span>
  if (meta.snippet)      return <span>{label} — <em className="text-gray-400 italic">{meta.snippet as string}</em></span>
  if (meta.tag_name)     return <span>{label} <span className="text-gray-300">{meta.tag_name as string}</span></span>
  if (meta.linked_task)  return <span>{label} — <span className="text-gray-400">{meta.display_type as string}</span> <span className="text-gray-300">{meta.linked_task as string}</span></span>
  if (meta.title)        return <span>{label} <span className="text-gray-300">{meta.title as string}</span></span>
  return <span>{label}</span>
}

function EntryDescription({ entry }: { entry: ActivityEntry }) {
  const label = ACTION_LABELS[entry.action] ?? entry.action.replace(/_/g, ' ')
  const hasChange = entry.old_value != null || entry.new_value != null

  if (!hasChange) return renderNoChange(label, entry.meta as Meta)

  return (
    <span>
      {label}{' '}
      {entry.old_value != null && (
        <><span className="text-gray-500 line-through">{entry.old_value}</span>{' → '}</>
      )}
      <span className="text-gray-200">{entry.new_value ?? 'none'}</span>
    </span>
  )
}

async function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function ActivityFeed({ projectId, taskId }: Props) {
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(CATEGORIES.map(c => c.id)),
  )
  const [newestFirst, setNewestFirst] = useState(true)

  const enabledActions = CATEGORIES
    .filter(c => activeCategories.has(c.id))
    .flatMap(c => c.actions)

  const allEnabled = activeCategories.size === CATEGORIES.length
  const actionsParam = allEnabled ? undefined : enabledActions

  const { data: rawEntries = [], isLoading } = useTaskActivity(projectId, taskId, actionsParam)

  const entries = newestFirst ? [...rawEntries].reverse() : rawEntries

  function toggleCategory(id: string) {
    setActiveCategories(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleExport(format: 'csv' | 'json') {
    const blob = await activityApi.exportBlob(projectId, taskId, format)
    triggerDownload(blob, `activity-${taskId}.${format}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                activeCategories.has(cat.id)
                  ? 'bg-brand/20 border-brand/40 text-brand'
                  : 'bg-transparent border-gray-700 text-gray-500 hover:border-gray-500'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
          <button
            onClick={() => setNewestFirst(v => !v)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title={newestFirst ? 'Showing newest first' : 'Showing oldest first'}
          >
            <ArrowUpDown size={11} />
            {newestFirst ? 'Newest' : 'Oldest'}
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="Export as CSV"
          >
            <Download size={11} /> CSV
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="Export as JSON"
          >
            <Download size={11} /> JSON
          </button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-gray-600">Loading…</p>}

      {!isLoading && entries.length === 0 && (
        <p className="text-xs text-gray-600">No activity yet.</p>
      )}

      <div className="space-y-2">
        {entries.map((entry) => {
          const actor = entry.actor_name ?? 'Someone'
          const initial = actor[0]?.toUpperCase() ?? '?'

          return (
            <div key={entry.id} className="flex items-start gap-2.5">
              <div
                className="w-6 h-6 rounded-full bg-brand/30 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-brand mt-0.5"
                title={actor}
              >
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 leading-snug">
                  <span className="text-gray-200 font-medium">{actor}</span>{' '}
                  <EntryDescription entry={entry} />
                </p>
                <p className="text-[10px] text-gray-600 mt-0.5">{formatRelative(entry.created_at)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
