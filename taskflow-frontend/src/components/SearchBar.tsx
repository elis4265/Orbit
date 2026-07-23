import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useGlobalSearch } from '../hooks/useSearch'
import type { TaskSearchResult } from '../types'

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

const CATEGORY_COLOR: Record<string, string> = {
  unstarted: 'bg-gray-700 text-gray-300',
  started: 'bg-brand/20 text-brand',
  completed: 'bg-green-900/60 text-green-300',
  cancelled: 'bg-gray-800 text-gray-500',
}

const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-gray-700 text-gray-300',
  in_progress: 'bg-blue-900 text-blue-300',
  in_review: 'bg-yellow-900 text-yellow-300',
  done: 'bg-green-900 text-green-300',
}

interface SearchBarProps {
  /** (projectId, taskId) — projectId lets the caller jump across projects. */
  onSelectTask: (projectId: string, taskId: string) => void
}

export default function SearchBar({ onSelectTask }: SearchBarProps) {
  const [raw, setRaw] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: results = [], isFetching } = useGlobalSearch(query)

  // Debounce raw input → query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(raw.trim()), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [raw])

  // Open dropdown when results arrive for a non-empty query
  useEffect(() => {
    if (query.length >= 2) setOpen(true)
  }, [query, results])

  // Outside-click closes dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleSelect(task: TaskSearchResult) {
    onSelectTask(task.project_id ?? '', task.id)
    setOpen(false)
    setRaw('')
    setQuery('')
  }

  function handleClear() {
    setRaw('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setRaw(''); setQuery('') }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 w-56 focus-within:border-brand transition-colors">
        <Search size={13} className="text-gray-500 shrink-0" />
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={() => { if (query.length >= 2) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder="Search tasks…"
          className="bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none w-full"
          aria-label="Search tasks"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
        {raw && (
          <button onClick={handleClear} className="text-gray-600 hover:text-gray-400 shrink-0" aria-label="Clear search">
            <X size={12} />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div
          role="listbox"
          // max-w keeps the panel inside the viewport on phones; no-op at desktop widths.
          className="absolute top-full mt-1 left-0 w-80 max-w-[calc(100vw-2rem)] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50"
        >
          {isFetching && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-500">Searching…</p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-500">No results for "{query}"</p>
          )}
          {results.map((task) => (
            <button
              key={task.id}
              role="option"
              aria-selected={false}
              onClick={() => handleSelect(task)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors flex items-center gap-3 border-b border-gray-800 last:border-0"
            >
              <span className="text-[11px] font-bold text-gray-400 shrink-0 font-mono">
                {task.project_key}-{task.sequence_number}
              </span>
              <span className="text-sm text-gray-200 truncate flex-1">{task.title}</span>
              {/* HW-30: global search spans projects, so the API resolves the custom status;
                  the fixed `status` enum is stale in guided/enforced projects. */}
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                task.custom_status_name
                  ? CATEGORY_COLOR[task.custom_status_category ?? ''] ?? 'bg-gray-700 text-gray-300'
                  : STATUS_COLOR[task.status] ?? 'bg-gray-700 text-gray-300'}`}>
                {task.custom_status_name ?? STATUS_LABEL[task.status] ?? task.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
