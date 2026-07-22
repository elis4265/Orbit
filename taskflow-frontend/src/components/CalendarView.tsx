import { useState, useMemo } from 'react'
import { ISSUE_TYPE_BORDER } from './IssueTypeBadge'
import {
  startOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format,
  isSameDay, isSameMonth,
  addMonths, subMonths,
  addWeeks, subWeeks,
  addDays, subDays,
  parseISO,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import InfoTooltip from './InfoTooltip'
import type { Task, TaskUpdate } from '../types'

const STATUS_PILL: Record<string, string> = {
  todo: 'bg-gray-600 text-gray-200',
  in_progress: 'bg-purple-600 text-white',
  done: 'bg-green-700 text-white',
}

type CalendarMode = 'month' | 'week' | 'day'

interface Props {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onUpdateTask?: (taskId: string, data: TaskUpdate) => void
}

function tasksByDayMap(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.due_date) continue
    const key = format(parseISO(t.due_date), 'yyyy-MM-dd')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  return map
}

interface DayColProps {
  day: Date
  dayTasks: Task[]
  inFocus: boolean
  isToday: boolean
  onTaskClick: (task: Task) => void
  onDropDate: (taskId: string, date: Date) => void
  compact?: boolean
}

function DayCol({ day, dayTasks, inFocus, isToday, onTaskClick, onDropDate, compact }: DayColProps) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      className={`bg-gray-950 p-1.5 ${!inFocus ? 'opacity-30' : ''} ${dragOver ? 'bg-brand/10' : ''} transition-colors`}
      style={{ minHeight: compact ? 60 : 80 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const taskId = e.dataTransfer.getData('text/plain')
        if (taskId) onDropDate(taskId, day)
      }}
    >
      <div
        className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
          isToday ? 'bg-brand text-white' : 'text-gray-400'
        }`}
      >
        {format(day, 'd')}
      </div>
      <div className="space-y-0.5">
        {dayTasks.slice(0, compact ? 2 : 3).map(t => (
          <button
            key={t.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
            onClick={() => onTaskClick(t)}
            className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-medium cursor-grab border-l-4 ${ISSUE_TYPE_BORDER[t.issue_type ?? 'task']} ${STATUS_PILL[t.status] ?? 'bg-gray-700 text-gray-200'}`}
            title={t.title}
          >
            {t.title}
          </button>
        ))}
        {dayTasks.length > (compact ? 2 : 3) && (
          <div className="text-[10px] text-gray-500 px-1">+{dayTasks.length - (compact ? 2 : 3)} more</div>
        )}
      </div>
    </div>
  )
}

export default function CalendarView({ tasks, onTaskClick, onUpdateTask }: Props) {
  const [mode, setMode] = useState<CalendarMode>('month')
  const [anchor, setAnchor] = useState(() => new Date())

  const byDay = useMemo(() => tasksByDayMap(tasks), [tasks])

  function handleDrop(taskId: string, date: Date) {
    if (!onUpdateTask) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const newDue = new Date(date)
    newDue.setHours(12, 0, 0, 0)
    onUpdateTask(taskId, { version: task.version, due_date: newDue.toISOString() })
  }

  // Month view
  function renderMonth() {
    const monthStart = startOfMonth(anchor)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const last = addDays(gridStart, 41)
    const days = eachDayOfInterval({ start: gridStart, end: last })

    return (
      <>
        <div className="flex items-center justify-between mb-3" data-testid="calendar-header">
          <button onClick={() => setAnchor(m => subMonths(m, 1))} aria-label="Previous month" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-gray-200">{format(anchor, 'MMMM yyyy')}</span>
            <InfoTooltip text="Tasks pinned to due date. Drag a pill to a new day to reschedule. Click to open." />
          </div>
          <button onClick={() => setAnchor(m => addMonths(m, 1))} aria-label="Next month" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-px">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-800 rounded-xl overflow-hidden border border-gray-800">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            return (
              <DayCol
                key={key}
                day={day}
                dayTasks={byDay.get(key) ?? []}
                inFocus={isSameMonth(day, anchor)}
                isToday={isSameDay(day, new Date())}
                onTaskClick={onTaskClick}
                onDropDate={handleDrop}
              />
            )
          })}
        </div>
      </>
    )
  }

  // Week view
  function renderWeek() {
    const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(anchor, { weekStartsOn: 1 })
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd })

    return (
      <>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setAnchor(d => subWeeks(d, 1))} aria-label="Previous week" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-200">
            {format(weekStart, 'd MMM')} – {format(weekEnd, 'd MMM yyyy')}
          </span>
          <button onClick={() => setAnchor(d => addWeeks(d, 1))} aria-label="Next week" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            return (
              <div key={key}>
                <div className="text-center text-xs font-medium text-gray-500 pb-1">
                  {format(day, 'EEE')}
                </div>
                <DayCol
                  day={day}
                  dayTasks={byDay.get(key) ?? []}
                  inFocus={true}
                  isToday={isSameDay(day, new Date())}
                  onTaskClick={onTaskClick}
                  onDropDate={handleDrop}
                  compact
                />
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // Day view
  function renderDay() {
    const key = format(anchor, 'yyyy-MM-dd')
    const dayTasks = byDay.get(key) ?? []
    const allTasksWithoutDate = tasks.filter(t => !t.due_date)

    return (
      <>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setAnchor(d => subDays(d, 1))} aria-label="Previous day" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-200">{format(anchor, 'EEEE, d MMMM yyyy')}</span>
          <button onClick={() => setAnchor(d => addDays(d, 1))} aria-label="Next day" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
        <div
          className={`rounded-xl border border-gray-800 bg-gray-950 min-h-[200px] p-3 space-y-1.5`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const taskId = e.dataTransfer.getData('text/plain')
            if (taskId) handleDrop(taskId, anchor)
          }}
        >
          {dayTasks.length === 0 && allTasksWithoutDate.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">No tasks due today.</p>
          ) : (
            dayTasks.map(t => (
              <button
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                onClick={() => onTaskClick(t)}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg font-medium cursor-grab ${STATUS_PILL[t.status] ?? 'bg-gray-700 text-gray-200'}`}
              >
                {t.title}
              </button>
            ))
          )}
        </div>
        {allTasksWithoutDate.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1.5 font-medium">Unscheduled — drag to assign a date</div>
            <div className="flex flex-wrap gap-1.5">
              {allTasksWithoutDate.map(t => (
                <span
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                  className="text-[10px] px-2 py-0.5 bg-gray-800 text-gray-400 rounded cursor-grab hover:bg-gray-700 transition-colors"
                  title={t.title}
                >
                  {t.title}
                </span>
              ))}
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5 w-fit">
        {(['month', 'week', 'day'] as CalendarMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1 rounded-md text-xs capitalize transition-colors ${mode === m ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === 'month' && renderMonth()}
      {mode === 'week' && renderWeek()}
      {mode === 'day' && renderDay()}
    </div>
  )
}
