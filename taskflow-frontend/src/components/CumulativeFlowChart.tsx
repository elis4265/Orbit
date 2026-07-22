/**
 * Cumulative Flow Diagram — shows how many tasks sit in each status per day.
 * A widening band at a given status = work accumulating there = bottleneck.
 * Powered by GET /workspaces/{id}/stats/cfd
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import InfoTooltip from './InfoTooltip'
import { useProjectCFD } from '../hooks/useStats'

const STATUS_COLORS = {
  todo:        '#6b7280',
  in_progress: '#7c6af7',
  done:        '#22c55e',
}

const STATUS_LABELS: Record<string, string> = {
  todo:        'To Do',
  in_progress: 'In Progress',
  done:        'Done',
}

interface Props {
  workspaceId: string
  boardId?: string
  dateFrom?: string
  dateTo?: string
}

export default function CumulativeFlowChart({ workspaceId, boardId, dateFrom, dateTo }: Props) {
  const { data = [], isLoading } = useProjectCFD(workspaceId, {
    ...(boardId ? { board_id: boardId } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  })

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Cumulative Flow
        </h4>
        <InfoTooltip
          text="Shows how many tasks are in each status per day. A widening band at any status signals work accumulating there — the classic sign of a bottleneck. The 'Done' band should grow steadily."
          width="w-72"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : data.length === 0 ? (
        <p className="text-gray-600 text-xs">No data for selected range.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ left: 0, right: 8 }}>
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
            <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} formatter={(val) => STATUS_LABELS[val] ?? val} />
            {/* Render done first so it's on the bottom of the stack */}
            <Area type="monotone" dataKey="done"        stackId="a" fill={STATUS_COLORS.done}        stroke={STATUS_COLORS.done}        fillOpacity={0.7} name="done" />
            <Area type="monotone" dataKey="in_progress" stackId="a" fill={STATUS_COLORS.in_progress} stroke={STATUS_COLORS.in_progress} fillOpacity={0.7} name="in_progress" />
            <Area type="monotone" dataKey="todo"        stackId="a" fill={STATUS_COLORS.todo}        stroke={STATUS_COLORS.todo}        fillOpacity={0.7} name="todo" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
