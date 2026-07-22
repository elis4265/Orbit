/**
 * Time in Status — average and median hours tasks spend in each status.
 * High in_progress time = blocked work that isn't moving.
 * Powered by GET /workspaces/{id}/stats/time-in-status
 */
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import InfoTooltip from './InfoTooltip'
import { useTimeInStatus } from '../hooks/useStats'

const STATUS_LABELS: Record<string, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

interface Props {
  workspaceId: string
  boardId?: string
}

export default function TimeInStatusChart({ workspaceId, boardId }: Props) {
  const { data = [], isLoading } = useTimeInStatus(workspaceId, boardId ? { board_id: boardId } : {})

  const chartData = data
    .filter(p => p.sample_count > 0)
    .map(p => ({
      status: STATUS_LABELS[p.status] ?? p.status,
      avg: p.avg_hours,
      median: p.median_hours,
      sample_count: p.sample_count,
    }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Time in Status
        </h4>
        <InfoTooltip
          text="How long tasks spend in each column on average before moving on. High 'In Progress' time signals blocked or abandoned work. Median is more reliable than average when outliers exist."
          width="w-72"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : chartData.length === 0 ? (
        <p className="text-gray-600 text-xs">Not enough transition data yet.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 8 }}>
              <CartesianGrid horizontal={false} stroke="#1f2937" />
              <XAxis
                type="number"
                tick={{ fill: '#6b7280', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtHours}
              />
              <YAxis
                type="category"
                dataKey="status"
                width={80}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }}
                formatter={(val, name) => [fmtHours(Number(val)), name === 'avg' ? 'Average' : 'Median']}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} formatter={(v) => v === 'avg' ? 'Average' : 'Median'} />
              <Bar dataKey="avg"    fill="#7c6af7" radius={[0, 4, 4, 0]} barSize={10} />
              <Bar dataKey="median" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={10} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-600 mt-2">
            Sample sizes: {data.map(p => `${STATUS_LABELS[p.status] ?? p.status} (${p.sample_count})`).join(' · ')}
          </p>
        </>
      )}
    </div>
  )
}
