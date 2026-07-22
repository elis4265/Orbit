import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Eye, EyeOff } from 'lucide-react'
import type { Task, TaskStatus, IssueType, SeverityLevel, Sprint, Release, ProjectStatus, ProjectMode } from '../types'
import { useProjectStatuses, useProjectTransitions } from '../hooks/useProjectStatuses'
import TaskActionsMenu from './TaskActionsMenu'
import { useProjectPriorities } from '../hooks/usePriorities'
import { useProjects } from '../hooks/useProjects'
import { useUpdateTask, useDeleteTask, useProjectTasks } from '../hooks/useTasks'
import { useActiveBlockers } from '../hooks/useTaskLinks'
import { useMembers } from '../hooks/useMembers'
import { useWatchStatus, useWatchTask, useUnwatchTask } from '../hooks/useWatchers'
import { useTags, useTaskTags, useApplyTag, useRemoveTag, useCreateTag } from '../hooks/useTags'
import { useSprints } from '../hooks/useSprints'
import { useReleases } from '../hooks/useReleases'
import { useCycles } from '../hooks/useCycles'
import PlanningPoker from './PlanningPoker'
import BaselinePrediction from './BaselinePrediction'
import CustomFieldsEditor from './CustomFieldsEditor'
import SubtaskSection from './SubtaskSection'
import AttachmentSection from './AttachmentSection'
import DescriptionEditor from './DescriptionEditor'
import CommentSection from './CommentSection'
import ActivityFeed from './ActivityFeed'
import TagPill from './TagPill'
import TagPicker from './TagPicker'
import DevelopmentSection from './DevelopmentSection'
import { branchName } from '../lib/branchName'
import { countIncompleteChildren } from '../lib/epicGate'
import TimeSpentSection from './TimeSpentSection'
import { useMe } from '../hooks/useAuth'
import LinkedIssuesSection from './LinkedIssuesSection'
import IssueTypeBadge, { ISSUE_TYPE_OPTIONS, ISSUE_TYPE_ACCENT } from './IssueTypeBadge'
import RichContent from './RichContent'

type EditingField = 'title' | 'status' | 'issue_type' | 'priority' | 'due_date' | 'assignee' | 'severity' | null

function initialIssueType(task: { issue_type?: string | null }): IssueType {
  return (task.issue_type as IssueType) ?? 'task'
}

function initialDueDate(task: { due_date?: string | null }): string {
  return task.due_date ? task.due_date.slice(0, 10) : ''
}

function getIsWatching(ws: { watching: boolean } | undefined): boolean {
  return ws ? ws.watching : false
}

function buildPatch(
  field: EditingField,
  value: string | number | null,
  taskVersion: number,
  taskTitle: string,
): Record<string, unknown> {
  const base = { version: taskVersion }
  if (field === 'title')      return { ...base, title: (value as string).trim() || taskTitle }
  if (field === 'status')     return { ...base, status: value }
  if (field === 'issue_type') return { ...base, issue_type: value }
  if (field === 'priority')   return { ...base, priority_id: value || null }
  if (field === 'due_date')   return { ...base, due_date: value || null }
  if (field === 'assignee')   return { ...base, assignee_id: value || null }
  if (field === 'severity')   return { ...base, severity: value || null }
  return base
}

function resolveAssigneeDisplay(
  members: Array<{ id: string; username?: string | null; email: string }>,
  assigneeId: string | null | undefined,
): string {
  const m = members.find((mem) => mem.id === assigneeId)
  return m?.username || m?.email || 'Unknown'
}

function BottomTabStrip({ active, onChange }: { active: 'comments' | 'activity'; onChange: (t: 'comments' | 'activity') => void }) {
  return (
    <div className="flex gap-1 mb-3 border-b border-gray-800">
      {(['comments', 'activity'] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors border-b-2 -mb-px ${
            active === tab ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          {tab === 'comments' ? 'Comments' : 'Activity'}
        </button>
      ))}
    </div>
  )
}

function WatchButton({ isWatching, onClick }: { isWatching: boolean; onClick: () => void }) {
  const cls = isWatching ? 'text-brand hover:text-brand/70' : 'text-gray-600 hover:text-gray-300'
  const label = isWatching ? 'Unwatch task' : 'Watch task'
  const title = isWatching ? 'Watching — click to unwatch' : 'Click to watch'
  return (
    <button onClick={onClick} className={`transition-colors ${cls}`} aria-label={label} title={title}>
      {isWatching ? <Eye size={15} /> : <EyeOff size={15} />}
    </button>
  )
}

interface DescSectionProps {
  task: { id: string; description?: string | null }
  projectId: string
  editing: boolean
  onStartEdit: () => void
  onDone: () => void
}

function DescriptionSection({ task, projectId, editing, onStartEdit, onDone }: DescSectionProps) {
  const [localHtml, setLocalHtml] = useState<string | null>(null)
  // Reset local snapshot when a different task is opened
  useEffect(() => { setLocalHtml(null) }, [task.id])

  if (editing) {
    return (
      <div>
        <DescriptionEditor projectId={projectId} taskId={task.id} onHtmlChange={setLocalHtml} />
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={onDone}
            className="text-xs px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-gray-100 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  const displayHtml = localHtml ?? task.description
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onStartEdit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStartEdit() }}
      className="min-h-[60px] cursor-text rounded-lg px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-800/60 border border-transparent hover:border-gray-700 transition-colors"
    >
      {displayHtml?.trim() ? (
        <RichContent html={displayHtml} className="prose prose-invert prose-sm max-w-none" />
      ) : (
        <p className="text-gray-500 italic text-sm">Add a description…</p>
      )}
    </div>
  )
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

interface Props {
  task: Task
  projectId: string
  boardId?: string
  currentUserId: string
  isAdmin?: boolean
  onClose: () => void
  onOpenTask?: (id: string) => void
}

interface SidebarProps {
  task: Task
  editing: EditingField
  setEditing: (f: EditingField) => void
  statusVal: TaskStatus
  issueTypeVal: IssueType
  priorityVal: string | null
  dueDateVal: string
  severityVal: SeverityLevel | null
  setSeverityVal: (v: SeverityLevel | null) => void
  members: { id: string; username?: string | null; email: string }[]
  sprints: Sprint[]
  releases: Release[]
  onReleaseChange: (releaseId: string | null) => void
  iterationLabel: string
  showPoints: boolean
  showBaseline: boolean
  showImpact: boolean
  onValueChange: (v: number | null) => void
  taskMode: ProjectMode
  onCustomFieldsSave: (cf: Record<string, unknown>) => Promise<void>
  modalProjectId: string
  pointsRollup: number | null
  onEstimateChange: (v: number | null) => void
  setStatusVal: (v: TaskStatus) => void
  setIssueTypeVal: (v: IssueType) => void
  setPriorityVal: (v: string | null) => void
  setDueDateVal: (v: string) => void
  save: (field: EditingField, value: string | number | null) => Promise<void>
  onSprintChange: (sprintId: string | null) => void
  cancelEdit: (field: EditingField) => void
  activeBlockerCount: number
  enforceBlockLinks: boolean
  onShowDoneConfirm: (pendingStatusId?: string) => void
  onShowHardBlockGate: () => void
  projectStatuses: ProjectStatus[]
  isCustomMode: boolean
  isEnforced: boolean
  allowedStatusIds: Set<string>
  onOpenTask?: (id: string) => void
  incompleteChildCount: number
  onShowEpicGateConfirm: (pendingStatusId: string) => void
  onShowStoryGate: () => void
  priorityItems: import('../types').PriorityItem[]
}

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

const severityColors: Record<SeverityLevel, string> = {
  low: 'text-gray-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-400',
}

function TaskSidebar({ task, editing, setEditing, statusVal, issueTypeVal, priorityVal, dueDateVal, severityVal, setSeverityVal, members, sprints, releases, onReleaseChange, iterationLabel, showPoints, showBaseline, showImpact, onValueChange, taskMode, onCustomFieldsSave, modalProjectId, pointsRollup, onEstimateChange, setStatusVal, setIssueTypeVal, setPriorityVal, setDueDateVal, save, onSprintChange, cancelEdit, activeBlockerCount, enforceBlockLinks, onShowDoneConfirm, onShowHardBlockGate, projectStatuses, isCustomMode, isEnforced, allowedStatusIds, onOpenTask, incompleteChildCount, onShowEpicGateConfirm, onShowStoryGate, priorityItems }: SidebarProps) {
  const { data: sidebarMe } = useMe()
  // Below md the rail stops being a fixed 208px column: it stacks full-width
  // under the content and scrolls with it (the parent owns the scroll there).
  return (
    <div
      data-testid="task-detail-rail"
      className="w-full min-w-0 md:w-52 md:flex-shrink-0 border-t md:border-t-0 md:border-l border-gray-800 p-4 md:p-5 md:overflow-y-auto space-y-5"
    >

      {/* Issue Type */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Type</p>
        {editing === 'issue_type' ? (
          <select
            aria-label="Issue type"
            value={issueTypeVal}
            autoFocus
            onChange={(e) => { setIssueTypeVal(e.target.value as IssueType); save('issue_type', e.target.value) }}
            onBlur={() => cancelEdit('issue_type')}
            onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit('issue_type') }}
            className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none"
          >
            {ISSUE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setEditing('issue_type')}
            className="rounded px-1 py-1 -mx-1 hover:bg-gray-800 transition-colors text-left"
            title="Change type"
          >
            <IssueTypeBadge type={task.issue_type ?? 'task'} size={13} pill />
          </button>
        )}
      </div>

      {/* Assignee */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Assignee</p>
        {editing === 'assignee' ? (
          <select
            value={task.assignee_id ?? ''}
            autoFocus
            onChange={(e) => save('assignee' as EditingField, e.target.value || null)}
            onBlur={() => cancelEdit('assignee')}
            onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit('assignee') }}
            className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.username || m.email}</option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setEditing('assignee')}
            className="text-sm text-gray-200 hover:text-white hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full"
          >
            {task.assignee_id
              ? resolveAssigneeDisplay(members, task.assignee_id)
              : <span className="text-gray-600">Unassigned</span>}
          </button>
        )}
      </div>

      {/* Status */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Status</p>
        {editing === 'status' ? (
          isCustomMode ? (
            <select
              value={task.custom_status_id ?? ''}
              autoFocus
              onChange={(e) => {
                const newId = e.target.value
                const cs = projectStatuses.find((ps) => ps.id === newId)
                const isCompletingStatus = cs?.category === 'completed' || cs?.category === 'cancelled'
                const isStartingStatus = cs?.category === 'started'
                const isLeavingUnstarted = isStartingStatus || isCompletingStatus
                if (isCompletingStatus && activeBlockerCount > 0 && isEnforced && enforceBlockLinks) {
                  setEditing(null)
                  onShowHardBlockGate()
                } else if (isCompletingStatus && activeBlockerCount > 0) {
                  setEditing(null)
                  onShowDoneConfirm(newId)
                } else if (isCompletingStatus && task.issue_type === 'epic' && incompleteChildCount > 0) {
                  setEditing(null)
                  onShowEpicGateConfirm(newId)
                } else if (isLeavingUnstarted && isEnforced && task.issue_type === 'story' && !task.parent_id) {
                  setEditing(null)
                  onShowStoryGate()
                } else {
                  save('status', newId)
                }
              }}
              onBlur={() => cancelEdit('status')}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit('status') }}
              className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none"
            >
              {projectStatuses
                .filter((ps) => ps.is_active && allowedStatusIds.has(ps.id))
                .sort((a, b) => a.position - b.position)
                .map((ps) => (
                  <option key={ps.id} value={ps.id}>{ps.name}</option>
                ))
              }
            </select>
          ) : (
            <select
              value={statusVal}
              autoFocus
              onChange={(e) => {
                const newStatus = e.target.value as TaskStatus
                setStatusVal(newStatus)
                if (newStatus === 'done' && activeBlockerCount > 0 && isEnforced && enforceBlockLinks) {
                  setEditing(null)
                  onShowHardBlockGate()
                } else if (newStatus === 'done' && activeBlockerCount > 0) {
                  setEditing(null)
                  onShowDoneConfirm()
                } else if (newStatus === 'done' && task.issue_type === 'epic' && incompleteChildCount > 0) {
                  setEditing(null)
                  onShowEpicGateConfirm('done')
                } else if ((newStatus === 'in_progress' || newStatus === 'done') && isEnforced && task.issue_type === 'story' && !task.parent_id) {
                  setEditing(null)
                  onShowStoryGate()
                } else {
                  save('status', newStatus)
                }
              }}
              onBlur={() => cancelEdit('status')}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit('status') }}
              className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none"
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          )
        ) : (
          <button onClick={() => setEditing('status')} className="text-sm text-gray-200 hover:text-white hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full">
            {isCustomMode
              ? (projectStatuses.find((ps) => ps.id === task.custom_status_id)?.name ?? STATUS_LABELS[task.status])
              : STATUS_LABELS[task.status]
            }
          </button>
        )}
        {isEnforced && editing === 'status' && isCustomMode && (
          <p className="text-[10px] text-yellow-600 mt-1">Only allowed transitions shown</p>
        )}
      </div>

      {/* Priority */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Priority</p>
        {editing === 'priority' ? (
          <select
            value={priorityVal ?? ''}
            autoFocus
            onChange={(e) => { const v = e.target.value || null; setPriorityVal(v); save('priority', v) }}
            onBlur={() => cancelEdit('priority')}
            onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit('priority') }}
            className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none"
          >
            <option value="">— none —</option>
            {priorityItems.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : (() => {
          const item = priorityItems.find((p) => p.id === (priorityVal ?? task.priority_id))
          return (
            <button
              onClick={() => setEditing('priority')}
              className="flex items-center gap-1.5 text-sm font-medium hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full text-gray-300"
            >
              {item ? (
                <>
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  {item.name}
                </>
              ) : (
                <span className="text-gray-500">Not set</span>
              )}
            </button>
          )
        })()}
      </div>

      {/* Severity — Bug tasks only */}
      {task.issue_type === 'bug' && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Severity</p>
          {editing === 'severity' ? (
            <select
              aria-label="Severity"
              value={severityVal ?? ''}
              autoFocus
              onChange={(e) => {
                const v = (e.target.value || null) as SeverityLevel | null
                setSeverityVal(v)
                save('severity', v)
              }}
              onBlur={() => cancelEdit('severity')}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit('severity') }}
              className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none"
            >
              <option value="">— Not set —</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          ) : (
            <button
              onClick={() => setEditing('severity')}
              className={`text-sm font-medium hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full ${severityVal ? severityColors[severityVal] : 'text-gray-600'}`}
            >
              {severityVal ? SEVERITY_LABELS[severityVal] : <span className="text-gray-600">Not set</span>}
            </button>
          )}
        </div>
      )}

      {/* Due date */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Due date</p>
        {editing === 'due_date' ? (
          <input
            type="date"
            value={dueDateVal}
            autoFocus
            onChange={(e) => setDueDateVal(e.target.value)}
            onBlur={() => save('due_date', dueDateVal)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save('due_date', dueDateVal)
              if (e.key === 'Escape') cancelEdit('due_date')
            }}
            className="w-full bg-gray-800 border border-brand rounded-lg px-2 py-1.5 text-sm text-gray-100 focus:outline-none [color-scheme:dark]"
          />
        ) : (
          <button onClick={() => setEditing('due_date')} className="text-sm text-gray-200 hover:text-white hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full">
            {task.due_date
              ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
              : <span className="text-gray-600">None</span>}
          </button>
        )}
      </div>

      {/* Story Points */}
      {showPoints && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Story Points</p>
          <div className="flex items-center gap-1 flex-wrap">
            {[1, 2, 3, 5, 8, 13, 21].map((n) => (
              <button
                key={n}
                onClick={() => onEstimateChange(n)}
                className={`w-7 h-7 rounded-md text-xs border transition-colors ${
                  task.estimate === n ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min={0}
              key={`est-${task.estimate ?? 'empty'}`}
              defaultValue={task.estimate ?? ''}
              onKeyDown={(e) => {
                // Blur commits the pending value; on Escape it must happen before
                // the window-level handler unmounts the modal (unmount fires no blur).
                if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                if (e.key === 'Escape') e.currentTarget.blur()
              }}
              onBlur={(e) => {
                const raw = e.currentTarget.value.trim()
                if (raw === '') return
                const v = Math.max(0, Math.round(Number(raw)))
                if (!Number.isNaN(v) && v !== task.estimate) onEstimateChange(v)
              }}
              placeholder="pts"
              title="Custom story points"
              className={`w-12 h-7 rounded-md text-xs border bg-transparent px-2 outline-none focus:border-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                task.estimate != null && ![1, 2, 3, 5, 8, 13, 21].includes(task.estimate)
                  ? 'border-brand text-brand' : 'border-gray-700 text-gray-400'
              }`}
            />
            {task.estimate != null && (
              <button onClick={() => onEstimateChange(null)} className="ml-1 text-xs text-gray-600 hover:text-gray-400">clear</button>
            )}
          </div>
          {pointsRollup != null && pointsRollup > 0 && (
            <p className="mt-1 text-[11px] text-gray-500">Children rollup: <strong className="text-gray-300">{pointsRollup}</strong> pts</p>
          )}
          <PlanningPoker taskId={task.id} onPick={onEstimateChange} />
        </div>
      )}

      {/* Baseline effort prediction */}
      {showBaseline && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Effort (predicted)</p>
          <BaselinePrediction projectId={modalProjectId} taskId={task.id} />
        </div>
      )}

      {/* Time spent (REQ-147) — independent of estimation method */}
      <TimeSpentSection projectId={modalProjectId} taskId={task.id} currentUserId={sidebarMe?.id ?? ''} />

      {/* Development (Git integration) */}
      <DevelopmentSection
        projectId={modalProjectId}
        taskId={task.id}
        branchSuggestion={branchName(sidebarMe?.username || 'me', task.project_key, task.sequence_number, task.title)}
      />

      {/* Custom fields (Guided/Enforced) */}
      <CustomFieldsEditor
        projectId={modalProjectId}
        mode={taskMode}
        values={(task.custom_fields ?? {}) as Record<string, unknown>}
        onSave={onCustomFieldsSave}
      />

      {/* Impact: value ÷ effort (WSJF-lite) */}
      {showImpact && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Business value</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => onValueChange(n)}
                className={`w-7 h-7 rounded-md text-xs border transition-colors ${
                  task.business_value === n ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                {n}
              </button>
            ))}
            {task.business_value != null && (
              <button onClick={() => onValueChange(null)} className="ml-1 text-xs text-gray-600 hover:text-gray-400">clear</button>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-3 mb-1.5">Size (effort)</p>
          <div className="flex items-center gap-1 flex-wrap">
            {[1, 2, 3, 5, 8, 13].map((n) => (
              <button
                key={n}
                onClick={() => onEstimateChange(n)}
                className={`w-7 h-7 rounded-md text-xs border transition-colors ${
                  task.estimate === n ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-800'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {task.business_value != null && (
            <p className="mt-2 text-[11px] text-gray-400">
              Priority score <strong className="text-brand">{(task.business_value / Math.max(task.estimate ?? 1, 1)).toFixed(2)}</strong>
              <span className="text-gray-600"> = value ÷ size — higher means do sooner.</span>
            </p>
          )}
        </div>
      )}

      {/* Sprint */}
      {sprints.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">{iterationLabel}</p>
          <select
            value={task.sprint_id ?? ''}
            onChange={(e) => onSprintChange(e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
          >
            <option value="">— None —</option>
            {sprints.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Release (fix version) */}
      {releases.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Release</p>
          <select
            value={task.release_id ?? ''}
            onChange={(e) => onReleaseChange(e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-brand"
          >
            <option value="">— None —</option>
            {releases.map(r => (
              <option key={r.id} value={r.id}>{r.name}{r.status === 'released' ? ' (released)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      {task.parent && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">Parent</p>
          <button
            onClick={() => onOpenTask?.(task.parent!.id)}
            data-testid="parent-task-link"
            className="flex items-center gap-1.5 text-sm text-brand hover:text-brand/80 hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full truncate"
          >
            <IssueTypeBadge type={task.parent.issue_type ?? 'task'} size={12} />
            <span className="text-xs text-gray-500 shrink-0">
              {task.project_key}-{task.parent.sequence_number}
            </span>
            <span className="truncate text-xs">{task.parent.title}</span>
          </button>
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-1">Created</p>
        <p className="text-xs text-gray-500">
          {new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>

    </div>
  )
}

export default function TaskDetailModal({ task, projectId, boardId, currentUserId, isAdmin = false, onClose, onOpenTask }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<EditingField>(null)
  const [descEditing, setDescEditing] = useState(false)
  const [titleVal, setTitleVal] = useState(task.title)
  const [statusVal, setStatusVal] = useState<TaskStatus>(task.status)
  const [issueTypeVal, setIssueTypeVal] = useState<IssueType>(initialIssueType(task))
  const [priorityVal, setPriorityVal] = useState<string | null>(task.priority_id ?? null)
  const [dueDateVal, setDueDateVal] = useState(initialDueDate(task))
  const [severityVal, setSeverityVal] = useState<SeverityLevel | null>(task.severity ?? null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showDoneConfirm, setShowDoneConfirm] = useState(false)
  const [pendingDoneStatusId, setPendingDoneStatusId] = useState<string | null>(null)
  const [showEpicGateConfirm, setShowEpicGateConfirm] = useState(false)
  const [pendingEpicGateStatusId, setPendingEpicGateStatusId] = useState<string | null>(null)
  const [showStoryGate, setShowStoryGate] = useState(false)
  const [bottomTab, setBottomTab] = useState<'comments' | 'activity'>('comments')

  const [showHardBlockGate, setShowHardBlockGate] = useState(false)

  const { data: projects = [] } = useProjects()
  const activeProject = projects.find((p) => p.id === projectId)
  const projectMode = activeProject?.mode ?? 'open'
  const enforceBlockLinks = activeProject?.enforce_block_links ?? false
  const isCustomMode = projectMode !== 'open'
  const isEnforced = projectMode === 'enforced'
  const { data: projectStatuses = [] } = useProjectStatuses(isCustomMode ? projectId : undefined)
  const { data: transitions = [] } = useProjectTransitions(isEnforced ? projectId : undefined)

  const allowedStatusIds = useMemo((): Set<string> => {
    if (!isEnforced || !task.custom_status_id) return new Set(projectStatuses.map((ps) => ps.id))
    const targets = transitions
      .filter((t) => t.from_status_id === task.custom_status_id && t.is_active)
      .map((t) => t.to_status_id)
    return new Set([task.custom_status_id, ...targets])
  }, [isEnforced, task.custom_status_id, transitions, projectStatuses])

  const titleInputRef = useRef<HTMLInputElement>(null)
  const updateTask = useUpdateTask(projectId)
  const deleteTask = useDeleteTask(projectId)
  const { data: members = [] } = useMembers(projectId)
  const activeBlockers = useActiveBlockers(projectId, task.id)
  const { data: watchStatus } = useWatchStatus(projectId, task.id)
  const watchTask = useWatchTask(projectId, task.id)
  const unwatchTask = useUnwatchTask(projectId, task.id)
  const isWatching = getIsWatching(watchStatus)

  const { data: allTags = [] } = useTags(projectId)
  const { data: taskTags = [] } = useTaskTags(projectId, task.id)
  const applyTag = useApplyTag(projectId, task.id)
  const removeTag = useRemoveTag(projectId, task.id)
  const createTag = useCreateTag(projectId)
  const taskTagIds = taskTags.map((t) => t.id)
  // Flow mode uses project-scoped automated cycles (board_id NULL); other modes
  // use board-scoped manual sprints. Both are rows assignable via task.sprint_id.
  const { data: boardSprints = [] } = useSprints(projectId, boardId ?? '', projectMode !== 'open')
  const { data: cycles = [] } = useCycles(projectId, projectMode === 'open')
  const sprints = projectMode === 'open'
    ? cycles.filter((c) => c.status !== 'closed')
    : boardSprints
  const iterationLabel = projectMode === 'open' ? 'Cycle' : 'Sprint'
  const { data: releases = [] } = useReleases(projectId)
  const { data: priorityItems = [] } = useProjectPriorities(projectId)
  const { data: allProjectTasks = [] } = useProjectTasks(projectId)
  const incompleteChildCount = useMemo(
    () => countIncompleteChildren(allProjectTasks, task.id),
    [allProjectTasks, task.id],
  )

  function syncTaskFields() {
    if (editing) return
    setTitleVal(task.title)
    setStatusVal(task.status)
    setIssueTypeVal(initialIssueType(task))
    setPriorityVal(task.priority_id ?? null)
    setDueDateVal(initialDueDate(task))
    setSeverityVal(task.severity ?? null)
  }
  useEffect(syncTaskFields, [task, editing])  

  function toggleWatch() {
    if (isWatching) {
      unwatchTask.mutate()
    } else {
      watchTask.mutate()
    }
  }

  function handleTitleFocus() {
    if (editing === 'title') titleInputRef.current?.focus()
  }
  useEffect(handleTitleFocus, [editing])  

  function handleEscapeKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (descEditing) {
        setDescEditing(false)
        qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      } else {
        onClose()
      }
    }
  }
  useEffect(() => {
    window.addEventListener('keydown', handleEscapeKey)
    return () => window.removeEventListener('keydown', handleEscapeKey)
  }, [onClose, descEditing, qc, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(field: EditingField, value: string | number | null) {
    setSaveError(null)
    try {
      let patch: Record<string, unknown>
      if (field === 'status' && isCustomMode) {
        patch = { version: task.version, custom_status_id: value }
      } else {
        patch = buildPatch(field, value, task.version, task.title)
      }
      await updateTask.mutateAsync({ taskId: task.id, data: patch as unknown as Parameters<typeof updateTask.mutateAsync>[0]['data'] })
    } catch {
      setSaveError('Failed to save. Please try again.')
    }
    setEditing(null)
  }

  const FIELD_RESET: Partial<Record<NonNullable<EditingField>, () => void>> = {
    title:      () => setTitleVal(task.title),
    status:     () => setStatusVal(task.status),
    issue_type: () => setIssueTypeVal(initialIssueType(task)),
    priority:   () => setPriorityVal(task.priority_id ?? null),
    due_date:   () => setDueDateVal(initialDueDate(task)),
    severity:   () => setSeverityVal(task.severity ?? null),
  }

  function cancelEdit(field: EditingField) {
    if (field) FIELD_RESET[field]?.()
    setEditing(null)
  }

  async function handleSprintChange(sprintId: string | null) {
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        data: { sprint_id: sprintId, version: task.version } as Parameters<typeof updateTask.mutateAsync>[0]['data'],
      })
    } catch {
      setSaveError('Failed to update sprint.')
    }
  }

  async function handleReleaseChange(releaseId: string | null) {
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        data: { release_id: releaseId, version: task.version } as Parameters<typeof updateTask.mutateAsync>[0]['data'],
      })
    } catch {
      setSaveError('Failed to update release.')
    }
  }

  const showPoints = activeProject?.estimation_method === 'story_points'
  const showBaseline = activeProject?.estimation_method === 'baseline'
  const showImpact = activeProject?.estimation_method === 'impact'
  async function handleCustomFieldsSave(custom_fields: Record<string, unknown>) {
    await updateTask.mutateAsync({
      taskId: task.id,
      data: { custom_fields, version: task.version } as Parameters<typeof updateTask.mutateAsync>[0]['data'],
    })
  }
  async function handleValueChange(business_value: number | null) {
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        data: { business_value, version: task.version } as Parameters<typeof updateTask.mutateAsync>[0]['data'],
      })
    } catch {
      setSaveError('Failed to update value.')
    }
  }
  const pointsRollup = showPoints && task.issue_type === 'epic'
    ? allProjectTasks.filter((t) => t.parent_id === task.id).reduce((s: number, t) => s + (t.estimate ?? 0), 0)
    : null
  async function handleEstimateChange(estimate: number | null) {
    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        data: { estimate, version: task.version } as Parameters<typeof updateTask.mutateAsync>[0]['data'],
      })
    } catch {
      setSaveError('Failed to update estimate.')
    }
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); save('title', titleVal) }
    if (e.key === 'Escape') cancelEdit('title')
  }

  const handleDelete = useCallback(async () => {
    await deleteTask.mutateAsync(task.id)
    onClose()
  }, [deleteTask, task.id, onClose])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4"
      onClick={handleBackdropClick}
    >
      {/* Below md this is a full-screen sheet: full width/height, square corners,
          no outer padding. From md up it is the unchanged centered dialog. */}
      <div
        data-testid="task-detail-panel"
        className="relative bg-gray-900 border-0 md:border border-gray-700 rounded-none md:rounded-2xl shadow-2xl w-full h-full max-w-none max-h-none md:w-full md:h-auto md:max-w-3xl md:max-h-[90vh] flex flex-col"
      >

        {/* Type-coloured accent across the top of the envelope */}
        <div className={`h-1.5 rounded-none md:rounded-t-2xl flex-shrink-0 ${ISSUE_TYPE_ACCENT[issueTypeVal] ?? ISSUE_TYPE_ACCENT.task}`} />

        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 md:px-6 py-3 md:py-4 border-b border-gray-800 flex-shrink-0">
          <div className="min-w-0">
            <IssueTypeBadge type={issueTypeVal} size={13} pill />
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <WatchButton isWatching={isWatching} onClick={toggleWatch} />
            <TaskActionsMenu projectId={projectId} taskId={task.id} onActionDone={onClose}
                             taskStatus={task.status} archivedAt={task.archived_at ?? null}
                             isAdmin={isAdmin} />
            <button
              onClick={handleDelete}
              className="text-gray-600 hover:text-red-400 transition-colors"
              aria-label="Delete task"
            >
              <Trash2 size={15} />
            </button>
            <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-300 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Below md: one vertical scroll flow (content, then the rail stacked
            beneath it). From md up: the unchanged side-by-side two-column body,
            each column scrolling on its own. */}
        <div
          data-testid="task-detail-body"
          className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden"
        >
          {/* Left: title, description, subtasks, attachments */}
          <div className="w-full min-w-0 md:flex-1 md:overflow-y-auto p-4 md:p-6 space-y-5">

            {/* Identifier */}
            <div className="flex items-center gap-2 mb-0.5">
              <IssueTypeBadge type={task.issue_type ?? 'task'} size={13} />
              <span className="text-sm font-bold text-gray-400 select-all">
                {task.project_key}-{task.sequence_number}
              </span>
            </div>

            {/* Title */}
            {editing === 'title' ? (
              <input
                ref={titleInputRef}
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                onBlur={() => save('title', titleVal)}
                onKeyDown={handleTitleKeyDown}
                className="w-full bg-transparent text-xl font-semibold text-gray-100 focus:outline-none border-b border-brand pb-1"
              />
            ) : (
              <h2
                onClick={() => setEditing('title')}
                className="text-xl font-semibold text-gray-100 cursor-pointer hover:text-white rounded px-1 -mx-1 hover:bg-gray-800/60 transition-colors"
              >
                {task.title}
              </h2>
            )}

            {/* Description — click to edit */}
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Description</p>
              <DescriptionSection
                task={task}
                projectId={projectId}
                editing={descEditing}
                onStartEdit={() => setDescEditing(true)}
                onDone={() => {
                  setDescEditing(false)
                  qc.invalidateQueries({ queryKey: ['tasks', projectId] })
                }}
              />
            </div>

            {saveError && <p className="text-xs text-red-400">{saveError}</p>}

            {/* Blocker warning */}
            {activeBlockers.length > 0 && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-yellow-600/40 bg-yellow-950/40 px-3 py-2.5 text-xs text-yellow-300">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>
                  <span className="font-medium">Blocked by {activeBlockers.length} unresolved issue{activeBlockers.length > 1 ? 's' : ''}:</span>{' '}
                  {activeBlockers.map(b => b.title).join(', ')}
                </span>
              </div>
            )}

            {/* Tags */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {taskTags.map((tag) => (
                  <TagPill
                    key={tag.id}
                    tag={tag}
                    onRemove={() => removeTag.mutate(tag.id)}
                  />
                ))}
                <TagPicker
                  availableTags={allTags}
                  selectedTagIds={taskTagIds}
                  onApply={(tagId) => applyTag.mutate(tagId)}
                  onRemove={(tagId) => removeTag.mutate(tagId)}
                  onCreateTag={async (name, color) => {
                    const tag = await createTag.mutateAsync({ name, color })
                    applyTag.mutate(tag.id)
                  }}
                />
              </div>
            </div>

            <SubtaskSection
              task={task}
              projectId={projectId}
              boardId={boardId ?? ''}
              onOpenTask={onOpenTask ?? (() => {})}
            />
            <LinkedIssuesSection projectId={projectId} task={task} />
            <AttachmentSection projectId={projectId} taskId={task.id} />

            {/* Comments / Activity tabs */}
            <div>
              <BottomTabStrip active={bottomTab} onChange={setBottomTab} />
              {bottomTab === 'comments' ? (
                <CommentSection
                  projectId={projectId}
                  taskId={task.id}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                />
              ) : (
                <ActivityFeed projectId={projectId} taskId={task.id} />
              )}
            </div>
          </div>

          {/* Right: metadata */}
          <TaskSidebar
            task={task}
            editing={editing}
            setEditing={setEditing}
            statusVal={statusVal}
            issueTypeVal={issueTypeVal}
            priorityVal={priorityVal}
            dueDateVal={dueDateVal}
            severityVal={severityVal}
            setSeverityVal={setSeverityVal}
            members={members}
            sprints={sprints}
            releases={releases}
            onReleaseChange={handleReleaseChange}
            iterationLabel={iterationLabel}
            showPoints={showPoints}
            showBaseline={showBaseline}
            showImpact={showImpact}
            onValueChange={handleValueChange}
            taskMode={projectMode}
            onCustomFieldsSave={handleCustomFieldsSave}
            modalProjectId={projectId}
            pointsRollup={pointsRollup}
            onEstimateChange={handleEstimateChange}
            setStatusVal={setStatusVal}
            setIssueTypeVal={setIssueTypeVal}
            setPriorityVal={setPriorityVal}
            setDueDateVal={setDueDateVal}
            save={save}
            onSprintChange={handleSprintChange}
            cancelEdit={cancelEdit}
            activeBlockerCount={activeBlockers.length}
            enforceBlockLinks={enforceBlockLinks}
            onShowDoneConfirm={(pendingId) => {
              if (pendingId) setPendingDoneStatusId(pendingId)
              setShowDoneConfirm(true)
            }}
            onShowHardBlockGate={() => setShowHardBlockGate(true)}
            projectStatuses={projectStatuses}
            isCustomMode={isCustomMode}
            isEnforced={isEnforced}
            allowedStatusIds={allowedStatusIds}
            onOpenTask={onOpenTask}
            incompleteChildCount={incompleteChildCount}
            onShowEpicGateConfirm={(pendingId) => {
              setPendingEpicGateStatusId(pendingId)
              setShowEpicGateConfirm(true)
            }}
            onShowStoryGate={() => setShowStoryGate(true)}
            priorityItems={priorityItems}
          />
        </div>

        {/* Story gate overlay (Enforced mode — must link Epic first) */}
        {showStoryGate && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-none md:rounded-2xl bg-black/60 p-4">
            <div className="bg-gray-900 border border-blue-600/50 rounded-xl p-5 mx-0 md:mx-6 shadow-2xl max-w-sm w-full">
              <p className="text-sm font-medium text-blue-300 mb-1">Epic required</p>
              <p className="text-xs text-gray-400 mb-4">
                Stories must be linked to an Epic before starting or completing work.
                Set a parent Epic in the <span className="text-gray-200">Parent</span> field first.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowStoryGate(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Epic gate confirmation overlay — heads-up in every mode, never a hard block */}
        {showEpicGateConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-none md:rounded-2xl bg-black/60 p-4">
            <div className="bg-gray-900 border border-purple-600/50 rounded-xl p-5 mx-0 md:mx-6 shadow-2xl max-w-sm w-full">
              <p className="text-sm font-medium text-purple-300 mb-1">Incomplete child tasks</p>
              <p className="text-xs text-gray-400 mb-4">
                This Epic has{' '}
                <span className="text-gray-200">{incompleteChildCount} incomplete child task{incompleteChildCount > 1 ? 's' : ''}</span>.
                {' '}Complete the Epic anyway?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowEpicGateConfirm(false); setPendingEpicGateStatusId(null) }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowEpicGateConfirm(false)
                    if (pendingEpicGateStatusId) save('status', pendingEpicGateStatusId)
                    setPendingEpicGateStatusId(null)
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-purple-700 text-white hover:opacity-90 transition-opacity"
                >
                  Complete anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hard block gate overlay (Enforced mode + enforce_block_links=true) */}
        {showHardBlockGate && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-none md:rounded-2xl bg-black/60 p-4">
            <div className="bg-gray-900 border border-red-600/50 rounded-xl p-5 mx-0 md:mx-6 shadow-2xl max-w-sm w-full">
              <p className="text-sm font-medium text-red-400 mb-1">Blocked — cannot mark as Done</p>
              <p className="text-xs text-gray-400 mb-4">
                This task is blocked by{' '}
                <span className="text-gray-200">{activeBlockers.map((b) => b.title).join(', ')}</span>.
                {' '}Resolve all blockers before marking this task as Done.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => { setShowHardBlockGate(false); setStatusVal(task.status) }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Blocker confirmation overlay */}
        {showDoneConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-none md:rounded-2xl bg-black/60 p-4">
            <div className="bg-gray-900 border border-yellow-600/50 rounded-xl p-5 mx-0 md:mx-6 shadow-2xl max-w-sm w-full">
              <p className="text-sm font-medium text-yellow-300 mb-1">Unresolved blockers</p>
              <p className="text-xs text-gray-400 mb-4">
                This task is blocked by{' '}
                <span className="text-gray-200">{activeBlockers.map((b) => b.title).join(', ')}</span>.
                {' '}Mark as Done anyway?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowDoneConfirm(false); setPendingDoneStatusId(null); setStatusVal(task.status) }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowDoneConfirm(false)
                    if (isCustomMode && pendingDoneStatusId) {
                      save('status', pendingDoneStatusId)
                    } else {
                      save('status', 'done')
                    }
                    setPendingDoneStatusId(null)
                  }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand text-white hover:opacity-90 transition-opacity"
                >
                  Mark as Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
