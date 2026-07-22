import { useEffect, useState } from 'react'
import { usePlanningPoker } from '../hooks/usePlanningPoker'

const CARDS = [1, 2, 3, 5, 8, 13, 21]

/** Inline real-time planning poker for a task. onPick sets the agreed estimate. */
export default function PlanningPoker({ taskId, onPick }: { taskId: string; onPick: (v: number) => void }) {
  const { state, start, vote, reveal, reset, close } = usePlanningPoker(taskId)
  const [myVote, setMyVote] = useState<number | null>(null)

  // Clear my pick whenever the round restarts (new session / re-vote / task switch).
  useEffect(() => { if (!state.revealed) setMyVote(null) }, [state.active, state.revealed, taskId])

  function castVote(n: number) { setMyVote(n); vote(n) }

  if (!state.active) {
    return (
      <button onClick={start} className="mt-2 text-xs text-brand hover:brightness-110 transition-colors">
        Estimate together →
      </button>
    )
  }

  const values = Object.values(state.votes)
  const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null

  return (
    <div className="mt-2 rounded-lg border border-brand/30 bg-gray-900/60 p-2.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-300">Planning poker</span>
        <button onClick={close} className="text-[11px] text-gray-500 hover:text-gray-300">close</button>
      </div>

      {!state.revealed ? (
        <>
          <div className="flex flex-wrap gap-1">
            {CARDS.map((n) => (
              <button
                key={n}
                onClick={() => castVote(n)}
                className={`w-7 h-7 rounded-md text-xs border transition-colors ${
                  myVote === n
                    ? 'border-brand bg-brand/20 text-brand'
                    : 'border-gray-700 text-gray-300 hover:border-brand hover:text-brand'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-500">
              {Math.max(state.voters.length, myVote != null ? 1 : 0)} voted{myVote != null ? ` · you: ${myVote}` : ''}
            </span>
            <button onClick={reveal} className="text-xs bg-brand text-white rounded-md px-2 py-1 hover:brightness-110 transition-all">Reveal</button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {Object.entries(state.votes).map(([uid, v]) => (
              <span key={uid} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300">{v}</span>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">avg ~{avg} — pick the agreed value:</p>
          <div className="flex flex-wrap gap-1">
            {CARDS.map((n) => (
              <button key={n} onClick={() => { onPick(n); close() }} className="w-7 h-7 rounded-md text-xs border border-gray-700 text-gray-300 hover:border-brand hover:text-brand transition-colors">{n}</button>
            ))}
          </div>
          <button onClick={reset} className="self-start text-[11px] text-gray-500 hover:text-gray-300">re-vote</button>
        </>
      )}
    </div>
  )
}
