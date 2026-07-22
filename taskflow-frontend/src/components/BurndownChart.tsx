import { useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { useProjectBurndown } from '../hooks/useStats'

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function defaultDates() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 30)
  return { start: toISODate(start), end: toISODate(end) }
}

interface Props {
  workspaceId: string
  boardId?: string
  unit?: 'count' | 'points'
}

export default function BurndownChart({ workspaceId, boardId, unit = 'count' }: Props) {
  const [dates, setDates] = useState(defaultDates)

  const { data = [], isLoading } = useProjectBurndown(workspaceId, {
    ...(boardId ? { board_id: boardId } : {}),
    start: dates.start,
    end: dates.end,
    ...(unit === 'points' ? { unit: 'points' } : {}),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={dates.start}
            onChange={e => setDates(d => ({ ...d, start: e.target.value }))}
            className="bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={dates.end}
            onChange={e => setDates(d => ({ ...d, end: e.target.value }))}
            className="bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : data.length === 0 ? (
        <p className="text-gray-600 text-sm">No data for selected range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ left: 0, right: 8 }}>
            <CartesianGrid stroke="#1f2937" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#6b7280', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
            <Bar dataKey="completed" name="Completed" fill="#22c55e" opacity={0.7} radius={[2, 2, 0, 0]} />
            <Line type="monotone" dataKey="remaining" name="Remaining" stroke="#f97316" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
