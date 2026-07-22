// REQ-157 (DD-050) — selection indicator + YouTrack-style command dialog.
// Appears when tasks are selected; the dialog speaks the SmartFilterBar dialect.
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Terminal, Trash2, X } from 'lucide-react'
import { taskApi } from '../api/client'
import { parseBulkCommand, type BulkCommandContext } from '../lib/bulkCommand'

interface Props {
  projectId: string
  selectedIds: string[]
  context: BulkCommandContext
  /** Clear the whole selection */
  onClear: () => void
  /** Called with ids that were updated (caller drops them from the selection) */
  onApplied: (updatedIds: string[]) => void
  /** Optional quick actions (pre-REQ-157 bar behavior, preserved) */
  onQuickStatus?: (status: 'todo' | 'in_progress' | 'done') => void
  onDelete?: () => void
}

export default function BulkEditBar({ projectId, selectedIds, context, onClear, onApplied, onQuickStatus, onDelete }: Props) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [summary, setSummary] = useState('')
  const [apiError, setApiError] = useState('')

  const parsed = parseBulkCommand(command, context)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (dialogOpen) setDialogOpen(false)
        else onClear()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, onClear])

  const apply = useMutation({
    mutationFn: () => taskApi.bulkEdit(projectId, selectedIds, parsed.changes),
    onSuccess: (res) => {
      console.log('[BulkEdit] applied:', res.updated.length, 'errors:', res.errors.length)
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setSummary(
        res.errors.length
          ? `${res.updated.length} updated · ${res.errors.length} blocked: ${res.errors[0].error}`
          : `${res.updated.length} updated`
      )
      onApplied(res.updated)
      if (res.errors.length === 0) {
        setDialogOpen(false)
        setCommand('')
      }
    },
    onError: (err: unknown) => {
      console.error('[BulkEdit] failed:', err)
      const msg = (err as { response?: { data?: { error?: { message?: string }; detail?: string } } })
        ?.response?.data
      setApiError((msg?.error?.message ?? msg?.detail ?? 'Bulk edit failed.') as string)
    },
  })

  if (selectedIds.length === 0) return null

  return (
    <>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl px-4 py-2.5">
        <span className="text-sm text-gray-200 font-medium">{selectedIds.length} selected</span>
        {onQuickStatus && context.mode === 'open' && (
          <div className="flex items-center gap-1 pr-1 border-r border-gray-700">
            <button type="button" onClick={() => onQuickStatus('todo')} className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors">To Do</button>
            <button type="button" onClick={() => onQuickStatus('in_progress')} className="text-xs text-gray-400 hover:text-brand px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors">In Progress</button>
            <button type="button" onClick={() => onQuickStatus('done')} className="text-xs text-gray-400 hover:text-green-400 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors">Done</button>
          </div>
        )}
        <button
          type="button"
          onClick={() => { setDialogOpen(true); setSummary(''); setApiError('') }}
          className="flex items-center gap-1.5 bg-brand hover:bg-brand-hover text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
        >
          <Terminal size={13} /> Command…
        </button>
        {onDelete && (
          <button type="button" onClick={onDelete} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-gray-800 transition-colors">
            <Trash2 size={12} /> Delete
          </button>
        )}
        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X size={15} />
        </button>
        {summary && <span className="text-xs text-gray-400">{summary}</span>}
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 bg-black/60 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setDialogOpen(false) }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-5">
            <p className="text-sm text-gray-300 mb-3">
              Apply command to <strong className="text-gray-100">{selectedIds.length} task{selectedIds.length === 1 ? '' : 's'}</strong>
            </p>
            <form onSubmit={(e) => { e.preventDefault(); if (parsed.errors.length === 0) apply.mutate() }}>
              <input
                autoFocus
                type="text"
                placeholder='@status:done @assignee:me @tag:+backend'
                value={command}
                onChange={(e) => { setCommand(e.target.value); setSummary(''); setApiError('') }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand"
              />
              <div className="mt-3 min-h-[2rem]">
                {command.trim() && parsed.errors.length > 0 && (
                  <ul className="text-xs text-red-400 space-y-0.5">
                    {parsed.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                {parsed.errors.length === 0 && parsed.preview.length > 0 && (
                  <ul className="text-xs text-gray-400 space-y-0.5">
                    {parsed.preview.map((p, i) => <li key={i}>· {p}</li>)}
                  </ul>
                )}
                {apiError && <p className="text-xs text-red-400 mt-1">{apiError}</p>}
                {summary && <p className="text-xs text-gray-300 mt-1">{summary}</p>}
              </div>
              <div className="mt-3 flex justify-between items-center">
                <p className="text-[11px] text-gray-600">
                  @status @assignee @priority @sprint · @tag:+name / @tag:-name · quotes for spaces
                </p>
                <button
                  type="submit"
                  disabled={parsed.errors.length > 0 || !command.trim() || apply.isPending}
                  className="bg-brand hover:bg-brand-hover disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  {apply.isPending ? 'Applying…' : 'Apply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
