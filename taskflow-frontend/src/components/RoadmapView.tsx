import { useMemo, useState } from 'react'
import { parseISO, differenceInDays, format, addDays, startOfMonth, addMonths } from 'date-fns'
import { Plus, Trash2, Rocket, Flag } from 'lucide-react'
import { useReleases, useCreateRelease, useShipRelease, useDeleteRelease } from '../hooks/useReleases'
import { useProjectTasks } from '../hooks/useTasks'
import type { Task, Release, ProjectMode } from '../types'

const STATUS_STYLE: Record<string, string> = {
  planned: 'bg-blue-900/60 text-blue-300',
  released: 'bg-green-900/60 text-green-300',
  archived: 'bg-gray-700 text-gray-400',
}

function epicProgress(epic: Task, tasks: Task[]): number {
  const children = tasks.filter((t) => t.parent_id === epic.id)
  if (!children.length) return 0
  return Math.round((children.filter((c) => c.status === 'done').length / children.length) * 100)
}

/** Roadmap timeline — a lane per release (and per dated epic), bar = start→target with a progress fill. */
export default function RoadmapView({ projectId, isAdmin, mode, onOpenTask }: { projectId: string; isAdmin: boolean; mode: ProjectMode; onOpenTask?: (id: string) => void }) {
  const { data: releases = [] } = useReleases(projectId)
  const { data: allTasks = [] } = useProjectTasks(projectId)
  const create = useCreateRelease(projectId)
  const ship = useShipRelease(projectId)
  const del = useDeleteRelease(projectId)

  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  // Enforced ship-gate: decide what happens to unfinished tasks before releasing.
  const [shipFor, setShipFor] = useState<Release | null>(null)
  const [shipAction, setShipAction] = useState<'keep' | 'backlog' | 'move'>('keep')
  const [shipTarget, setShipTarget] = useState('')

  function handleShip(r: Release) {
    if (mode === 'enforced' && r.total_tasks - r.done_tasks > 0) {
      setShipFor(r); setShipAction('keep'); setShipTarget('')
    } else {
      ship.mutate({ releaseId: r.id })
    }
  }

  function confirmShip() {
    if (!shipFor) return
    const body = shipAction === 'move'
      ? { unfinished_action: 'move' as const, target_release_id: shipTarget }
      : { unfinished_action: shipAction }
    ship.mutate({ releaseId: shipFor.id, body }, { onSettled: () => setShipFor(null) })
  }

  const dated = useMemo(() => releases.filter((r) => r.release_date), [releases])
  const undated = useMemo(() => releases.filter((r) => !r.release_date), [releases])
  const datedEpics = useMemo(() => allTasks.filter((t) => t.issue_type === 'epic' && t.due_date), [allTasks])

  // Time window spans every dated release + epic (padded), min ~3 months.
  const window = useMemo(() => {
    const segs: { s: Date; e: Date }[] = []
    dated.forEach((r) => segs.push({ s: parseISO(r.start_date ?? r.release_date!), e: parseISO(r.release_date!) }))
    datedEpics.forEach((ep) => segs.push({ s: parseISO(ep.start_date ?? ep.due_date!), e: parseISO(ep.due_date!) }))
    if (!segs.length) return null
    const min = startOfMonth(new Date(Math.min(...segs.map((x) => x.s.getTime()), Date.now())))
    let max = new Date(Math.max(...segs.map((x) => x.e.getTime())))
    if (differenceInDays(max, min) < 60) max = addDays(min, 90)
    max = addDays(max, 7)
    const months: Date[] = []
    for (let m = startOfMonth(min); m <= max; m = addMonths(m, 1)) months.push(m)
    return { min, max, total: differenceInDays(max, min) || 1, months }
  }, [dated, datedEpics])

  function pct(date: Date): number {
    if (!window) return 0
    return Math.min(100, Math.max(0, (differenceInDays(date, window.min) / window.total) * 100))
  }

  async function add() {
    if (!name.trim()) return
    await create.mutateAsync({ name: name.trim(), release_date: target || null })
    setName(''); setTarget('')
  }

  function TrackBar({ start, end, progress, color, title }: { start: Date; end: Date; progress: number; color: string; title: string }) {
    const left = pct(start)
    const width = Math.max(2, pct(end) - left)
    return (
      <div className="absolute top-1.5 h-5 rounded-md bg-gray-700 overflow-hidden border border-gray-600" style={{ left: `${left}%`, width: `${width}%` }} title={title}>
        <div className={`h-full ${color}`} style={{ width: `${progress}%` }} />
        <span className="absolute inset-0 flex items-center px-1.5 text-[10px] font-medium text-gray-100 truncate">{progress}%</span>
      </div>
    )
  }

  return (
    <div className="p-4">
      {isAdmin && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New release (e.g. v1.2)" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-brand" />
          <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} title="Target / ship date" className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-300 outline-none focus:border-brand [color-scheme:dark]" />
          <button onClick={add} disabled={!name.trim() || create.isPending} className="flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
            <Plus size={14} /> Add release
          </button>
        </div>
      )}

      {releases.length === 0 && datedEpics.length === 0 && <p className="text-sm text-gray-500 py-8 text-center">No releases yet. {isAdmin ? 'Create one above to start a roadmap.' : ''}</p>}

      {window && (
        <div className="overflow-x-auto">
          <div className="relative min-w-[640px]">
            {/* month gridlines */}
            <div className="relative h-5 mb-1 border-b border-gray-800">
              {window.months.map((m, i) => (
                <span key={i} className="absolute text-[10px] text-gray-500" style={{ left: `${pct(m)}%` }}>{format(m, 'MMM yy')}</span>
              ))}
            </div>

            {dated.length > 0 && <p className="text-[10px] uppercase tracking-wide text-gray-600 mt-2 mb-0.5">Releases</p>}
            {dated.map((r) => (
              <div key={r.id} className="group grid grid-cols-[180px_1fr] items-center gap-3 py-1 border-b border-gray-900">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-gray-200 truncate" title={r.name}>{r.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  {isAdmin && (
                    <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {r.status !== 'released' && <button onClick={() => handleShip(r)} title="Mark released" className="text-gray-500 hover:text-green-400"><Rocket size={12} /></button>}
                      <button onClick={() => del.mutate(r.id)} title="Delete release" className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                    </span>
                  )}
                </div>
                <div className="relative h-8">
                  <TrackBar start={r.start_date ? parseISO(r.start_date) : addDays(parseISO(r.release_date!), -14)} end={parseISO(r.release_date!)} progress={r.progress_pct} color="bg-brand/70" title={`${r.progress_pct}% · ${r.done_tasks}/${r.total_tasks} done`} />
                  <span className="absolute right-0 top-2 text-[10px] text-gray-500">{format(parseISO(r.release_date!), 'MMM d')}</span>
                </div>
              </div>
            ))}

            {datedEpics.length > 0 && <p className="text-[10px] uppercase tracking-wide text-gray-600 mt-3 mb-0.5">Epics</p>}
            {datedEpics.map((ep) => {
              const prog = epicProgress(ep, allTasks)
              const end = parseISO(ep.due_date!)
              const start = ep.start_date ? parseISO(ep.start_date) : addDays(end, -14)
              return (
                <div key={ep.id} className="group grid grid-cols-[180px_1fr] items-center gap-3 py-1 border-b border-gray-900">
                  <button onClick={() => onOpenTask?.(ep.id)} className="flex items-center gap-1.5 min-w-0 text-left">
                    <Flag size={11} className="text-purple-400 shrink-0" />
                    <span className="text-sm text-gray-200 truncate hover:text-brand" title={ep.title}>{ep.project_key}-{ep.sequence_number} {ep.title}</span>
                  </button>
                  <div className="relative h-8">
                    <TrackBar start={start} end={end} progress={prog} color="bg-purple-500/70" title={`${prog}% of children done`} />
                    <span className="absolute right-0 top-2 text-[10px] text-gray-500">{format(end, 'MMM d')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {undated.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-600 mb-2">No target date</p>
          <ul className="divide-y divide-gray-900">
            {undated.map((r) => (
              <li key={r.id} className="group flex items-center gap-2 py-1.5 text-sm text-gray-300">
                <span className="truncate">{r.name}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                <span className="text-[11px] text-gray-500">{r.progress_pct}% · {r.done_tasks}/{r.total_tasks}</span>
                {isAdmin && (
                  <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    {r.status !== 'released' && <button onClick={() => handleShip(r)} title="Mark released" className="text-gray-500 hover:text-green-400"><Rocket size={12} /></button>}
                    <button onClick={() => del.mutate(r.id)} title="Delete release" className="text-gray-500 hover:text-red-400"><Trash2 size={12} /></button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shipFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShipFor(null) }}>
          <div className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5">
            <p className="text-sm font-semibold text-gray-100 mb-1">Release {shipFor.name}</p>
            <p className="text-xs text-gray-400 mb-3">
              <strong className="text-gray-200">{shipFor.total_tasks - shipFor.done_tasks}</strong> task{shipFor.total_tasks - shipFor.done_tasks > 1 ? 's' : ''} aren't done. Choose what happens to them before releasing:
            </p>
            <div className="flex flex-col gap-2 text-sm text-gray-300">
              <label className="flex items-center gap-2"><input type="radio" checked={shipAction === 'keep'} onChange={() => setShipAction('keep')} className="accent-brand" /> Keep them on this release</label>
              <label className="flex items-center gap-2"><input type="radio" checked={shipAction === 'backlog'} onChange={() => setShipAction('backlog')} className="accent-brand" /> Send them to the backlog</label>
              <label className="flex items-center gap-2"><input type="radio" checked={shipAction === 'move'} onChange={() => setShipAction('move')} className="accent-brand" /> Move them to another release</label>
              {shipAction === 'move' && (
                <select value={shipTarget} onChange={(e) => setShipTarget(e.target.value)} className="ml-6 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand">
                  <option value="">— pick a release —</option>
                  {releases.filter((r) => r.id !== shipFor.id && r.status !== 'released').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShipFor(null)} className="text-sm text-gray-400 hover:text-gray-200 px-3 py-1.5">Cancel</button>
              <button onClick={confirmShip} disabled={(shipAction === 'move' && !shipTarget) || ship.isPending} className="text-sm bg-brand hover:bg-brand/80 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">Release</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
