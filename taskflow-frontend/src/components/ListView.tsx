import { useRef, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import IssueTypeBadge, { ISSUE_TYPE_BORDER } from './IssueTypeBadge'
import Avatar from './Avatar'
import TagPill from './TagPill'
import { taskKey } from '../lib/taskKey'
import type { Task, TaskStatus, TaskUpdate, ProjectMember, ProjectStatus, PriorityItem, Sprint } from '../types'

type SortField = 'title' | 'status' | 'due_date'
type SortDir = 'asc' | 'desc'
type EditField = 'title' | 'status' | 'due_date' | 'assignee' | 'sprint'

const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2 }
const STATUS_LABELS: Record<TaskStatus, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const STATUS_CLASSES: Record<TaskStatus, string> = {
  todo: 'bg-gray-800 text-gray-400',
  in_progress: 'bg-blue-900/50 text-blue-400',
  done: 'bg-green-900/50 text-green-400',
}

interface Props {
  tasks: Task[]
  memberMap: Record<string, ProjectMember>
  onRowClick: (task: Task) => void
  projectStatuses?: ProjectStatus[]
  isCustomMode?: boolean
  priorityMap?: Record<string, PriorityItem>
  onUpdateTask?: (taskId: string, data: TaskUpdate) => void
  sprints?: Sprint[]
  // REQ-157: multi-select — shift-click range, ctrl/cmd-click toggle; plain click still opens
  selectedIds?: Set<string>
  onSelectionChange?: (next: Set<string>) => void
}

interface HeaderDef {
  label: string
  field?: SortField
  mobileHidden?: boolean
  /** Fixed width on mobile (table-fixed there) so Title takes the remainder. */
  mobileWidth?: string
}

// mobileHidden: dropped below md so Title gets the width on a phone. Type is
// still conveyed there by the coloured accent strip moved onto the Title cell.
const HEADERS: HeaderDef[] = [
  { label: 'Type', mobileHidden: true },
  // HW-25: the cell leads with the issue key and the header sorts by issue number,
  // so the label names both — "Title" alone read as an alphabetical sort.
  { label: 'Key / Title', field: 'title' },
  { label: 'Status',   field: 'status', mobileWidth: 'w-28 md:w-auto' },
  { label: 'Priority', mobileHidden: true },
  { label: 'Assignee', mobileWidth: 'w-14 md:w-auto' },
  { label: 'Due Date', field: 'due_date', mobileHidden: true },
  { label: 'Tags', mobileHidden: true },
]

export default function ListView({
  tasks, memberMap, onRowClick, projectStatuses = [], isCustomMode = false,
  priorityMap = {}, onUpdateTask, sprints, selectedIds, onSelectionChange,
}: Props) {
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir]   = useState<SortDir>('asc')
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: EditField } | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  // Range anchor for shift-click; index is into the currently sorted view
  const lastSelectedRef = useRef<string | null>(null)

  function handleRowMouseDown(task: Task, e: React.MouseEvent, view: Task[]) {
    if (!onSelectionChange) return false
    const next = new Set(selectedIds ?? [])
    if (e.shiftKey) {
      const anchor = lastSelectedRef.current
      const anchorIdx = anchor ? view.findIndex((t) => t.id === anchor) : -1
      const clickIdx = view.findIndex((t) => t.id === task.id)
      if (anchorIdx >= 0 && clickIdx >= 0) {
        const [lo, hi] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx]
        for (let i = lo; i <= hi; i++) next.add(view[i].id)
      } else {
        next.add(task.id)
      }
      lastSelectedRef.current = task.id
      onSelectionChange(next)
      return true
    }
    if (e.ctrlKey || e.metaKey) {
      if (next.has(task.id)) next.delete(task.id)
      else next.add(task.id)
      lastSelectedRef.current = task.id
      onSelectionChange(next)
      return true
    }
    return false
  }

  function handleHeaderClick(field: SortField) {
    if (sortField !== field) {
      setSortField(field)
      setSortDir('asc')
    } else if (sortDir === 'asc') {
      setSortDir('desc')
    } else {
      setSortField(null)
    }
  }

  function sortedTasks(): Task[] {
    if (!sortField) return tasks
    return [...tasks].sort((a, b) => {
      let cmp = 0
      if (sortField === 'title') {
        // HW-25 / DD-1: the key leads the Title cell, so clicking Title sorts by
        // issue number (creation order) — the "oldest open issues" view — not by
        // title text. sequence_number is monotonic per project; missing → last.
        const sa = a.sequence_number ?? Infinity
        const sb = b.sequence_number ?? Infinity
        cmp = sa - sb
      } else if (sortField === 'status') {
        cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      } else if (sortField === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }

  function SortIndicator({ field }: { field: SortField }) {
    if (sortField !== field) return null
    return sortDir === 'asc'
      ? <ChevronUp size={12} aria-label="sort ascending" />
      : <ChevronDown size={12} aria-label="sort descending" />
  }

  function startEdit(e: React.MouseEvent, task: Task, field: EditField) {
    if (!onUpdateTask) return
    e.stopPropagation()
    if (field === 'title') setEditTitle(task.title)
    setEditingCell({ taskId: task.id, field })
    if (field === 'title') setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  function commitEdit(task: Task, data: Partial<Omit<TaskUpdate, 'version'>>) {
    if (!onUpdateTask) return
    onUpdateTask(task.id, { ...data, version: task.version })
    setEditingCell(null)
  }

  function cancelEdit() { setEditingCell(null) }

  const isEditing = (taskId: string, field: EditField) =>
    editingCell?.taskId === taskId && editingCell?.field === field

  const displayTasks = sortedTasks()

  const activeSprints = (sprints ?? []).filter((s) => s.status !== 'closed')

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      {/* table-fixed on mobile keeps the table inside 375px so Title wraps
          instead of pushing Status/Assignee off-screen; auto layout at md+. */}
      <table className="w-full table-fixed md:table-auto text-sm text-left text-gray-300">
        <thead className="text-xs text-gray-500 uppercase bg-gray-900 border-b border-gray-800">
          <tr>
            {HEADERS.map(({ label, field, mobileHidden, mobileWidth }) => (
              <th
                key={label}
                className={`px-4 py-3 whitespace-nowrap font-medium tracking-wide ${
                  mobileHidden ? 'hidden md:table-cell' : ''
                } ${mobileWidth ?? ''} ${
                  field ? 'cursor-pointer select-none hover:text-gray-200' : ''
                }`}
                onClick={field ? () => handleHeaderClick(field) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {label}
                  {field && <SortIndicator field={field} />}
                </span>
              </th>
            ))}
            {sprints && <th className="hidden md:table-cell px-4 py-3 whitespace-nowrap font-medium tracking-wide">Sprint</th>}
          </tr>
        </thead>
        <tbody>
          {displayTasks.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                No tasks yet
              </td>
            </tr>
          ) : (
            displayTasks.map((task) => {
              const assignee = task.assignee_id ? memberMap[task.assignee_id] : null
              const isSelected = selectedIds?.has(task.id) ?? false
              return (
                <tr
                  key={task.id}
                  aria-selected={isSelected}
                  className={`border-b border-gray-800 last:border-0 cursor-pointer transition-colors ${
                    isSelected ? 'bg-brand/15 hover:bg-brand/20' : 'hover:bg-gray-900/60'
                  }`}
                  onClick={(e) => {
                    if (handleRowMouseDown(task, e, displayTasks)) return
                    onRowClick(task)
                  }}
                >
                  <td className={`hidden md:table-cell px-4 py-3 border-l-4 ${ISSUE_TYPE_BORDER[task.issue_type ?? 'task']}`}>
                    <IssueTypeBadge type={task.issue_type ?? 'task'} size={14} showLabel />
                  </td>

                  {/* Title — inline editable. HW-22: the issue key leads the line
                      (YouTrack style) rather than taking a column of its own; a done
                      issue strikes its key through, as YouTrack does for resolved. */}
                  <td
                    className={`px-4 py-3 font-medium text-gray-100 break-words md:max-w-xs border-l-4 md:border-l-0 ${ISSUE_TYPE_BORDER[task.issue_type ?? 'task']}`}
                    title={onUpdateTask ? 'Click to edit' : undefined}
                    onClick={(e) => startEdit(e, task, 'title')}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      {taskKey(task) && (
                        <span
                          data-testid="issue-key"
                          className={`shrink-0 font-mono text-xs ${
                            task.status === 'done' ? 'text-gray-600 line-through' : 'text-gray-500'
                          }`}
                        >
                          {taskKey(task)}
                        </span>
                      )}
                      {isEditing(task.id, 'title') ? (
                        <input
                          ref={titleInputRef}
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={() => { if (editTitle.trim()) commitEdit(task, { title: editTitle.trim() }); else cancelEdit() }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editTitle.trim()) commitEdit(task, { title: editTitle.trim() })
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 min-w-0 bg-gray-800 border border-brand/60 rounded px-2 py-0.5 text-sm text-gray-100 outline-none"
                        />
                      ) : (
                        <span className={`block md:truncate ${onUpdateTask ? 'hover:text-brand transition-colors' : ''}`}>
                          {task.title}
                        </span>
                      )}
                    </span>
                  </td>

                  {/* Status — inline editable */}
                  <td
                    className="px-4 py-3"
                    onClick={(e) => !isCustomMode && startEdit(e, task, 'status')}
                    title={!isCustomMode && onUpdateTask ? 'Click to change status' : undefined}
                  >
                    {!isCustomMode && isEditing(task.id, 'status') ? (
                      <select
                        autoFocus
                        value={task.status}
                        onChange={(e) => commitEdit(task, { status: e.target.value as TaskStatus })}
                        onBlur={cancelEdit}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gray-800 border border-brand/60 rounded px-2 py-0.5 text-xs text-gray-200 outline-none cursor-pointer"
                      >
                        <option value="todo">To Do</option>
                        <option value="in_progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>
                    ) : isCustomMode && task.custom_status_id ? (
                      (() => {
                        const cs = projectStatuses.find((ps) => ps.id === task.custom_status_id)
                        return cs ? (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${cs.color}30`, color: cs.color }}
                          >
                            {cs.name}
                          </span>
                        ) : (
                          <span className={`inline-block whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[task.status]}`}>
                            {STATUS_LABELS[task.status]}
                          </span>
                        )
                      })()
                    ) : (
                      <span className={`inline-block whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASSES[task.status]} ${!isCustomMode && onUpdateTask ? 'cursor-pointer hover:opacity-80' : ''}`}>
                        {STATUS_LABELS[task.status]}
                      </span>
                    )}
                  </td>

                  <td className="hidden md:table-cell px-4 py-3">
                    {task.priority_id && priorityMap[task.priority_id] ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300">
                        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: priorityMap[task.priority_id].color }} />
                        {priorityMap[task.priority_id].name}
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>

                  {/* Assignee — inline editable */}
                  <td
                    className="px-4 py-3"
                    onClick={(e) => startEdit(e, task, 'assignee')}
                    title={onUpdateTask ? 'Click to change assignee' : undefined}
                  >
                    {isEditing(task.id, 'assignee') ? (
                      <select
                        autoFocus
                        value={task.assignee_id ?? ''}
                        onChange={(e) => commitEdit(task, { assignee_id: e.target.value || null })}
                        onBlur={cancelEdit}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gray-800 border border-brand/60 rounded px-2 py-0.5 text-xs text-gray-200 outline-none cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {Object.values(memberMap).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.username ?? m.email}
                          </option>
                        ))}
                      </select>
                    ) : assignee ? (
                      <Avatar
                        firstName={assignee.first_name}
                        lastName={assignee.last_name}
                        username={assignee.username}
                        email={assignee.email}
                        avatarUrl={assignee.avatar_url}
                        size="xs"
                      />
                    ) : (
                      <span className={`text-gray-600 ${onUpdateTask ? 'hover:text-gray-400 transition-colors' : ''}`}>—</span>
                    )}
                  </td>

                  {/* Due Date — inline editable */}
                  <td
                    className="hidden md:table-cell px-4 py-3 text-gray-400 whitespace-nowrap"
                    onClick={(e) => startEdit(e, task, 'due_date')}
                    title={onUpdateTask ? 'Click to change due date' : undefined}
                  >
                    {isEditing(task.id, 'due_date') ? (
                      <input
                        type="date"
                        autoFocus
                        defaultValue={task.due_date ? task.due_date.slice(0, 10) : ''}
                        onChange={(e) => commitEdit(task, { due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                        onBlur={cancelEdit}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-gray-800 border border-brand/60 rounded px-2 py-0.5 text-xs text-gray-200 outline-none"
                      />
                    ) : task.due_date ? (
                      <span className={onUpdateTask ? 'hover:text-brand transition-colors' : ''}>
                        {new Date(task.due_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    ) : (
                      <span className={`text-gray-600 ${onUpdateTask ? 'hover:text-gray-400 transition-colors' : ''}`}>—</span>
                    )}
                  </td>

                  <td className="hidden md:table-cell px-4 py-3">
                    {task.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {task.tags.map((tag) => <TagPill key={tag.id} tag={tag} />)}
                      </div>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>

                  {sprints && (
                    <td
                      className="hidden md:table-cell px-4 py-3"
                      onClick={(e) => { if (onUpdateTask && activeSprints.length > 0) startEdit(e, task, 'sprint') }}
                      title={onUpdateTask && activeSprints.length > 0 ? 'Click to assign sprint' : undefined}
                    >
                      {isEditing(task.id, 'sprint') ? (
                        <select
                          autoFocus
                          value={task.sprint_id ?? ''}
                          onChange={(e) => commitEdit(task, { sprint_id: e.target.value || null })}
                          onBlur={cancelEdit}
                          onClick={(e) => e.stopPropagation()}
                          className="bg-gray-800 border border-brand/60 rounded px-2 py-0.5 text-xs text-gray-200 outline-none cursor-pointer"
                        >
                          <option value="">No sprint</option>
                          {activeSprints.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      ) : task.sprint_id ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand font-medium cursor-pointer hover:bg-brand/30 transition-colors">
                          {sprints.find((s) => s.id === task.sprint_id)?.name ?? '—'}
                        </span>
                      ) : (
                        <span className={`text-gray-600 text-xs ${onUpdateTask && activeSprints.length > 0 ? 'hover:text-gray-400 transition-colors cursor-pointer' : ''}`}>
                          {activeSprints.length > 0 ? '+ Add to sprint' : '—'}
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
