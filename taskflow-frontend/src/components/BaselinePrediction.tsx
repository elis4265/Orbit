import { useTaskPrediction } from '../hooks/useEstimation'

/** Local effort prediction for a task (Baseline method), from similar past tasks. */
export default function BaselinePrediction({ projectId, taskId }: { projectId: string; taskId: string }) {
  const { data, isLoading } = useTaskPrediction(projectId, taskId)

  if (isLoading || !data) return null
  if (!data.enough_data) {
    return <p className="mt-1 text-[11px] text-gray-600">Predicted effort appears once you have a few finished tasks to learn from.</p>
  }

  return (
    <div className="mt-1">
      {data.surprise && (
        <p className="mb-1 inline-flex items-center gap-1 rounded-md border border-amber-700/50 bg-amber-950/30 px-1.5 py-0.5 text-[11px] font-medium text-amber-400">
          ⚠ Overrunning — {data.elapsed_days}d in progress vs ~{data.predicted_days}d predicted
        </p>
      )}
      <p className="text-[11px] text-gray-400">
        Predicted effort <strong className="text-gray-200">~{data.predicted_days} days</strong>
        {data.neighbors.length > 0 && (
          <span className="text-gray-600"> · from {data.neighbors.length} similar task{data.neighbors.length > 1 ? 's' : ''}</span>
        )}
      </p>
      {data.neighbors.length > 0 && (
        <ul className="mt-0.5 space-y-0.5">
          {data.neighbors.map((n, i) => (
            <li key={i} className="text-[10px] text-gray-600 truncate" title={n.title}>
              · {n.title} <span className="text-gray-700">({n.days}d)</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-0.5 text-[10px] text-gray-700">Local estimate — a hint, not a target.</p>
    </div>
  )
}
