import { useState, useRef, useEffect } from 'react'
import { Pencil, Trash2, Plus, Layers, Zap } from 'lucide-react'
import { errorDetail } from '../lib/apiError'
import type { Board } from '../types'

export type SpecialTab = 'backlog' | 'active-sprint'

interface Props {
  boards: Board[]
  activeId: string | null
  activeSpecialTab: SpecialTab | null
  hasActiveSprint: boolean
  onSelect: (id: string) => void
  onSelectSpecial: (tab: SpecialTab) => void
  onCreate: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Board create/rename/delete are admin-only server-side — render their controls only when true. */
  canManage: boolean
}

export default function BoardTabs({
  boards, activeId, activeSpecialTab, hasActiveSprint,
  onSelect, onSelectSpecial, onCreate, onRename, onDelete, canManage,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [showInput, setShowInput] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // REQ-169-6: a server rejection (e.g. role revoked mid-session) surfaces here.
  const [actionError, setActionError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showInput) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setShowInput(false)
        setNewName('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showInput])

  function startRename(board: Board) {
    setRenameName(board.name)
    setRenamingId(board.id)
  }

  async function handleRename(id: string) {
    if (!renameName.trim()) return
    try {
      await onRename(id, renameName.trim())
      setActionError('')
    } catch (err) {
      setActionError(errorDetail(err, 'Could not rename the board.'))
    }
    setRenamingId(null)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await onCreate(newName.trim())
      setNewName('')
      setShowInput(false)
      setActionError('')
    } catch (err) {
      setActionError(errorDetail(err, 'Could not create the board.'))
    }
  }

  async function handleDelete(id: string) {
    try {
      await onDelete(id)
      setActionError('')
    } catch (err) {
      setActionError(errorDetail(err, 'Could not delete the board.'))
    }
    setConfirmDeleteId(null)
  }

  function specialTabClass(tab: SpecialTab) {
    return `flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap max-md:shrink-0 ${
      activeSpecialTab === tab
        ? 'border-brand text-brand font-medium'
        : 'border-transparent text-gray-400 hover:text-gray-200'
    }`
  }

  return (
    // Below md the strip scrolls horizontally instead of wrapping/squashing board names;
    // `md:overflow-x-visible` keeps the desktop strip byte-identical to before.
    <div
      ref={rootRef}
      data-testid="board-tabs"
      className="flex items-center gap-1 px-6 border-b border-gray-800 bg-gray-900 overflow-x-auto md:overflow-x-visible max-md:flex-nowrap"
      role="tablist"
    >
      {/* Special tabs */}
      <button
        role="tab"
        aria-selected={activeSpecialTab === 'backlog'}
        aria-label="Backlog"
        onClick={() => onSelectSpecial('backlog')}
        className={specialTabClass('backlog')}
      >
        <Layers size={13} />
        Backlog
      </button>

      {hasActiveSprint && (
        <button
          role="tab"
          aria-selected={activeSpecialTab === 'active-sprint'}
          aria-label="Active Sprint"
          onClick={() => onSelectSpecial('active-sprint')}
          className={specialTabClass('active-sprint')}
        >
          <Zap size={13} />
          Active Sprint
        </button>
      )}

      {/* Divider */}
      <div className="h-4 w-px bg-gray-700 mx-1 max-md:shrink-0" />

      {/* Board tabs */}
      {boards.map((board) => (
        <div key={board.id} className="flex items-center max-md:shrink-0">
          {renamingId === board.id ? (
            <input
              autoFocus
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(board.id)
                if (e.key === 'Escape') setRenamingId(null)
              }}
              onBlur={() => setRenamingId(null)}
              className="bg-gray-700 border border-brand rounded px-2 py-1 text-sm text-gray-100 focus:outline-none w-32 max-md:shrink-0"
            />
          ) : (
            <button
              role="tab"
              aria-selected={board.id === activeId && activeSpecialTab === null}
              onClick={() => onSelect(board.id)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                board.id === activeId && activeSpecialTab === null
                  ? 'border-brand text-brand font-medium'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {board.name}
            </button>
          )}

          {board.id === activeId && activeSpecialTab === null && renamingId !== board.id && canManage && (
            <>
              {confirmDeleteId === board.id ? (
                <div className="flex items-center gap-1 px-1 max-md:shrink-0">
                  <span className="text-xs text-red-400 whitespace-nowrap">Delete?</span>
                  <button
                    onClick={() => handleDelete(board.id)}
                    className="text-xs text-red-400 hover:text-red-300 font-medium px-1 transition-colors"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <>
                  <button
                    aria-label={`Rename board ${board.id}`}
                    onClick={() => startRename(board)}
                    className="p-1 text-gray-600 hover:text-gray-300 transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    aria-label={`Delete board ${board.id}`}
                    onClick={() => setConfirmDeleteId(board.id)}
                    className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      ))}

      {canManage && (
      <div className="ml-2 flex items-center max-md:shrink-0">
        {showInput ? (
          <div className="flex items-center gap-1 max-md:shrink-0">
            <input
              autoFocus
              type="text"
              placeholder="Board name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') { setShowInput(false); setNewName('') }
              }}
              className="bg-gray-700 border border-gray-600 rounded-lg px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand w-28"
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
            onClick={() => setShowInput(true)}
            aria-label="New board"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 px-2 py-1 rounded transition-colors whitespace-nowrap"
          >
            <Plus size={12} />
            New board
          </button>
        )}
      </div>
      )}
      {actionError && (
        <span className="text-xs text-red-400 px-2 whitespace-nowrap max-md:shrink-0">{actionError}</span>
      )}
    </div>
  )
}
