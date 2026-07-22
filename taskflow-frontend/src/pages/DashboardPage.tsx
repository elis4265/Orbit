import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useProjects } from '../hooks/useProjects'
import { useBoards } from '../hooks/useBoards'
import BurndownChart from '../components/BurndownChart'
import CumulativeFlowChart from '../components/CumulativeFlowChart'
import TimeInStatusChart from '../components/TimeInStatusChart'
import VelocityChart from '../components/VelocityChart'

// REQ-151 — personal dashboard: a grid of the charts Orbit already has,
// composed per user and persisted locally (no backend; Linear charges
// Enterprise for this, we store it in localStorage).
type WidgetType = 'burndown' | 'cfd' | 'time-in-status' | 'velocity'

interface Widget {
  id: string
  type: WidgetType
  projectId: string
  boardId: string | null
}

const WIDGET_LABELS: Record<WidgetType, string> = {
  burndown: 'Burndown',
  cfd: 'Cumulative Flow',
  'time-in-status': 'Time in Status',
  velocity: 'Velocity',
}

const STORAGE_KEY = 'orbit_dashboard_widgets'

function loadWidgets(): Widget[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function WidgetBody({ widget }: { widget: Widget }) {
  const { type, projectId, boardId } = widget
  if (type === 'velocity') return <VelocityChart projectId={projectId} />
  if (!boardId) return <p className="text-xs text-gray-600">This widget needs a board.</p>
  if (type === 'burndown') return <BurndownChart workspaceId={projectId} boardId={boardId} />
  if (type === 'cfd') return <CumulativeFlowChart workspaceId={projectId} boardId={boardId} />
  return <TimeInStatusChart workspaceId={projectId} boardId={boardId} />
}

function AddWidgetForm({ onAdd }: { onAdd: (w: Omit<Widget, 'id'>) => void }) {
  const { data: projects = [] } = useProjects()
  const [projectId, setProjectId] = useState('')
  const { data: boards = [] } = useBoards(projectId)
  const [boardId, setBoardId] = useState('')
  const [type, setType] = useState<WidgetType>('burndown')
  const needsBoard = type !== 'velocity'

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-900 border border-gray-800 rounded-xl">
      <select
        value={projectId}
        onChange={(e) => { setProjectId(e.target.value); setBoardId('') }}
        aria-label="Project"
        className="min-w-0 max-w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
      >
        <option value="">— project —</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as WidgetType)}
        aria-label="Widget type"
        className="min-w-0 max-w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
      >
        {Object.entries(WIDGET_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {needsBoard && (
        <select
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
          aria-label="Board"
          className="min-w-0 max-w-full bg-gray-950 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 outline-none focus:border-brand"
        >
          <option value="">— board —</option>
          {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <button
        onClick={() => onAdd({ type, projectId, boardId: needsBoard ? boardId : null })}
        disabled={!projectId || (needsBoard && !boardId)}
        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-40 hover:brightness-110 transition-all"
      >
        <Plus size={14} /> Add widget
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const { data: projects = [] } = useProjects()
  const [widgets, setWidgets] = useState<Widget[]>(loadWidgets)

  function persist(next: Widget[]) {
    setWidgets(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '…'

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-bold">Dashboard</h1>
        </div>

        <AddWidgetForm onAdd={(w) => persist([...widgets, { ...w, id: crypto.randomUUID() }])} />

        {widgets.length === 0 ? (
          <p className="text-sm text-gray-600 py-10 text-center">No widgets yet — add charts from your projects above.</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {widgets.map((w) => (
              <div key={w.id} className="p-4 bg-gray-900 border border-gray-800 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-300">
                    {WIDGET_LABELS[w.type]} <span className="text-gray-600">· {projectName(w.projectId)}</span>
                  </p>
                  <button
                    onClick={() => persist(widgets.filter((x) => x.id !== w.id))}
                    aria-label="Remove widget"
                    className="text-gray-600 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                <WidgetBody widget={w} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
