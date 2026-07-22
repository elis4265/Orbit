// REQ-156 — ⋯ overflow menu on the task modal: Clone task / Move to project…
// Jira and YouTrack both put these on the ticket's overflow menu (DD-049).
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Copy, FolderInput, Archive, ArchiveRestore, Link2, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { taskApi, projectTaskApi, shareLinkApi } from '../api/client'
import { useProjects } from '../hooks/useProjects'

interface Props {
  projectId: string
  taskId: string
  /** Called after a successful clone or move (the caller closes the modal). */
  onActionDone: () => void
  /** REQ-161: archive offered on done tasks, restore on archived ones */
  taskStatus?: string
  archivedAt?: string | null
  /** REQ-163: share links are admin-only */
  isAdmin?: boolean
}

type ApiErrorShape = { response?: { data?: { error?: { message?: string }; detail?: string } } }

function extractApiError(err: unknown, fallback: string): string {
  const data = (err as ApiErrorShape)?.response?.data
  const msg = data?.error?.message ?? data?.detail ?? fallback
  return typeof msg === 'string' ? msg : fallback
}

export default function TaskActionsMenu({ projectId, taskId, onActionDone, taskStatus, archivedAt, isAdmin = false }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')

  // REQ-163: share links (fetched only when the sharing pane is open)
  const { data: shareLinks = [] } = useQuery({
    queryKey: ['share-links', projectId, taskId],
    queryFn: () => shareLinkApi.list(projectId, taskId),
    enabled: sharing && isAdmin,
  })
  const createLink = useMutation({
    mutationFn: () => shareLinkApi.create(projectId, taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-links', projectId, taskId] }),
    onError: (err: unknown) => setError(extractApiError(err, 'Could not create link.')),
  })
  const revokeLink = useMutation({
    mutationFn: (linkId: string) => shareLinkApi.revoke(projectId, taskId, linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['share-links', projectId, taskId] }),
  })
  const activeLinks = shareLinks.filter((l) => !l.revoked)
  const ref = useRef<HTMLDivElement>(null)

  const { data: projects = [] } = useProjects()
  const targets = (Array.isArray(projects) ? projects : []).filter((p) => p.id !== projectId)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setPicking(false)
        setSharing(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const clone = useMutation({
    mutationFn: () => taskApi.clone(projectId, taskId),
    onSuccess: () => {
      console.log('[TaskActions] clone OK')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setOpen(false)
      onActionDone()
    },
    onError: (err: unknown) => {
      console.error('[TaskActions] clone failed:', err)
      setError(extractApiError(err, 'Clone failed.'))
    },
  })

  // REQ-161: archive / restore
  const archive = useMutation({
    mutationFn: () =>
      archivedAt
        ? projectTaskApi.unarchive(projectId, taskId)
        : projectTaskApi.archive(projectId, taskId),
    onSuccess: () => {
      console.log('[TaskActions] archive toggle OK')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      setOpen(false)
      onActionDone()
    },
    onError: (err: unknown) => {
      console.error('[TaskActions] archive failed:', err)
      setError(extractApiError(err, 'Archive failed.'))
    },
  })

  const move = useMutation({
    mutationFn: (targetProjectId: string) => taskApi.move(projectId, taskId, targetProjectId),
    onSuccess: () => {
      console.log('[TaskActions] move OK')
      qc.invalidateQueries({ queryKey: ['tasks'] })
      setOpen(false)
      setPicking(false)
      onActionDone()
    },
    onError: (err: unknown) => {
      console.error('[TaskActions] move failed:', err)
      setError(extractApiError(err, 'Move failed.'))
    },
  })

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Task actions"
        title="Task actions"
        onClick={() => { setOpen((v) => !v); setPicking(false); setSharing(false); setError('') }}
        className="text-gray-500 hover:text-gray-300 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] bg-gray-900 border border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
          {!picking && !sharing ? (
            <>
              <button
                type="button"
                onClick={() => { console.log('[TaskActions] clone clicked'); clone.mutate() }}
                disabled={clone.isPending}
                className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Copy size={14} /> Clone task
              </button>
              <button
                type="button"
                onClick={() => { setPicking(true); setError('') }}
                className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
              >
                <FolderInput size={14} /> Move to project…
              </button>
              {archivedAt ? (
                <button
                  type="button"
                  onClick={() => archive.mutate()}
                  disabled={archive.isPending}
                  className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <ArchiveRestore size={14} /> Restore from archive
                </button>
              ) : taskStatus === 'done' && (
                <button
                  type="button"
                  onClick={() => archive.mutate()}
                  disabled={archive.isPending}
                  className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  <Archive size={14} /> Archive task
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => { setSharing(true); setError('') }}
                  className="w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors"
                >
                  <Link2 size={14} /> Share publicly…
                </button>
              )}
            </>
          ) : sharing ? (
            <div className="p-3 space-y-2">
              <p className="text-xs text-gray-500">Public read-only links — anyone with the URL can view this task.</p>
              {activeLinks.map((l) => (
                <div key={l.id} className="flex items-center gap-1.5">
                  <input
                    readOnly
                    aria-label="Share URL"
                    value={`${window.location.origin}/share/${l.token}`}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 text-[11px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Revoke link"
                    title="Revoke"
                    onClick={() => revokeLink.mutate(l.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => createLink.mutate()}
                disabled={createLink.isPending}
                className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
              >
                {createLink.isPending ? 'Creating…' : activeLinks.length ? 'New link' : 'Create share link'}
              </button>
            </div>
          ) : (
            <>
              <p className="px-4 pt-2.5 pb-1 text-xs text-gray-500 uppercase tracking-wide">Move to</p>
              {targets.length === 0 && (
                <p className="px-4 py-2.5 text-sm text-gray-500">No other projects.</p>
              )}
              {targets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { console.log('[TaskActions] move to:', p.id); move.mutate(p.id) }}
                  disabled={move.isPending}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {p.name}
                </button>
              ))}
            </>
          )}
          {error && (
            <p className="px-4 py-2 text-xs text-red-400 bg-red-400/10">{error}</p>
          )}
        </div>
      )}
    </div>
  )
}
