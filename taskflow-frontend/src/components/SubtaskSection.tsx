import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronRight, X, ArrowUpRight } from 'lucide-react'
import type { Task, TaskCreate } from '../types'
import { useTasks, useCreateTask, useUpdateTask } from '../hooks/useTasks'
import { subtaskApi } from '../api/client'
import IssueTypeBadge from './IssueTypeBadge'
import CreateTaskModal from './CreateTaskModal'

interface Props {
  task: Task
  projectId: string
  boardId: string
  onOpenTask: (id: string) => void
}

export default function SubtaskSection({ task, projectId, boardId, onOpenTask }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [linking, setLinking] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [linkError, setLinkError] = useState('')
  const { data: allTasks = [] } = useTasks(projectId, boardId)
  const createTask = useCreateTask(projectId, boardId)
  const updateTask = useUpdateTask(projectId)
  const qc = useQueryClient()

  // REQ-164: promote child → standalone task
  const promote = useMutation({
    mutationFn: (subtaskId: string) => subtaskApi.promote(projectId, task.id, subtaskId),
    onSuccess: () => {
      console.log('[Subtasks] promoted to standalone task')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
    },
  })

  const children = allTasks.filter((t) => t.parent_id === task.id)

  const parentLabel = task.project_key && task.sequence_number
    ? `${task.project_key}-${task.sequence_number} ${task.title}`
    : task.title

  async function handleCreate(data: TaskCreate, _boardId: string): Promise<Task | void> {
    return createTask.mutateAsync(data)
  }

  // Candidates to attach as a child: not self, not already a child, not this
  // task's own parent (cycle), and not an Epic (Epics are top-level).
  const q = searchQ.trim().toLowerCase()
  const candidates = allTasks
    .filter((t) =>
      t.id !== task.id &&
      t.parent_id !== task.id &&
      t.id !== task.parent_id &&
      t.issue_type !== 'epic')
    .filter((t) => !q || t.title.toLowerCase().includes(q) || `${t.project_key}-${t.sequence_number}`.toLowerCase().includes(q))
    .slice(0, 8)

  async function attach(child: Task) {
    setLinkError('')
    try {
      await updateTask.mutateAsync({ taskId: child.id, data: { parent_id: task.id, version: child.version } })
      setLinking(false)
      setSearchQ('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setLinkError(msg || 'Could not attach that task.')
    }
  }

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">
          Child Tasks{children.length > 0 ? ` (${children.length})` : ''}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { setLinking(true); setLinkError('') }}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <Plus size={12} />
            Existing
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 text-xs text-brand hover:text-brand/80 transition-colors"
          >
            <Plus size={12} />
            New
          </button>
        </div>
      </div>

      {linking && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search a task to add as child…"
              className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand"
            />
            <button type="button" onClick={() => { setLinking(false); setSearchQ('') }} className="text-gray-500 hover:text-gray-300">
              <X size={14} />
            </button>
          </div>
          {candidates.length > 0 && (
            <ul className="border border-gray-700 rounded bg-gray-800 divide-y divide-gray-700/60 overflow-hidden">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => attach(c)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-700 transition-colors"
                  >
                    <IssueTypeBadge type={c.issue_type ?? 'task'} size={12} />
                    <span className="text-xs text-gray-500 font-medium shrink-0">{c.project_key}-{c.sequence_number}</span>
                    <span className="flex-1 text-xs text-gray-200 truncate">{c.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q && candidates.length === 0 && <p className="text-xs text-gray-600">No matching tasks.</p>}
          {linkError && <p className="text-xs text-red-400">{linkError}</p>}
        </div>
      )}

      {children.length > 0 && (
        <ul className="space-y-0.5 mb-2">
          {children.map((child) => (
            <li key={child.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenTask(child.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenTask(child.id) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-colors group text-left cursor-pointer"
              >
                <IssueTypeBadge type={child.issue_type ?? 'task'} size={12} />
                <span className="text-xs text-gray-500 font-medium shrink-0">
                  {child.project_key}-{child.sequence_number}
                </span>
                <span className="flex-1 text-sm text-gray-200 truncate">{child.title}</span>
                <button
                  type="button"
                  aria-label={`Promote ${child.title} to task`}
                  title="Promote to standalone task"
                  disabled={promote.isPending}
                  onClick={(e) => { e.stopPropagation(); promote.mutate(child.id) }}
                  className="text-gray-600 hover:text-brand opacity-0 group-hover:opacity-100 shrink-0 transition-opacity disabled:opacity-30"
                >
                  <ArrowUpRight size={13} />
                </button>
                <ChevronRight size={12} className="text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateTaskModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        projectId={projectId}
        boardId={boardId}
        initialParentId={task.id}
        initialParentLabel={parentLabel}
      />
    </div>
  )
}
