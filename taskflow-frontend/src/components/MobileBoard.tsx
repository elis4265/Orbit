import { useMemo, useRef, useState } from 'react'
import { Plus, ChevronsLeftRight, X } from 'lucide-react'
import { DndContext, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, ProjectMember, PriorityItem } from '../types'
import TaskCard from './TaskCard'
import { buildMobileScreens, snapIndex, type MobileSubgroup } from '../lib/mobileBoard'

// The columns MobileBoard renders — a structural subset of BoardPage's ColumnDef.
export interface MobileColumn {
  id: string
  label: string
  labelColor?: string
  taskStatus: string
  isCustom: boolean
}

interface Props {
  columns: MobileColumn[]
  tasks: Task[]
  /** Which column a task belongs to — BoardPage's getTaskColumnId, pre-bound. */
  colIdOf: (t: Task) => string
  /** Swimlane grouping for a set of tasks — BoardPage's getSwimlaneGroups, pre-bound. */
  groupTasks: (tasks: Task[]) => MobileSubgroup[]
  grouped: boolean
  groupLabel?: string
  filterActive?: boolean
  onClearFilter?: () => void
  memberMap: Record<string, ProjectMember>
  priorityMap?: Record<string, PriorityItem>
  childCountMap?: Map<string, number>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onClearSelection: () => void
  onOpenTask: (id: string) => void
  onDeleteTask: (id: string) => void
  /** Create a task into this column's status. */
  onCreate: (col: MobileColumn) => void
  /** Move the current selection into this column. */
  onMove: (col: MobileColumn) => void
}

export default function MobileBoard({
  columns, tasks, colIdOf, groupTasks, grouped, groupLabel, filterActive, onClearFilter,
  memberMap, priorityMap = {}, childCountMap, selectedIds, onToggleSelect, onClearSelection,
  onOpenTask, onDeleteTask, onCreate, onMove,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const noSensors = useSensors()  // no sensors → cards render but never drag (moves go via the sheet)

  const screens = useMemo(
    () => buildMobileScreens(columns, tasks, colIdOf, (c) => c.id, groupTasks),
    [columns, tasks, colIdOf, groupTasks],
  )

  function onScroll() {
    const el = scroller.current
    if (!el) return
    const i = snapIndex(el.scrollLeft, el.clientWidth, screens.length)
    if (i !== active) setActive(i)
  }

  function jumpTo(i: number) {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
    setActive(i)
  }

  const activeCol = screens[active]?.col
  const selCount = selectedIds.size

  if (columns.length === 0) {
    return <p className="py-16 text-center text-sm text-gray-500">No statuses to show.</p>
  }

  function renderCard(task: Task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        onDelete={onDeleteTask}
        onClick={(t) => onOpenTask(t.id)}
        assignee={task.assignee_id ? memberMap[task.assignee_id] : undefined}
        childCount={childCountMap?.get(task.id)}
        priorityItem={task.priority_id ? priorityMap[task.priority_id] : undefined}
        selected={selectedIds.has(task.id)}
        onSelectToggle={onToggleSelect}
        compact
        alwaysShowSelect
      />
    )
  }

  return (
    <DndContext sensors={noSensors}>
      {/* Status rail — pills with counts (tap to jump) + create into the visible status */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Statuses">
        {screens.map((s, i) => (
          <button
            key={s.col.id}
            role="tab"
            aria-selected={i === active}
            onClick={() => jumpTo(i)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              i === active
                ? 'border-brand/60 bg-brand/15 text-white'
                : 'border-gray-800 bg-white/[0.03] text-gray-400'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.col.labelColor || '#8a92a6' }} />
            {s.col.label}
            <span className="font-mono text-[10px] text-gray-500">{s.count}</span>
          </button>
        ))}
        <button
          onClick={() => activeCol && onCreate(activeCol)}
          aria-label={`Add task to ${activeCol?.label ?? 'status'}`}
          className="ml-auto grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-brand/50 bg-brand/15 text-brand"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Filter / grouping context */}
      {(filterActive || grouped) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filterActive && (
            <button
              onClick={onClearFilter}
              className="flex items-center gap-1 rounded-md border border-brand/50 bg-brand/15 px-2 py-0.5 text-[11px] text-brand"
            >
              Filtered <X size={11} />
            </button>
          )}
          {grouped && (
            <span className="rounded-md border border-gray-800 bg-white/[0.03] px-2 py-0.5 text-[11px] text-gray-400">
              Grouped by <span className="font-medium text-gray-200">{groupLabel}</span>
            </span>
          )}
        </div>
      )}

      {/* One full-width status screen per column; native scroll-snap between them */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="mt-2 flex snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {screens.map((screen) => (
          <section key={screen.col.id} className="w-full flex-shrink-0 snap-center px-0.5">
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className="h-3.5 w-[3px] rounded" style={{ background: screen.col.labelColor || '#8a92a6' }} />
              <h3 className="text-[13px] font-bold text-gray-100">{screen.col.label}</h3>
              <span className="font-mono text-[11px] text-gray-500">{screen.count}</span>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-500">
                <ChevronsLeftRight size={13} className="text-brand/70" /> swipe
              </span>
            </div>

            {screen.count === 0 ? (
              <p className="px-1 py-10 text-center text-xs text-gray-600">Nothing here yet.</p>
            ) : grouped ? (
              screen.subgroups.map((g) => (
                <div key={g.id} className="mb-2">
                  <div className="sticky top-0 z-[2] mb-1 flex items-center gap-2 rounded-lg border border-brand/40 bg-gray-900/85 px-2.5 py-1.5 backdrop-blur">
                    <span className="truncate text-xs font-bold text-gray-100">{g.label || 'Ungrouped'}</span>
                    <span className="ml-auto font-mono text-[10px] text-gray-500">
                      {g.tasks.length} {g.tasks.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                  <SortableContext items={g.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">{g.tasks.map(renderCard)}</div>
                  </SortableContext>
                </div>
              ))
            ) : (
              <SortableContext items={screen.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">{screen.tasks.map(renderCard)}</div>
              </SortableContext>
            )}
          </section>
        ))}
      </div>

      {/* Move-to sheet — appears when tasks are selected */}
      {selCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-gray-700 bg-gradient-to-b from-gray-900 to-gray-950 px-4 pb-6 pt-3 shadow-[0_-18px_40px_-20px_#000]">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">
              <span className="text-brand">{selCount}</span> selected
            </span>
            <button onClick={onClearSelection} className="ml-auto text-xs text-gray-400">Clear</button>
          </div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Move to</p>
          <div className="flex flex-wrap gap-2">
            {columns.map((col) => (
              <button
                key={col.id}
                onClick={() => onMove(col)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-700 bg-white/[0.04] px-3 py-2 text-[12.5px] font-semibold text-gray-100"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: col.labelColor || '#8a92a6' }} />
                {col.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </DndContext>
  )
}
