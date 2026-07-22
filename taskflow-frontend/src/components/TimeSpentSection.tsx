import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useWorklogs, useLogWork, useDeleteWorklog } from '../hooks/useWorklogs'
import { parseDuration, formatMinutes } from '../lib/duration'

// REQ-147 — log hours on a task; independent of the project's estimation method.
export default function TimeSpentSection({ projectId, taskId, currentUserId }: {
  projectId: string
  taskId: string
  currentUserId: string
}) {
  const { data } = useWorklogs(projectId, taskId)
  const logWork = useLogWork(projectId, taskId)
  const deleteWorklog = useDeleteWorklog(projectId, taskId)
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleLog() {
    const minutes = parseDuration(input)
    if (minutes === null) {
      setError('Use formats like 2h, 30m, 1h 30m.')
      return
    }
    setError(null)
    await logWork.mutateAsync({ minutes, note: note.trim() || undefined })
    setInput('')
    setNote('')
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">
        Time spent{data && data.total_minutes > 0 && (
          <span className="ml-1.5 text-gray-300 font-semibold">{formatMinutes(data.total_minutes)}</span>
        )}
      </p>
      {/* Stacked so the note input never forces the fixed-width info rail to
          overflow — duration + Log share a row, note gets its own full width. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleLog() }}
            placeholder="1h 30m"
            aria-label="Log time"
            className="w-20 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand placeholder-gray-600"
          />
          <button
            onClick={handleLog}
            disabled={!input.trim() || logWork.isPending}
            className="ml-auto px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-medium disabled:opacity-40 hover:brightness-110 transition-all"
          >
            Log
          </button>
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleLog() }}
          placeholder="note (optional)"
          aria-label="Work note"
          className="w-full min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand placeholder-gray-600"
        />
      </div>
      {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
      {data && data.entries.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {data.entries.map((w) => (
            <li key={w.id} className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className="text-gray-300 font-medium w-14 shrink-0">{formatMinutes(w.minutes)}</span>
              <span className="shrink-0">{new Date(w.spent_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <span className="truncate flex-1">{w.note ?? ''}</span>
              {w.user_id === currentUserId && (
                <button
                  onClick={() => deleteWorklog.mutate(w.id)}
                  className="text-gray-700 hover:text-red-400 transition-colors shrink-0"
                  aria-label="Delete work log"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
