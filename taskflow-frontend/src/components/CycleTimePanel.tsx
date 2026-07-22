/**
 * Cycle Time / Lead Time panel.
 *
 * Lead time  = task created → first transition to 'done'
 * Cycle time = first transition to 'in_progress' → first transition to 'done'
 *
 * Displayed as P50/P85/P95 percentile cards + a scatter plot of completed tasks.
 * P85 is the common SLA target: "85% of tasks complete within X days."
 *
 * Powered by GET /workspaces/{id}/stats/cycle-time
 */
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import InfoTooltip from './InfoTooltip'
import { useCycleTime } from '../hooks/useStats'
import type { CycleTimePercentiles } from '../types'

function PercentileCard({ label, data }: { label: string; data: CycleTimePercentiles | null }) {
  if (!data) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
        <p className="text-xs text-gray-600">No completions in range.</p>
      </div>
    )
  }
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {([['P50', data.p50], ['P85', data.p85], ['P95', data.p95]] as [string, number][]).map(([p, v]) => (
          <div key={p} className="text-center">
            <div className={`text-lg font-bold ${p === 'P85' ? 'text-brand' : 'text-gray-200'}`}>{v}d</div>
            <div className="text-[10px] text-gray-500">{p}{p === 'P85' ? ' (SLA)' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface Props {
  workspaceId: string
  boardId?: string
  dateFrom?: string
  dateTo?: string
}

export default function CycleTimePanel({ workspaceId, boardId, dateFrom, dateTo }: Props) {
  const { data, isLoading } = useCycleTime(workspaceId, {
    ...(boardId ? { board_id: boardId } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  })

  const scatterLead = (data?.scatter ?? []).map(p => ({ x: p.date, y: p.lead_days }))
  const scatterCycle = (data?.scatter ?? []).filter(p => p.cycle_days != null).map(p => ({ x: p.date, y: p.cycle_days! }))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-1.5">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Cycle Time &amp; Lead Time
        </h4>
        <InfoTooltip
          text="Lead time: from task creation to done. Cycle time: from first 'In Progress' to done. P85 is the target SLA — 85% of tasks complete within that many days. Lower is better."
          width="w-80"
        />
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PercentileCard label="Lead Time" data={data?.lead_time ?? null} />
            <PercentileCard label="Cycle Time" data={data?.cycle_time ?? null} />
          </div>

          {scatterLead.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 mb-2 uppercase tracking-wide">Scatter — completed tasks</p>
              <ResponsiveContainer width="100%" height={160}>
                <ScatterChart margin={{ left: 0, right: 8 }}>
                  <CartesianGrid stroke="#1f2937" />
                  <XAxis
                    dataKey="x"
                    type="category"
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    dataKey="y"
                    name="Days"
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: 'days', angle: -90, position: 'insideLeft', fill: '#4b5563', fontSize: 10 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb', fontSize: 11 }}
                    formatter={(val) => [`${val}d`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                  <Scatter name="Lead time"  data={scatterLead}  fill="#7c6af7" opacity={0.75} />
                  <Scatter name="Cycle time" data={scatterCycle} fill="#22c55e" opacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
