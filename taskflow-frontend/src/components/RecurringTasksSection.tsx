import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useRecurringTasks, useCreateRecurringTask, useUpdateRecurringTask, useDeleteRecurringTask } from '../hooks/useRecurringTasks'
import { useTaskTemplates } from '../hooks/useTaskTemplates'
import type { RecurrenceCadence } from '../types'

// REQ-148 — schedule a template to create a task automatically.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function cadenceLabel(cadence: string, weekday: number | null, dayOfMonth: number | null): string {
  if (cadence === 'daily') return 'every day'
  if (cadence === 'weekly') return `every ${WEEKDAYS[weekday ?? 0]}`
  return `monthly on day ${dayOfMonth}`
}

export default function RecurringTasksSection({ projectId }: { projectId: string }) {
  const { data: rules = [] } = useRecurringTasks(projectId)
  const { data: templates = [] } = useTaskTemplates(projectId)
  const createRule = useCreateRecurringTask(projectId)
  const updateRule = useUpdateRecurringTask(projectId)
  const deleteRule = useDeleteRecurringTask(projectId)

  const [templateId, setTemplateId] = useState('')
  const [cadence, setCadence] = useState<RecurrenceCadence>('weekly')
  const [weekday, setWeekday] = useState(0)
  const [dayOfMonth, setDayOfMonth] = useState(1)

  const templateName = (id: string) => templates.find((t) => t.id === id)?.name ?? '(deleted template)'

  async function handleCreate() {
    if (!templateId) return
    await createRule.mutateAsync({
      template_id: templateId,
      cadence,
      weekday: cadence === 'weekly' ? weekday : undefined,
      day_of_month: cadence === 'monthly' ? dayOfMonth : undefined,
    })
  }

  return (
    <div className="mt-6 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Recurring tasks</p>
      <p className="text-xs text-gray-500 mb-3">
        Create a task from a template automatically — daily, weekly or monthly. The created task behaves like any
        other: it notifies watchers, appears on the board and fires webhooks.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          aria-label="Template"
          className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
        >
          <option value="">— pick a template —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as RecurrenceCadence)}
          aria-label="Cadence"
          className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        {cadence === 'weekly' && (
          <select
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            aria-label="Weekday"
            className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
          >
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        )}
        {cadence === 'monthly' && (
          <input
            type="number" min={1} max={31} value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value))))}
            aria-label="Day of month"
            className="w-16 bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
          />
        )}
        <button
          onClick={handleCreate}
          disabled={!templateId || createRule.isPending}
          className="px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
        >
          Add schedule
        </button>
      </div>

      <ul className="flex flex-col divide-y divide-gray-800 border border-gray-800 rounded-xl overflow-hidden">
        {rules.length === 0 && <li className="px-4 py-3 text-sm text-gray-600">No recurring tasks.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-200 truncate">{templateName(r.template_id)}</p>
              <p className="text-xs text-gray-600">
                {cadenceLabel(r.cadence, r.weekday, r.day_of_month)} · next {new Date(r.next_run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={() => updateRule.mutate({ id: r.id, data: { enabled: !r.enabled } })}
                className="w-3.5 h-3.5 rounded accent-brand"
              />
              enabled
            </label>
            <button
              onClick={() => deleteRule.mutate(r.id)}
              className="text-gray-600 hover:text-red-400 transition-colors"
              aria-label="Delete schedule"
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
