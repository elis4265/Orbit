import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { parseISO, differenceInDays, addDays, format, startOfDay } from 'date-fns'
import InfoTooltip from './InfoTooltip'
import { ISSUE_TYPE_BORDER } from './IssueTypeBadge'
import type { Task, TaskUpdate, TaskLink } from '../types'

const STATUS_BAR: Record<string, string> = {
  todo: 'bg-gray-500',
  in_progress: 'bg-brand',
  done: 'bg-green-600',
}

type ZoomLevel = 'day' | 'week' | 'month'
const ZOOM_UNIT: Record<ZoomLevel, number> = { day: 1, week: 7, month: 30 }
const ZOOM_FORMAT: Record<ZoomLevel, string> = { day: 'd', week: 'd MMM', month: 'MMM yy' }

const ROW_H = 32   // px per row (h-7 + gap)
const BAR_H = 20   // px bar height
const LABEL_W = 192 // px left label column

interface Props {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onUpdateTask?: (taskId: string, data: TaskUpdate) => void
  taskLinks?: TaskLink[]
}

interface GanttRow {
  task: Task
  startDay: number
  durationDays: number
}

type DragState = {
  taskId: string
  type: 'move' | 'left' | 'right'
  pointerStartX: number
  origStartDay: number
  origDuration: number
}

function taskStart(task: Task): Date {
  return startOfDay(parseISO(task.start_date ?? task.created_at))
}
function taskEnd(task: Task): Date {
  return task.due_date ? startOfDay(parseISO(task.due_date)) : startOfDay(new Date())
}

export default function GanttView({ tasks, onTaskClick, onUpdateTask, taskLinks = [] }: Props) {
  const [zoom, setZoom] = useState<ZoomLevel>('week')
  const [drag, setDrag] = useState<DragState | null>(null)
  const [tempOffset, setTempOffset] = useState(0) // day offset during drag
  const gridRef = useRef<HTMLDivElement>(null)

  const { rows, rangeStart, totalDays } = useMemo(() => {
    const dated = tasks.filter(t => t.created_at)
    if (dated.length === 0) return { rows: [] as GanttRow[], rangeStart: startOfDay(new Date()), totalDays: 30 }

    const allStarts = dated.map(t => taskStart(t))
    const allEnds = dated.map(t => taskEnd(t))
    const rs = allStarts.reduce((a, b) => (a < b ? a : b))
    const re = allEnds.reduce((a, b) => (a > b ? a : b))
    const td = Math.max(differenceInDays(re, rs) + 8, 30)

    const computed: GanttRow[] = dated.map(task => {
      const s = taskStart(task)
      const e = taskEnd(task)
      const startDay = Math.max(0, differenceInDays(s, rs))
      const durationDays = Math.max(1, differenceInDays(e, s) + 1)
      return { task, startDay, durationDays }
    })
    return { rows: computed, rangeStart: rs, totalDays: td }
  }, [tasks])

  const unit = ZOOM_UNIT[zoom]
  const tickCount = Math.ceil(totalDays / unit)

  // Convert pixel X offset in the grid to day delta
  function pixelsToDays(px: number): number {
    const gridW = gridRef.current?.offsetWidth ?? 1
    return Math.round((px / gridW) * totalDays)
  }

  const onPointerDown = useCallback((
    e: React.PointerEvent,
    row: GanttRow,
    type: DragState['type'],
  ) => {
    if (!onUpdateTask) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ taskId: row.task.id, type, pointerStartX: e.clientX, origStartDay: row.startDay, origDuration: row.durationDays })
    setTempOffset(0)
  }, [onUpdateTask])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return
    const deltaX = e.clientX - drag.pointerStartX
    const deltaDays = pixelsToDays(deltaX)
    setTempOffset(deltaDays)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  const onPointerUp = useCallback((e: React.PointerEvent, row: GanttRow) => {
    if (!drag || !onUpdateTask) return
    const deltaX = e.clientX - drag.pointerStartX
    const deltaDays = pixelsToDays(deltaX)

    let newStartDay = drag.origStartDay
    let newDurationDays = drag.origDuration

    if (drag.type === 'move') {
      newStartDay = Math.max(0, drag.origStartDay + deltaDays)
    } else if (drag.type === 'left') {
      const shift = Math.min(deltaDays, drag.origDuration - 1)
      newStartDay = Math.max(0, drag.origStartDay + shift)
      newDurationDays = Math.max(1, drag.origDuration - shift)
    } else {
      newDurationDays = Math.max(1, drag.origDuration + deltaDays)
    }

    const newStart = addDays(rangeStart, newStartDay)
    const newEnd = addDays(newStart, newDurationDays - 1)
    onUpdateTask(row.task.id, {
      version: row.task.version,
      start_date: newStart.toISOString(),
      due_date: newEnd.toISOString(),
    })
    setDrag(null)
    setTempOffset(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, onUpdateTask, rangeStart])

  // Cancel drag on pointer cancel/up outside
  useEffect(() => {
    function cancel() { setDrag(null); setTempOffset(0) }
    window.addEventListener('pointercancel', cancel)
    return () => window.removeEventListener('pointercancel', cancel)
  }, [])

  // Build a map of taskId → row index for arrow drawing
  const rowIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach((r, i) => m.set(r.task.id, i))
    return m
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        No tasks with dates to display.
      </div>
    )
  }

  const totalH = rows.length * ROW_H

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Zoom</span>
        {(['day', 'week', 'month'] as ZoomLevel[]).map(z => (
          <button
            key={z}
            onClick={() => setZoom(z)}
            className={`px-2.5 py-0.5 rounded text-xs capitalize transition-colors ${zoom === z ? 'bg-brand text-white' : 'text-gray-400 hover:text-white bg-gray-800'}`}
          >
            {z}
          </button>
        ))}
        <InfoTooltip text="Bars span start_date → due_date (falls back to created_at → today). Drag bars to move; drag edges to resize. Arrows show 'blocks' dependencies." />
      </div>

      {/* Gantt grid */}
      <div className="overflow-x-auto">
        {/* Header */}
        <div className="flex mb-1" style={{ minWidth: 600 }}>
          <div className="flex-shrink-0" style={{ width: LABEL_W }} />
          <div className="flex-1 flex">
            {Array.from({ length: tickCount }).map((_, i) => {
              const day = addDays(rangeStart, i * unit)
              return (
                <div
                  key={i}
                  className="text-[10px] text-gray-500 border-l border-gray-800 pl-1 flex-shrink-0"
                  style={{ width: `${(unit / totalDays) * 100}%` }}
                >
                  {format(day, ZOOM_FORMAT[zoom])}
                </div>
              )
            })}
          </div>
        </div>

        {/* Rows + SVG overlay */}
        <div className="relative" style={{ minWidth: 600 }}>
          {/* Row backgrounds */}
          <div className="space-y-1">
            {rows.map(({ task, startDay, durationDays }, rowIdx) => {
              const isDraggingThis = drag?.taskId === task.id
              let effStartDay = startDay
              let effDuration = durationDays
              if (isDraggingThis) {
                if (drag!.type === 'move') effStartDay = Math.max(0, startDay + tempOffset)
                else if (drag!.type === 'left') {
                  const shift = Math.min(tempOffset, durationDays - 1)
                  effStartDay = Math.max(0, startDay + shift)
                  effDuration = Math.max(1, durationDays - shift)
                } else {
                  effDuration = Math.max(1, durationDays + tempOffset)
                }
              }
              const leftPct = Math.min((effStartDay / totalDays) * 100, 99)
              const widthPct = Math.min((effDuration / totalDays) * 100, 100 - leftPct)

              return (
                <div key={task.id} className="flex items-center h-7 group">
                  <button
                    onClick={() => onTaskClick(task)}
                    className="flex-shrink-0 text-left text-xs text-gray-300 hover:text-white truncate px-1 transition-colors"
                    style={{ width: LABEL_W }}
                    title={task.title}
                  >
                    {task.title}
                  </button>
                  <div ref={rowIdx === 0 ? gridRef : undefined} className="flex-1 relative bg-gray-900/40 rounded" style={{ height: BAR_H }}>
                    {/* Background grid lines */}
                    {Array.from({ length: tickCount }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 border-l border-gray-800/60"
                        style={{ left: `${(i * unit / totalDays) * 100}%` }}
                      />
                    ))}

                    {/* Bar */}
                    <div
                      className={`absolute rounded flex items-center select-none cursor-grab active:cursor-grabbing border-l-4 ${ISSUE_TYPE_BORDER[task.issue_type ?? 'task']} ${STATUS_BAR[task.status] ?? 'bg-gray-600'} ${isDraggingThis ? 'opacity-90 shadow-lg' : 'hover:brightness-110'}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, height: BAR_H, touchAction: 'none' }}
                      onPointerDown={(e) => onPointerDown(e, { task, startDay, durationDays }, 'move')}
                      onPointerMove={isDraggingThis ? onPointerMove : undefined}
                      onPointerUp={isDraggingThis ? (e) => onPointerUp(e, { task, startDay, durationDays }) : undefined}
                      onClick={(e) => { e.stopPropagation(); onTaskClick(task) }}
                      title={`${task.title} — ${task.status}`}
                    >
                      {/* Left resize handle */}
                      {onUpdateTask && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-l"
                          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { task, startDay, durationDays }, 'left') }}
                        />
                      )}
                      <span className="text-[9px] text-white/80 font-medium px-1.5 truncate leading-none pointer-events-none">
                        {effDuration}d
                      </span>
                      {/* Right resize handle */}
                      {onUpdateTask && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 rounded-r"
                          onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e, { task, startDay, durationDays }, 'right') }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Dependency arrows SVG overlay */}
          {taskLinks.length > 0 && (
            <svg
              className="absolute top-0 pointer-events-none"
              style={{ left: LABEL_W, width: `calc(100% - ${LABEL_W}px)`, height: totalH }}
              preserveAspectRatio="none"
            >
              {taskLinks
                .filter(l => l.link_type === 'blocks' || l.link_type === 'depends_on')
                .map(link => {
                  const srcIdx = rowIndexMap.get(link.source_id)
                  const dstIdx = rowIndexMap.get(link.target_id)
                  if (srcIdx == null || dstIdx == null) return null

                  const srcRow = rows[srcIdx]
                  const dstRow = rows[dstIdx]
                  if (!srcRow || !dstRow) return null

                  const gridW = gridRef.current?.offsetWidth ?? 400
                  const srcX = ((srcRow.startDay + srcRow.durationDays) / totalDays) * gridW
                  const srcY = srcIdx * ROW_H + ROW_H / 2
                  const dstX = (dstRow.startDay / totalDays) * gridW
                  const dstY = dstIdx * ROW_H + ROW_H / 2
                  const cx = (srcX + dstX) / 2

                  return (
                    <g key={link.id}>
                      <path
                        d={`M${srcX},${srcY} C${cx},${srcY} ${cx},${dstY} ${dstX},${dstY}`}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeOpacity={0.6}
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  )
                })}
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                  <polygon points="0 0, 6 2, 0 4" fill="#ef4444" fillOpacity={0.6} />
                </marker>
              </defs>
            </svg>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4">
        {Object.entries(STATUS_BAR).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`w-3 h-2.5 rounded-sm inline-block ${cls}`} />
            <span className="text-xs text-gray-400 capitalize">{status.replace('_', ' ')}</span>
          </div>
        ))}
        {taskLinks.length > 0 && (
          <div className="flex items-center gap-1.5">
            <svg width="20" height="10"><path d="M0,5 L16,5" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.6" /><polygon points="14,3 20,5 14,7" fill="#ef4444" fillOpacity="0.6" /></svg>
            <span className="text-xs text-gray-400">Blocks</span>
          </div>
        )}
      </div>
    </div>
  )
}
