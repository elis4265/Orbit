import { useState, useRef, useEffect } from 'react'
import { Tag as TagIcon, Plus, Check } from 'lucide-react'
import type { Tag } from '../types'
import TagPill from './TagPill'

const DEFAULT_COLORS = [
  '#7c6af7', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6', '#a855f7',
]

interface TagPickerProps {
  availableTags: Tag[]
  selectedTagIds: string[]
  onApply: (tagId: string) => void
  onRemove: (tagId: string) => void
  onCreateTag: (name: string, color: string) => Promise<void>
}

export default function TagPicker({
  availableTags,
  selectedTagIds,
  onApply,
  onRemove,
  onCreateTag,
}: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0])
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const filtered = availableTags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  // Reset highlight when filter changes
  useEffect(() => { setHighlightIdx(0) }, [search])

  // Scroll highlighted item into view
  useEffect(() => {
    const item = listRef.current?.children[highlightIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (creating) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      const tag = filtered[highlightIdx]
      if (tag) {
        if (selectedTagIds.includes(tag.id)) onRemove(tag.id)
        else onApply(tag.id)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onCreateTag(trimmed, newColor)
      setNewName('')
      setCreating(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded border border-gray-600 hover:border-gray-400 transition-colors"
      >
        <TagIcon size={12} />
        Tags
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-64 max-w-[calc(100vw-2rem)] bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-700">
            <input
              autoFocus
              type="text"
              placeholder="Search tags…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-gray-700 text-sm text-white px-2 py-1 rounded outline-none placeholder-gray-400"
            />
          </div>

          <ul ref={listRef} className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-xs text-gray-500">No tags found</li>
            )}
            {filtered.map((tag, i) => {
              const selected = selectedTagIds.includes(tag.id)
              return (
                <li key={tag.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlightIdx(i)}
                    onClick={() => selected ? onRemove(tag.id) : onApply(tag.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                      i === highlightIdx ? 'bg-gray-700' : 'hover:bg-gray-700'
                    }`}
                  >
                    <TagPill tag={tag} />
                    {selected && <Check size={14} className="text-brand flex-shrink-0" />}
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-t border-gray-700 p-2">
            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1 text-xs text-brand hover:text-purple-300 w-full"
              >
                <Plus size={12} /> Create new tag
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Tag name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') { setCreating(false); setNewName('') }
                  }}
                  className="w-full bg-gray-700 text-sm text-white px-2 py-1 rounded outline-none placeholder-gray-400"
                />
                <div className="flex flex-wrap gap-1">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      className="w-5 h-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: newColor === c ? 'white' : 'transparent',
                      }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving || !newName.trim()}
                    onClick={handleCreate}
                    className="text-xs bg-brand text-white px-2 py-1 rounded disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCreating(false); setNewName('') }}
                    className="text-xs text-gray-400 hover:text-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
