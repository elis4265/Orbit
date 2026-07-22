import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useVelocity } from '../hooks/useEstimation'

export default function VelocityChart({ projectId }: { projectId: string }) {
  const { data, isLoading } = useVelocity(projectId)

  if (isLoading) return <p className="text-sm text-gray-500">Loading velocity…</p>
  if (!data || data.sprints.length === 0) {
    return <p className="text-sm text-gray-500">No closed sprints yet — velocity appears once you complete a sprint.</p>
  }

  const chartData = data.sprints.map((s) => ({ name: s.name, Committed: s.committed, Completed: s.completed }))

  return (
    <div>
      <div className="mb-3 flex items-center gap-6 text-xs">
        <span className="text-gray-400">Rolling avg (last 3): <strong className="text-gray-200">{data.rolling_average}</strong> pts</span>
        <span className="text-gray-400">Suggested capacity: <strong className="text-brand">{data.suggested_capacity}</strong> pts</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Committed" fill="#4b5563" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Completed" fill="#7c6af7" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="Completed" stroke="#a78bfa" strokeWidth={2} dot={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
