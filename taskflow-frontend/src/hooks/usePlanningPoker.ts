import { useEffect, useState } from 'react'
import { sendSocket, subscribeSocket } from '../lib/projectSocketBus'

export interface PokerState {
  active: boolean
  voters: string[]                  // user_ids that have voted (pre-reveal)
  revealed: boolean
  votes: Record<string, number>     // user_id -> value, after reveal
}

const EMPTY: PokerState = { active: false, voters: [], revealed: false, votes: {} }

/** Real-time planning poker for one task, over the shared project socket. */
export function usePlanningPoker(taskId: string) {
  const [state, setState] = useState<PokerState>(EMPTY)

  useEffect(() => {
    setState(EMPTY)
    return subscribeSocket((msg) => {
      if (msg.task_id !== taskId) return
      switch (msg.type) {
        case 'poker.started':
          setState({ active: true, voters: [], revealed: false, votes: {} })
          break
        case 'poker.voted':
          setState((s) => ({ ...s, active: true, voters: (msg.voters as string[]) ?? s.voters }))
          break
        case 'poker.revealed':
          setState((s) => ({ ...s, active: true, revealed: true, votes: (msg.votes as Record<string, number>) ?? {} }))
          break
        case 'poker.reset':
          setState({ active: true, voters: [], revealed: false, votes: {} })
          break
      }
    })
  }, [taskId])

  const start = () => { sendSocket({ type: 'poker.start', task_id: taskId }); setState({ active: true, voters: [], revealed: false, votes: {} }) }
  const vote = (value: number) => sendSocket({ type: 'poker.vote', task_id: taskId, value })
  const reveal = () => sendSocket({ type: 'poker.reveal', task_id: taskId })
  const reset = () => sendSocket({ type: 'poker.reset', task_id: taskId })
  const close = () => setState(EMPTY)

  return { state, start, vote, reveal, reset, close }
}
