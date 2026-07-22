import { useState } from 'react'
import { X, Plus, Play, CheckSquare, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  useSprints,
  useCreateSprint,
  useActivateSprint,
  useCloseSprint,
  useCompleteSprint,
  useDeleteSprint,
} from '../hooks/useSprints'
import type { Sprint, ProjectMode } from '../types'
import { useVelocity, useSprintReport } from '../hooks/useEstimation'

interface Props {
  projectId: string
  boardId: string
  mode: ProjectMode
  showPoints: boolean
  onClose: () => void
}

function SprintReportRow({ projectId, sprintId }: { projectId: string; sprintId: string }) {
  const { data: r } = useSprintReport(projectId, sprintId)
  if (!r) return null
  return (
    <p className="text-[11px] text-gray-500">
      <span className="text-gray-400">{r.completed}</span>/{r.committed} pts done
      {r.scope_change !== 0 && <span className="ml-1.5">· scope {r.scope_change > 0 ? '+' : ''}{r.scope_change}</span>}
      {r.carryover > 0 && <span className="ml-1.5">· {r.carryover} carried over</span>}
    </p>
  )
}

const STATUS_BADGE: Record<Sprint['status'], string> = {
  planned: 'bg-gray-700 text-gray-300',
  active: 'bg-green-900/60 text-green-300',
  closed: 'bg-gray-800 text-gray-500',
}

export default function SprintPanel({ projectId, boardId, mode, showPoints, onClose }: Props) {
  const { data: sprints = [] } = useSprints(projectId, boardId)
  const { data: velocity } = useVelocity(projectId, undefined, showPoints)
  const capacity = velocity?.suggested_capacity ?? 0
  const createSprint = useCreateSprint(projectId, boardId)
  const activateSprint = useActivateSprint(projectId, boardId)
  const closeSprint = useCloseSprint(projectId, boardId)
  const completeSprint = useCompleteSprint(projectId, boardId)
  const deleteSprint = useDeleteSprint(projectId, boardId)

  function defaultDates() {
    const start = new Date()
    const end = new Date(start)
    end.setDate(end.getDate() + 14)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    return { start: fmt(start), end: fmt(end) }
  }

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(defaultDates().start)
  const [endDate, setEndDate] = useState(defaultDates().end)
  const [formError, setFormError] = useState<string | null>(null)

  // Enforced-mode completion: force a decision for incomplete tasks.
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completeAction, setCompleteAction] = useState<'backlog' | 'move' | 'new'>('backlog')
  const [targetSprintId, setTargetSprintId] = useState<string>('')
  const [newSprintName, setNewSprintName] = useState('')
  const [completeError, setCompleteError] = useState<string | null>(null)

  const moveTargets = sprints.filter((s) => s.id !== completingId && s.status !== 'closed')

  function openComplete(sprintId: string) {
    setCompletingId(sprintId)
    setCompleteAction('backlog')
    setTargetSprintId('')
    setNewSprintName('')
    setCompleteError(null)
  }

  async function confirmComplete() {
    if (!completingId) return
    if (completeAction === 'move' && !targetSprintId) {
      setCompleteError('Pick a sprint to move incomplete tasks to.')
      return
    }
    if (completeAction === 'new' && !newSprintName.trim()) {
      setCompleteError('Name the new sprint.')
      return
    }
    setCompleteError(null)
    try {
      await completeSprint.mutateAsync({
        sprintId: completingId,
        body: {
          incomplete_action: completeAction,
          target_sprint_id: completeAction === 'move' ? targetSprintId : null,
          new_sprint_name: completeAction === 'new' ? newSprintName.trim() : null,
        },
      })
      setCompletingId(null)
    } catch {
      setCompleteError('Failed to complete sprint.')
    }
  }

  async function handleCreate() {
    if (!name.trim() || !startDate || !endDate) return
    setFormError(null)
    try {
      await createSprint.mutateAsync({ name: name.trim(), start_date: startDate, end_date: endDate })
      setName('')
      const { start, end } = defaultDates()
      setStartDate(start)
      setEndDate(end)
      setShowForm(false)
    } catch {
      setFormError('Failed to create sprint.')
    }
  }

  function handleCancel() {
    setName('')
    const { start, end } = defaultDates()
    setStartDate(start)
    setEndDate(end)
    setFormError(null)
    setShowForm(false)
  }

  return (
    <div
      aria-label="Sprint panel"
      className="w-80 flex flex-col bg-gray-950 border-l border-gray-800 h-full overflow-y-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="text-sm font-semibold text-gray-200">Sprints</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand text-white text-xs font-medium hover:brightness-110 transition-all"
          >
            <Plus size={12} />
            New Sprint
          </button>
          <button
            aria-label="Close sprint panel"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {showForm && (
        <div className="px-4 py-3 border-b border-gray-800 flex flex-col gap-2">
          <input
            autoFocus
            placeholder="Sprint name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none placeholder-gray-600 focus:border-brand/60"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand/60"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand/60"
            />
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim() || !startDate || !endDate || createSprint.isPending}
              className="flex-1 py-1.5 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-40 hover:brightness-110 transition-all"
            >
              Create Sprint
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sprints.length === 0 && !showForm ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm text-gray-500">No sprints yet</p>
            <p className="text-xs text-gray-600">Create one to get started</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-800/60">
            {sprints.map((sprint) => (
              <li key={sprint.id} className="px-4 py-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-200 truncate">{sprint.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_BADGE[sprint.status]}`}>
                    {sprint.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {format(new Date(sprint.start_date), 'MMM d')} – {format(new Date(sprint.end_date), 'MMM d, yyyy')}
                </p>
                {showPoints && sprint.status === 'active' && (
                  <p className={`text-[11px] ${capacity > 0 && sprint.committed_points > capacity * 1.1 ? 'text-amber-400' : 'text-gray-500'}`}>
                    {sprint.committed_points} pts committed{capacity > 0 ? ` · capacity ~${capacity}` : ''}
                    {capacity > 0 && sprint.committed_points > capacity * 1.1 ? ' ⚠ over capacity' : ''}
                  </p>
                )}
                {showPoints && sprint.status === 'closed' && (
                  <SprintReportRow projectId={projectId} sprintId={sprint.id} />
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  {sprint.status === 'planned' && (
                    <>
                      <button
                        onClick={() => activateSprint.mutate(sprint.id)}
                        disabled={activateSprint.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-green-400 border border-green-800/60 hover:bg-green-900/30 transition-colors disabled:opacity-40"
                      >
                        <Play size={10} />
                        Start Sprint
                      </button>
                      <button
                        aria-label="Delete sprint"
                        onClick={() => deleteSprint.mutate(sprint.id)}
                        disabled={deleteSprint.isPending}
                        className="p-1 rounded-md text-gray-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                  {/* REQ-141: Guided/Enforced choose per close — simple close (nothing moves)
                      or Jira-style Complete with incomplete-task disposition. Flow: close only. */}
                  {sprint.status === 'active' && (
                    <button
                      onClick={() => closeSprint.mutate(sprint.id)}
                      disabled={closeSprint.isPending}
                      title="Close without moving any tasks"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-orange-400 border border-orange-800/60 hover:bg-orange-900/30 transition-colors disabled:opacity-40"
                    >
                      <CheckSquare size={10} />
                      Close Sprint
                    </button>
                  )}
                  {sprint.status === 'active' && mode !== 'open' && completingId !== sprint.id && (
                    <button
                      onClick={() => openComplete(sprint.id)}
                      title="Close and move incomplete tasks to the backlog or another sprint"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-orange-400 border border-orange-800/60 hover:bg-orange-900/30 transition-colors"
                    >
                      <CheckSquare size={10} />
                      Complete Sprint
                    </button>
                  )}
                </div>

                {/* Sprint completion dialog (Guided/Enforced) */}
                {completingId === sprint.id && (
                  <div className="mt-1 rounded-lg border border-orange-800/40 bg-orange-950/20 p-2.5 flex flex-col gap-2">
                    <p className="text-xs text-gray-400">Move <strong className="text-gray-200">incomplete</strong> tasks to:</p>
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="radio" checked={completeAction === 'backlog'} onChange={() => setCompleteAction('backlog')} className="accent-brand" />
                      Backlog
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="radio" checked={completeAction === 'move'} onChange={() => setCompleteAction('move')} className="accent-brand" />
                      Another sprint
                    </label>
                    {completeAction === 'move' && (
                      <select
                        value={targetSprintId}
                        onChange={(e) => setTargetSprintId(e.target.value)}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 outline-none focus:border-brand"
                      >
                        <option value="">— pick a sprint —</option>
                        {moveTargets.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    )}
                    {moveTargets.length === 0 && completeAction === 'move' && (
                      <p className="text-[11px] text-gray-500">No other open sprint — use “New sprint” or Backlog.</p>
                    )}
                    <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input type="radio" checked={completeAction === 'new'} onChange={() => setCompleteAction('new')} className="accent-brand" />
                      New sprint
                    </label>
                    {completeAction === 'new' && (
                      <input
                        autoFocus
                        value={newSprintName}
                        onChange={(e) => setNewSprintName(e.target.value)}
                        placeholder="New sprint name"
                        className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 outline-none placeholder-gray-600 focus:border-brand"
                      />
                    )}
                    {completeError && <p className="text-xs text-red-400">{completeError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={confirmComplete}
                        disabled={completeSprint.isPending}
                        className="flex-1 py-1 rounded-md bg-brand text-white text-xs font-medium disabled:opacity-40 hover:brightness-110 transition-all"
                      >
                        Complete Sprint
                      </button>
                      <button
                        onClick={() => setCompletingId(null)}
                        className="px-2 py-1 rounded-md border border-gray-700 text-xs text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
