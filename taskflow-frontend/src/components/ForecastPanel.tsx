import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { format } from 'date-fns'
import { useForecast } from '../hooks/useEstimation'

function fmt(d: string | null) {
  return d ? format(new Date(d), 'MMM d, yyyy') : '—'
}

export default function ForecastPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useForecast(projectId)

  if (isLoading) return <p className="text-sm text-gray-500">Loading forecast…</p>
  if (!data) return null

  if (!data.enough_data) {
    return (
      <p className="text-sm text-gray-500">
        Not enough history yet — a delivery forecast needs at least ~2 weeks of completed work. Keep shipping and it'll appear here.
      </p>
    )
  }

  const chartData = data.throughput.map((v, i) => ({ name: `w${i + 1}`, done: v }))

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-300">
        <strong className="text-gray-100">{data.remaining}</strong> items remaining, forecast from throughput:
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '50% by', date: data.p50_date, wk: data.p50_weeks, tone: 'text-gray-300' },
          { label: '85% by', date: data.p85_date, wk: data.p85_weeks, tone: 'text-brand' },
          { label: '95% by', date: data.p95_date, wk: data.p95_weeks, tone: 'text-amber-400' },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-gray-800 bg-gray-950/50 p-3">
            <p className="text-[11px] text-gray-500">{c.label}</p>
            <p className={`text-sm font-semibold ${c.tone}`}>{fmt(c.date)}</p>
            <p className="text-[11px] text-gray-600">~{c.wk} weeks</p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1 text-xs text-gray-500">Weekly throughput (completed items)</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
            <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="done" fill="#7c6af7" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-gray-600">Probabilistic (Monte Carlo over recent throughput). Ranges, not promises.</p>
    </div>
  )
}
