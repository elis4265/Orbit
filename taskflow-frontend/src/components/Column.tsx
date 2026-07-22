import { useDroppable, useDndMonitor } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, rectSortingStrategy } from '@dnd-kit/sortable'
import { useState } from 'react'
import { Plus, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { Task, TaskStatus, ProjectMember, PriorityItem } from '../types'
import TaskCard from './TaskCard'

interface Props {
  columnId: string
  droppableId?: string
  label: string
  labelColor?: string
  tasks: Task[]
  onAddClick: () => void
  onDelete: (id: string) => void
  onCardClick: (task: Task) => void
  draggingFromColumn?: string | null
  memberMap?: Record<string, ProjectMember>
  onFilterByTag?: (tagId: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  dropDisabled?: boolean
  childCountMap?: Map<string, number>
  priorityMap?: Record<string, PriorityItem>
  wipLimit?: number | null
  selectedTaskIds?: Set<string>
  onSelectToggle?: (id: string) => void
  compact?: boolean
  gridMode?: boolean
  // REQ-139: present only on done columns when the project hides old completed tasks.
  showingOlder?: boolean
  onToggleShowOlder?: () => void
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'text-gray-400',
  in_progress: 'text-brand',
  done: 'text-green-400',
}

function headerTextClass(columnId: string, labelColor?: string): string {
  if (labelColor) return ''
  return STATUS_COLORS[columnId as TaskStatus] ?? 'text-gray-400'
}

export default function Column({
  columnId, droppableId, label, labelColor, tasks, onAddClick, onDelete, onCardClick,
  draggingFromColumn, memberMap = {}, onFilterByTag, collapsed, onToggleCollapse, dropDisabled,
  childCountMap, priorityMap = {}, wipLimit, selectedTaskIds, onSelectToggle, compact, gridMode,
  showingOlder, onToggleShowOlder,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId ?? columnId })
  const [overId, setOverId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  useDndMonitor({
    onDragStart(e) { setActiveId(e.active.id.toString()) },
    onDragOver(e) { setOverId(e.over?.id?.toString() ?? null) },
    onDragEnd() { setOverId(null); setActiveId(null) },
    onDragCancel() { setOverId(null); setActiveId(null) },
  })
  const isOverTask = tasks.some((t) => t.id === overId)
  const draggingTaskAlreadyHere = activeId ? tasks.some((t) => t.id === activeId) : false
  // Enforced: a drag is in progress but this column is not an allowed transition target.
  const blocked = !!dropDisabled && activeId !== null
  const showDropPlaceholder = (isOver || isOverTask) && draggingFromColumn !== columnId && !draggingTaskAlreadyHere && !blocked

  const textClass = headerTextClass(columnId, labelColor)
  const textStyle = labelColor ? { color: labelColor } : {}

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        onClick={onToggleCollapse}
        title={blocked ? `Can't move here — not an allowed transition` : `Expand ${label} — or drop a task here to move it`}
        className={`flex flex-col items-center w-10 flex-shrink-0 bg-gray-900 rounded-2xl border cursor-pointer transition-colors py-4 gap-3 select-none ${blocked ? 'opacity-40 border-dashed border-gray-700 cursor-not-allowed' : isOver ? 'border-brand/60 bg-brand/5' : 'border-gray-800 hover:border-gray-600'}`}
      >
        <ChevronsRight size={14} className="text-gray-600" />
        <span className={`text-[11px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl] ${textClass}`} style={textStyle}>
          {label}
        </span>
        <span className="text-[10px] text-gray-500 bg-gray-800 rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
          {tasks.length}
        </span>
      </div>
    )
  }

  return (
    <div
      title={blocked ? `Can't move here — not an allowed transition from this status` : undefined}
      className={`flex flex-col flex-1 min-w-[16rem] bg-gray-900 rounded-2xl border transition-colors ${blocked ? 'opacity-40 border-dashed border-gray-700 cursor-not-allowed' : isOver ? 'border-brand/60 bg-gray-900/80' : 'border-gray-800'}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold uppercase tracking-wider ${textClass}`} style={textStyle}>
            {label}
          </span>
          {wipLimit != null ? (
            <span
              title={`WIP limit: ${wipLimit}`}
              className={`text-xs font-semibold rounded-full px-2 py-0.5 ${tasks.length >= wipLimit ? 'bg-red-900/60 text-red-400' : 'bg-gray-800 text-gray-400'}`}
            >
              {tasks.length}/{wipLimit}
            </span>
          ) : (
            <span className="text-xs text-gray-500 bg-gray-800 rounded-full px-2 py-0.5">
              {tasks.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleCollapse}
            className="text-gray-600 hover:text-gray-400 transition-colors"
            aria-label={`Collapse ${label}`}
            title={`Collapse ${label}`}
          >
            <ChevronsLeft size={14} />
          </button>
          <button
            onClick={onAddClick}
            className="text-gray-500 hover:text-brand transition-colors"
            aria-label={`Add task to ${label}`}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 p-3 min-h-[4rem] ${gridMode ? 'grid gap-2' : 'flex flex-col gap-2'}`}
        style={gridMode ? { gridTemplateColumns: 'repeat(2, 1fr)' } : undefined}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={gridMode ? rectSortingStrategy : verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onDelete={onDelete}
              onClick={onCardClick}
              assignee={task.assignee_id ? memberMap[task.assignee_id] : undefined}
              onFilterByTag={onFilterByTag}
              childCount={childCountMap?.get(task.id)}
              priorityItem={task.priority_id ? priorityMap[task.priority_id] : undefined}
              selected={selectedTaskIds?.has(task.id)}
              onSelectToggle={onSelectToggle}
              compact={compact || gridMode}
              gridMode={gridMode}
            />
          ))}
        </SortableContext>
        {showDropPlaceholder && !gridMode && (
          <div className={`rounded-xl border-2 border-dashed border-brand/50 bg-brand/5 ${compact ? 'h-[40px]' : 'h-[72px]'}`} />
        )}
      </div>
      {onToggleShowOlder && (
        <button
          onClick={onToggleShowOlder}
          className="mx-3 mb-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-500 rounded-lg transition-colors"
        >
          {showingOlder ? 'Hide older completed tasks' : 'Show older completed tasks'}
        </button>
      )}
    </div>
  )
}
