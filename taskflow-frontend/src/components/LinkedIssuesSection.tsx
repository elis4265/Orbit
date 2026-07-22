import { useState, useRef, useEffect } from 'react'
import { Link2, X, Plus, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'
import { useTaskLinks, useAddTaskLink, useRemoveTaskLink, useTaskSearch } from '../hooks/useTaskLinks'
import { taskKey } from '../lib/taskKey'
import type { LinkType, TaskLink, Task, SubTask } from '../types'

const LINK_TYPE_OPTIONS: { value: LinkType; label: string }[] = [
  { value: 'blocks', label: 'Is blocker of' },
  { value: 'depends_on', label: 'Is dependent on' },
  { value: 'duplicates', label: 'Is duplicate of' },
  { value: 'relates_to', label: 'Is related to' },
]

// Labels where the current task is the *receiver* — shown with incoming styling
const INCOMING_LABELS = new Set([
  'Is blocked by',
  'Is depended on by',
  'Is duplicated by',
  'Child of',
])

const STATUS_BADGE: Record<string, string> = {
  todo: 'bg-gray-700 text-gray-300',
  in_progress: 'bg-blue-900 text-blue-300',
  done: 'bg-green-900 text-green-300',
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

function showSearchDropdown(dropdownOpen: boolean, filteredCount: number): boolean {
  return dropdownOpen && filteredCount > 0
}

function groupLinks(links: TaskLink[]): Record<string, TaskLink[]> {
  const groups: Record<string, TaskLink[]> = {}
  for (const lnk of links) {
    if (!groups[lnk.display_type]) groups[lnk.display_type] = []
    groups[lnk.display_type].push(lnk)
  }
  return groups
}

interface GroupHeaderProps {
  label: string
}

function GroupHeader({ label }: GroupHeaderProps) {
  const incoming = INCOMING_LABELS.has(label)
  return (
    <p
      data-testid={`link-group-${label}`}
      data-direction={incoming ? 'incoming' : 'outgoing'}
      className={`text-[11px] font-medium mb-1 flex items-center gap-1 ${
        incoming ? 'text-gray-500' : 'text-gray-300'
      }`}
    >
      {incoming
        ? <ArrowLeft size={10} className="shrink-0" />
        : <ArrowRight size={10} className="shrink-0 text-brand" />}
      {label}
    </p>
  )
}

interface LinkRowProps {
  title: string
  status: string
  /** HW-22: "HW-22"-style key, omitted for checklist subtasks which have none. */
  issueKey?: string
  onRemove?: () => void
  completed?: boolean
}

function LinkRow({ title, status, issueKey, onRemove, completed }: LinkRowProps) {
  return (
    <div className="flex items-center justify-between bg-gray-800 rounded px-2 py-1 group">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_BADGE[status] ?? 'bg-gray-700 text-gray-400'}`}>
          {STATUS_LABEL[status] ?? status}
        </span>
        {issueKey && (
          <span
            data-testid="issue-key"
            className={`shrink-0 font-mono text-[10px] ${
              status === 'done' ? 'text-gray-600 line-through' : 'text-gray-500'
            }`}
          >
            {issueKey}
          </span>
        )}
        <span className={`text-xs truncate ${completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>
          {title}
        </span>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

interface Props {
  projectId: string
  task: Task
}

export default function LinkedIssuesSection({ projectId, task }: Props) {
  const taskId = task.id
  const { data: links = [], isLoading } = useTaskLinks(projectId, taskId)
  const addLink = useAddTaskLink(projectId, taskId)
  const removeLink = useRemoveTaskLink(projectId, taskId)

  const [adding, setAdding] = useState(false)
  const [linkType, setLinkType] = useState<LinkType>('blocks')
  const [searchQ, setSearchQ] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [addError, setAddError] = useState('')

  const { data: searchResults = [] } = useTaskSearch(projectId, searchQ)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [dropdownOpen])

  const filtered = searchResults.filter(t => t.id !== taskId)

  async function handleSelect(targetId: string) {
    setDropdownOpen(false)
    setSearchQ('')
    setAddError('')
    try {
      await addLink.mutateAsync({ target_id: targetId, link_type: linkType })
      setAdding(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setAddError(msg || 'Failed to add link.')
    }
  }

  const linkGroups = groupLinks(links)
  const hasParent = !!task.parent
  const hasChildren = task.sub_tasks.length > 0
  const isEmpty = !isLoading && links.length === 0 && !hasParent && !hasChildren && !adding

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1">
          <Link2 size={12} />
          Linked Issues
        </span>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setAddError('') }}
            className="text-xs text-brand hover:underline flex items-center gap-0.5"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>

      {adding && (
        <div ref={containerRef} className="space-y-1.5">
          <div className="flex gap-1.5">
            <select
              value={linkType}
              onChange={e => setLinkType(e.target.value as LinkType)}
              className="text-xs bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-gray-200 focus:outline-none"
            >
              {LINK_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div className="relative flex-1">
              <input
                autoFocus
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setDropdownOpen(true) }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search tasks…"
                className="w-full text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand"
              />
              {showSearchDropdown(dropdownOpen, filtered.length) && (
                <div className="absolute z-50 mt-0.5 w-full bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {filtered.map(t => (
                    <button
                      key={t.id}
                      onPointerDown={e => { e.preventDefault(); handleSelect(t.id) }}
                      className="w-full text-left px-2 py-1.5 text-xs text-gray-200 hover:bg-gray-700 flex items-center justify-between gap-2"
                    >
                      {/* HW-22: pick by number — the search already matches on key. */}
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="shrink-0 font-mono text-[10px] text-gray-500">{taskKey(t)}</span>
                        <span className="truncate">{t.title}</span>
                      </span>
                      <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_BADGE[t.status] ?? ''}`}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => { setAdding(false); setSearchQ(''); setAddError('') }}
              className="text-gray-500 hover:text-gray-300"
            >
              <X size={14} />
            </button>
          </div>
          {addError && <p className="text-xs text-red-400">{addError}</p>}
          {addLink.isPending && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> Saving…
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="text-xs text-gray-500">Loading…</p>}

      {/* Hierarchy: Child of (current task has a parent) */}
      {hasParent && (
        <div>
          <GroupHeader label="Child of" />
          <div className="space-y-1">
            <LinkRow
              title={task.parent!.title}
              status={task.parent!.status}
              // The parent is always in this project, so it shares its key prefix.
              issueKey={taskKey({ project_key: task.project_key, sequence_number: task.parent!.sequence_number })}
            />
          </div>
        </div>
      )}

      {/* Task links grouped by display_type */}
      {Object.entries(linkGroups).map(([displayType, groupedLinks]) => (
        <div key={displayType}>
          <GroupHeader label={displayType} />
          <div className="space-y-1">
            {groupedLinks.map(lnk => (
              <LinkRow
                key={lnk.id}
                title={lnk.linked_task.title}
                status={lnk.linked_task.status}
                issueKey={taskKey(lnk.linked_task)}
                onRemove={() => removeLink.mutate(lnk.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Hierarchy: Parent of (current task has children) */}
      {hasChildren && (
        <div>
          <GroupHeader label="Parent of" />
          <div className="space-y-1">
            {task.sub_tasks.map((st: SubTask) => (
              <LinkRow
                key={st.id}
                title={st.title}
                status={st.is_completed ? 'done' : 'todo'}
                completed={st.is_completed}
              />
            ))}
          </div>
        </div>
      )}

      {isEmpty && <p className="text-xs text-gray-600">No linked issues.</p>}
    </div>
  )
}
