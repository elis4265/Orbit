import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Trash2 } from 'lucide-react'
import type { Task, ProjectMember, PriorityItem } from '../types'
import TagPill from './TagPill'
import Avatar from './Avatar'
import IssueTypeBadge, { ISSUE_TYPE_BORDER } from './IssueTypeBadge'
import RichContent from './RichContent'

interface Props {
  task: Task
  onDelete: (id: string) => void
  onClick: (task: Task) => void
  assignee?: ProjectMember
  onFilterByTag?: (tagId: string) => void
  childCount?: number
  priorityItem?: PriorityItem
  selected?: boolean
  onSelectToggle?: (id: string) => void
  compact?: boolean
  gridMode?: boolean
}

export default function TaskCard({ task, onDelete, onClick, assignee, onFilterByTag, childCount, priorityItem, selected, onSelectToggle, compact, gridMode }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Type-coloured left edge so the issue type reads at a glance on every view.
  const accent = `border-l-4 ${ISSUE_TYPE_BORDER[task.issue_type ?? 'task']}`

  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className={`rounded-xl border-2 border-dashed border-gray-600 bg-gray-800/30 ${gridMode ? 'h-[80px]' : compact ? 'h-[40px]' : 'h-[72px] p-3'}`}
      />
    )
  }

  if (gridMode) {
    return (
      <div
        ref={setNodeRef}
        style={{ ...style, height: '80px' }}
        {...attributes}
        {...listeners}
        onClick={() => onClick(task)}
        className={`relative flex flex-col justify-between bg-gray-800 border ${accent} rounded-xl p-2 cursor-grab active:cursor-grabbing hover:border-brand/50 transition-colors group overflow-hidden ${selected ? 'border-brand bg-brand/10' : 'border-gray-700'}`}
      >
        <div className="flex items-center gap-1 min-w-0 pr-4">
          <IssueTypeBadge type={task.issue_type ?? 'task'} size={11} />
          <span className="text-[10px] text-gray-400 font-bold flex-shrink-0">
            {task.project_key}-{task.sequence_number}
          </span>
          {task.estimate != null && (
            <span className="ml-auto flex-shrink-0 text-[9px] font-bold text-gray-300 bg-gray-700 rounded px-1" title="Story points">{task.estimate}</span>
          )}
        </div>
        <span className="text-xs text-gray-100 font-medium leading-tight line-clamp-2 flex-1 mt-1">
          {task.title}
        </span>
        <div className="flex items-center justify-between mt-1">
          {priorityItem && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: priorityItem.color }}
              title={priorityItem.name}
            />
          )}
          {assignee && (
            <span className="ml-auto flex-shrink-0">
              <Avatar
                firstName={assignee.first_name}
                lastName={assignee.last_name}
                username={assignee.username}
                email={assignee.email}
                avatarUrl={assignee.avatar_url}
                size="xs"
              />
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
          aria-label="Delete task"
        >
          <Trash2 size={11} />
        </button>
      </div>
    )
  }

  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={() => onClick(task)}
        className={`relative flex items-center gap-2 bg-gray-800 border ${accent} rounded-xl px-3 py-2 cursor-grab active:cursor-grabbing hover:border-brand/50 transition-colors group ${selected ? 'border-brand bg-brand/10' : 'border-gray-700'}`}
      >
        <span className="flex-shrink-0">
          <IssueTypeBadge type={task.issue_type ?? 'task'} size={12} />
        </span>
        <span className="text-[11px] text-gray-400 font-bold flex-shrink-0">
          {task.project_key}-{task.sequence_number}
        </span>
        <span className="text-sm text-gray-100 font-medium truncate flex-1">
          {task.title}
        </span>
        {task.estimate != null && (
          <span className="flex-shrink-0 text-[10px] font-bold text-gray-300 bg-gray-700 rounded px-1.5 py-0.5" title="Story points">{task.estimate}</span>
        )}
        {priorityItem && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: priorityItem.color }}
            title={priorityItem.name}
          />
        )}
        {assignee && (
          <span className="flex-shrink-0">
            <Avatar
              firstName={assignee.first_name}
              lastName={assignee.last_name}
              username={assignee.username}
              email={assignee.email}
              avatarUrl={assignee.avatar_url}
              size="xs"
            />
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all flex-shrink-0"
          aria-label="Delete task"
        >
          <Trash2 size={12} />
        </button>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className={`relative bg-gray-800 border ${accent} rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-brand/50 transition-colors group ${selected ? 'border-brand bg-brand/10' : 'border-gray-700'}`}
    >
      {/* Top row: prominent type icon + identifier left, select + delete right */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span data-issue-type={task.issue_type ?? 'task'} className="shrink-0">
            <IssueTypeBadge type={task.issue_type ?? 'task'} size={18} />
          </span>
          <span className="text-sm font-bold text-gray-400 shrink-0">
            {task.project_key}-{task.sequence_number}
          </span>
          {task.parent_id && task.parent && (
            <span
              data-testid="parent-badge"
              className="text-[10px] text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded shrink-0"
            >
              ↑ {task.project_key}-{task.parent.sequence_number}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {onSelectToggle && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => {}}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onSelectToggle(task.id) }}
              data-checked={selected}
              className="w-3.5 h-3.5 rounded accent-brand cursor-pointer opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100"
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
            aria-label="Delete task"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Title */}
      <p className="text-sm text-gray-100 font-medium leading-snug line-clamp-2">
        {task.title}
      </p>

      {task.description && (
        <RichContent
          html={task.description}
          className="mt-1.5 text-xs text-gray-400 prose prose-invert prose-sm max-w-none line-clamp-2 overflow-hidden max-h-[2.5rem]"
        />
      )}

      {task.tags && task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <TagPill
              key={tag.id}
              tag={tag}
              onClick={onFilterByTag ? () => onFilterByTag(tag.id) : undefined}
            />
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {priorityItem && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-300 bg-gray-700/60 px-1.5 py-0.5 rounded">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: priorityItem.color }}
            />
            {priorityItem.name}
          </span>
        )}
        {childCount != null && childCount > 0 && (
          <span
            data-testid="child-count-badge"
            className="text-[10px] text-gray-400 bg-gray-700/60 px-1.5 py-0.5 rounded"
          >
            ↓ {childCount}
          </span>
        )}
        {task.due_date && (
          <span className="text-[10px] text-gray-500">
            {new Date(task.due_date).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        )}
        {task.estimate != null && (
          <span className="text-[10px] font-bold text-gray-300 bg-gray-700 rounded px-1.5 py-0.5" title="Story points">
            {task.estimate} SP
          </span>
        )}
        {assignee && (
          <span className="ml-auto" data-testid="assignee-avatar">
            <Avatar
              firstName={assignee.first_name}
              lastName={assignee.last_name}
              username={assignee.username}
              email={assignee.email}
              avatarUrl={assignee.avatar_url}
              size="xs"
            />
          </span>
        )}
      </div>
    </div>
  )
}
