import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { errorDetail } from '../lib/apiError'
import type { Project } from '../types'

interface Props {
  projects: Project[]
  activeId: string
  onSelect: (id: string) => void
  onCreate: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** When provided, the "New project" button opens the full create dialog instead of the inline name field. */
  onRequestCreate?: () => void
  /** Rename/delete are admin-only server-side — render their controls only when true. */
  canManage: boolean
  /** Project creation is superuser-only server-side (HW-37) — render "New project" only when true. */
  canCreate: boolean
}

export default function ProjectSelector({ projects, activeId, onSelect, onCreate, onRename, onDelete, onRequestCreate, canManage, canCreate }: Props) {
  const [open, setOpen] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameName, setRenameName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // REQ-169-6: a server rejection (e.g. role revoked mid-session) surfaces here.
  const [actionError, setActionError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const safeList = Array.isArray(projects) ? projects : []
  const active = safeList.find((p) => p.id === activeId)

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowInput(false)
        setName('')
        setRenaming(false)
        setConfirmDelete(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showInput) { setShowInput(false); setName('') }
        else if (renaming) setRenaming(false)
        else { setOpen(false); setConfirmDelete(false) }
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, showInput, renaming])

  async function handleCreate() {
    if (!name.trim()) return
    await onCreate(name.trim())
    setName('')
    setShowInput(false)
    setOpen(false)
  }

  function startRename() {
    setRenameName(active?.name ?? '')
    setRenaming(true)
  }

  async function handleRename() {
    if (!renameName.trim()) return
    try {
      await onRename(activeId, renameName.trim())
      setRenaming(false)
      setOpen(false)
      setActionError('')
    } catch (err) {
      setActionError(errorDetail(err, 'Could not rename the project.'))
      setRenaming(false)
    }
  }

  function cancelRename() {
    setRenaming(false)
  }

  async function handleDelete() {
    try {
      await onDelete(activeId)
      setConfirmDelete(false)
      setOpen(false)
      setActionError('')
    } catch (err) {
      setActionError(errorDetail(err, 'Could not delete the project.'))
      setConfirmDelete(false)
    }
  }

  return (
    <div className="relative min-w-0" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-1.5 text-sm text-gray-300 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        <span className="truncate">{active?.name ?? 'No project'}</span>
        <ChevronDown size={14} className="shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-max max-w-[calc(100vw_-_1.5rem)] md:max-w-none bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          {safeList.map((p) => (
            <div key={p.id} className="flex items-center">
              <button
                onClick={() => { onSelect(p.id); setOpen(false) }}
                className={`flex-1 text-left px-4 py-2.5 text-sm hover:bg-gray-700 transition-colors ${
                  p.id === activeId ? 'text-brand font-medium' : 'text-gray-300'
                }`}
              >
                {p.id === activeId && renaming ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-gray-700 border border-brand rounded px-1 py-0.5 text-sm text-gray-100 focus:outline-none"
                  />
                ) : (
                  p.name
                )}
              </button>
              {p.id === activeId && !renaming && canManage && (
                <>
                  {confirmDelete ? (
                    <div className="flex items-center gap-1 px-1" onClick={(e) => e.stopPropagation()}>
                      <span className="text-xs text-red-400">Delete?</span>
                      <button
                        onClick={handleDelete}
                        className="text-xs text-red-400 hover:text-red-300 font-medium px-1 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename() }}
                        aria-label={`Rename project ${p.id}`}
                        className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                        aria-label={`Delete project ${p.id}`}
                        className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
          {actionError && (
            <p className="px-4 py-2 text-xs text-red-400 border-t border-gray-700">{actionError}</p>
          )}
          {canCreate && (
          <div className="border-t border-gray-700 p-2">
            {showInput ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  placeholder="Project name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand"
                />
                <button
                  onClick={handleCreate}
                  className="text-xs bg-brand hover:bg-brand-hover text-white px-2 py-1 rounded-lg transition-colors"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (onRequestCreate) { setOpen(false); onRequestCreate() }
                  else setShowInput(true)
                }}
                className="w-full flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Plus size={12} /> New project
              </button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
