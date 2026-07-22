import { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { useProjectStats } from '../hooks/useStats'
import InfoTooltip from './InfoTooltip'
import CumulativeFlowChart from './CumulativeFlowChart'
import TimeInStatusChart from './TimeInStatusChart'
import CycleTimePanel from './CycleTimePanel'
import type { Board } from '../types'

const STATUS_COLORS: Record<string, string> = {
  todo:        '#6b7280',
  in_progress: '#7c6af7',
  done:        '#22c55e',
}

const PRIORITY_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6b7280']

type Range = '7' | '30' | '90'

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function rangeToParams(range: Range) {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - Number(range))
  return { date_from: toISODate(from), date_to: toISODate(to) }
}

const AGE_COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444']

interface Props {
  workspaceId: string
  boards?: Board[]
}

export default function StatsPanel({ workspaceId, boards = [] }: Props) {
  const [range, setRange] = useState<Range>('30')
  const [boardId, setBoardId] = useState<string>('')

  const dateParams = rangeToParams(range)
  const { data: stats, isLoading } = useProjectStats(workspaceId, {
    ...(boardId ? { board_id: boardId } : {}),
    ...dateParams,
  })

  const statusData = (stats?.by_status ?? []).map(s => ({
    name: s.status.replace('_', ' '),
    value: s.count,
    fill: STATUS_COLORS[s.status] ?? '#7c6af7',
  }))

  const priorityData = (stats?.by_priority ?? []).map((p, i) => ({
    name: p.priority_name || 'None',
    count: p.count,
    fill: PRIORITY_COLORS[i % PRIORITY_COLORS.length] ?? '#6b7280',
  }))

  const assigneeData = (stats?.by_assignee ?? []).map(a => ({
    name: a.name.length > 14 ? a.name.slice(0, 12) + '…' : a.name,
    count: a.count,
  }))

  const ageData = (stats?.by_age ?? []).map((b, i) => ({
    label: b.label,
    count: b.count,
    fill: AGE_COLORS[i] ?? '#6b7280',
  }))

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1 border border-gray-800">
          {(['7', '30', '90'] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                range === r ? 'bg-brand text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Last {r}d
            </button>
          ))}
        </div>

        {boards.length > 0 && (
          <select
            value={boardId}
            onChange={e => setBoardId(e.target.value)}
            className="bg-gray-900 border border-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5"
          >
            <option value="">All boards</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          {/* Summary pills — row 1: created / completed / rate */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-100">{stats?.created_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Created in range</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{stats?.completed_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-1">Completed in range</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand">{stats?.completion_rate ?? 0}%</div>
              <div className="text-xs text-gray-500 mt-1">Completion rate</div>
            </div>
            {/* Overdue card */}
            <div
              className={`border rounded-xl p-4 text-center ${
                (stats?.overdue_count ?? 0) > 0
                  ? 'bg-red-950/40 border-red-900/60'
                  : 'bg-gray-900 border-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                {(stats?.overdue_count ?? 0) > 0 && (
                  <AlertTriangle size={14} className="text-red-400" />
                )}
                <div className={`text-2xl font-bold ${(stats?.overdue_count ?? 0) > 0 ? 'text-red-400' : 'text-gray-100'}`}>
                  {stats?.overdue_count ?? 0}
                </div>
              </div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="text-xs text-gray-500">Overdue</span>
                <InfoTooltip text="Tasks past their due date that haven't been completed. These need immediate attention." />
              </div>
            </div>
          </div>

          {/* Charts grid — row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status donut */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">By Status</h4>
                <InfoTooltip text="Current snapshot of how many tasks are in each column. Not date-filtered — reflects the live state of the board." />
              </div>
              {statusData.length === 0 ? (
                <p className="text-gray-600 text-xs">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {statusData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }}
                      formatter={(val, name) => [val ?? 0, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="flex flex-wrap gap-3 mt-2">
                {statusData.map(s => (
                  <div key={s.name} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.fill }} />
                    <span className="text-xs text-gray-400 capitalize">{s.name} ({s.value})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Priority bar */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">By Priority</h4>
                <InfoTooltip text="Current open tasks grouped by priority (P1 = critical, P5 = lowest). Not date-filtered. High P1/P2 counts signal a backlog dominated by urgent work." />
              </div>
              {priorityData.length === 0 ? (
                <p className="text-gray-600 text-xs">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={priorityData} layout="vertical" margin={{ left: 4, right: 8 }}>
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={30} tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <CartesianGrid horizontal={false} stroke="#1f2937" />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {priorityData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Throughput line — full width */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:col-span-2">
              <div className="flex items-center gap-1.5 mb-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Throughput (created vs completed)</h4>
                <InfoTooltip text="Daily count of tasks created and tasks completed over the selected period. When the green 'completed' line consistently stays below purple 'created', work is accumulating faster than it's being finished." />
              </div>
              {(stats?.throughput ?? []).length === 0 ? (
                <p className="text-gray-600 text-xs">No data</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={stats?.throughput ?? []} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid stroke="#1f2937" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }} />
                    <Line type="monotone" dataKey="created"   stroke="#7c6af7" strokeWidth={2} dot={false} name="Created" />
                    <Line type="monotone" dataKey="completed" stroke="#22c55e" strokeWidth={2} dot={false} name="Completed" />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-brand inline-block" /><span className="text-xs text-gray-400">Created</span></div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-400 inline-block" /><span className="text-xs text-gray-400">Completed</span></div>
              </div>
            </div>

            {/* Assignee bar — full width when present */}
            {assigneeData.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 lg:col-span-2">
                <div className="flex items-center gap-1.5 mb-4">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Open Tasks by Assignee (top 10)</h4>
                  <InfoTooltip text="How many open (not done) tasks each person currently owns. Shows workload distribution. A person with a large bar may be overloaded." />
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={assigneeData} layout="vertical" margin={{ left: 4, right: 8 }}>
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <CartesianGrid horizontal={false} stroke="#1f2937" />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }} />
                    <Bar dataKey="count" fill="#7c6af7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Issue Age Distribution */}
          {ageData.some(b => b.count > 0) && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Issue Age Distribution</h4>
                <InfoTooltip text="How long open (not done) tasks have been sitting. Colour goes green → red with age. Tall bars in 30-60d or 60+d buckets signal stalled work that likely needs triage or pruning." />
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={ageData} margin={{ left: 4, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#e5e7eb' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {ageData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* CFD — full width */}
          <CumulativeFlowChart
            workspaceId={workspaceId}
            boardId={boardId || undefined}
            dateFrom={dateParams.date_from}
            dateTo={dateParams.date_to}
          />

          {/* Time in Status + Cycle Time — side by side on large screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TimeInStatusChart workspaceId={workspaceId} boardId={boardId || undefined} />
            <CycleTimePanel
              workspaceId={workspaceId}
              boardId={boardId || undefined}
              dateFrom={dateParams.date_from}
              dateTo={dateParams.date_to}
            />
          </div>
        </>
      )}
    </div>
  )
}
