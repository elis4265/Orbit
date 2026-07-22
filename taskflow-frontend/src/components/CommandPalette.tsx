import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'
import { filterCommands, type CommandItem } from '../lib/commandPalette'
import { useSearch } from '../hooks/useSearch'

export interface Command extends CommandItem {
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  commands: Command[]
  /** Active project id — enables live task search (≥2 chars). */
  searchProjectId?: string
  onOpenTask: (taskId: string) => void
}

export default function CommandPalette({ open, onClose, commands, searchProjectId, onOpenTask }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset every time the palette opens.
  useEffect(() => {
    if (open) { setQuery(''); setSelected(0); inputRef.current?.focus() }
  }, [open])

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  const { data: taskResults = [] } = useSearch(searchProjectId ?? '', query)
  const showTasks = !!searchProjectId && query.trim().length >= 2

  // Flat, ordered list of selectable rows (commands first, then task results).
  const rows = useMemo(() => {
    const cmdRows = filtered.map((c) => ({ kind: 'command' as const, cmd: c }))
    const taskRows = showTasks
      ? taskResults.map((t) => ({ kind: 'task' as const, task: t }))
      : []
    return [...cmdRows, ...taskRows]
  }, [filtered, showTasks, taskResults])

  // Keep selection in range as the list changes.
  useEffect(() => { setSelected((s) => Math.min(s, Math.max(0, rows.length - 1))) }, [rows.length])

  function runRow(i: number) {
    const row = rows[i]
    if (!row) return
    onClose()
    if (row.kind === 'command') row.cmd.run()
    else onOpenTask(row.task.id)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, rows.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); runRow(selected); return }
  }

  // Scroll the active row into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${selected}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  if (!open) return null

  // Group label boundaries (commands are pre-grouped by filter order; we show a
  // label when the group changes vs the previous row).
  let prevGroup = ''
  let idx = -1

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 backdrop-blur-sm pt-[15vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
          <Search size={16} className="text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search tasks…"
            className="flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
          />
          <kbd className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">No matches.</p>
          )}

          {rows.map((row) => {
            idx++
            const i = idx
            const isSel = i === selected
            const group = row.kind === 'command' ? row.cmd.group : 'Tasks'
            const label = group !== prevGroup ? group : null
            prevGroup = group
            return (
              <div key={row.kind === 'command' ? row.cmd.id : `t-${row.task.id}`}>
                {label && (
                  <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">{label}</p>
                )}
                <button
                  data-row={i}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => runRow(i)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors ${
                    isSel ? 'bg-brand/20 text-gray-100' : 'text-gray-300 hover:bg-gray-800/60'
                  }`}
                >
                  {row.kind === 'command' ? (
                    <span className="truncate">{row.cmd.title}</span>
                  ) : (
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-gray-500 shrink-0">{row.task.project_key}-{row.task.sequence_number}</span>
                      <span className="truncate">{row.task.title}</span>
                    </span>
                  )}
                  {isSel && <CornerDownLeft size={13} className="text-gray-500 shrink-0" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
