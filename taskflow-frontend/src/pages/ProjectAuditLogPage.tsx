import { useState } from 'react'
import { useResolvedProject } from '../hooks/useResolvedProject'
import { ScrollText, BarChart3 } from 'lucide-react'
import { useAuditLog } from '../hooks/useAuditLog'
import { useProjectActivity } from '../hooks/useActivity'
import { useMembers } from '../hooks/useMembers'
import { useMe } from '../hooks/useAuth'
import { useProjects } from '../hooks/useProjects'
import { useBoards } from '../hooks/useBoards'
import { auditApi, activityApi, type AuditLogFilters, type ProjectActivityFilters } from '../api/client'
import SmartFilterBar, { type ActiveFilter } from '../components/SmartFilterBar'
import StatsPanel from '../components/StatsPanel'
import BurndownChart from '../components/BurndownChart'
import VelocityChart from '../components/VelocityChart'
import ForecastPanel from '../components/ForecastPanel'

// ── Audit trail constants ────────────────────────────────────────────────────

const AUDIT_ACTION_TYPES = [
  'workspace.created', 'workspace.renamed', 'workspace.deleted',
  'board.created', 'board.renamed', 'board.deleted',
  'member.invited', 'member.joined', 'member.removed', 'member.role_changed',
]

const AUDIT_ENTITY_TYPES = ['workspace', 'board', 'member']

// ── Activity log constants (task events, shown in Reports) ───────────────────

const ACTIVITY_ACTION_TYPES = [
  'task_created', 'title_changed', 'status_changed', 'priority_changed',
  'assignee_changed', 'due_date_changed', 'task_deleted',
  'comment_added', 'comment_edited', 'comment_deleted',
  'attachment_added', 'attachment_deleted',
  'tag_applied', 'tag_removed',
  'subtask_added', 'subtask_completed', 'subtask_uncompleted', 'subtask_deleted',
  'subtask_promoted', 'task_promoted',
]

const PAGE_SIZE = 50

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function isProjectAdmin(
  projects: { id: string; owner_id: string }[],
  members: { id: string; role: string }[],
  projectId: string,
  userId: string | undefined,
): boolean {
  return projects.some(p => p.id === projectId && p.owner_id === userId)
    || members.some(m => m.id === userId && (m.role === 'admin' || m.role === 'owner'))
}

function hasAuditFilters(smartFilters: ActiveFilter[], dateFrom: string, dateTo: string, entitySearch: string): boolean {
  return smartFilters.length > 0 || !!dateFrom || !!dateTo || !!entitySearch.trim()
}

// ── Audit trail tab ──────────────────────────────────────────────────────────

function filtersToAuditParams(
  smartFilters: ActiveFilter[],
  dateFrom: string,
  dateTo: string,
  entityNameSearch: string,
): AuditLogFilters {
  const result: AuditLogFilters = {}
  const actorPos = smartFilters.filter(f => f.fieldId === 'actor' && !f.negate).map(f => f.value)
  const actorNeg = smartFilters.filter(f => f.fieldId === 'actor' && f.negate).map(f => f.value)
  const actionPos = smartFilters.filter(f => f.fieldId === 'action' && !f.negate).map(f => f.value)
  const actionNeg = smartFilters.filter(f => f.fieldId === 'action' && f.negate).map(f => f.value)
  const typePos = smartFilters.filter(f => f.fieldId === 'type' && !f.negate).map(f => f.value)
  if (actorPos.length > 0) result.actor_ids = actorPos
  if (actorNeg.length > 0) result.exclude_actor_ids = actorNeg
  if (actionPos.length > 0) result.actions = actionPos
  if (actionNeg.length > 0) result.exclude_actions = actionNeg
  if (typePos.length > 0) result.entity_types = typePos
  if (entityNameSearch.trim()) result.entity_name_search = entityNameSearch.trim()
  if (dateFrom) result.date_from = dateFrom
  if (dateTo) result.date_to = dateTo
  return result
}

function AuditLogTab({ projectId, members }: {
  projectId: string
  members: { id: string; username: string | null; email: string }[]
}) {
  const [smartFilters, setSmartFilters] = useState<ActiveFilter[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [entityNameSearch, setEntityNameSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const apiFilters = filtersToAuditParams(smartFilters, dateFrom, dateTo, entityNameSearch)
  const { data, isLoading } = useAuditLog(projectId, apiFilters, PAGE_SIZE, offset)

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  function handleFiltersChange(f: ActiveFilter[]) { setSmartFilters(f); setOffset(0) }
  function handleDateChange(key: 'from' | 'to', value: string) {
    if (key === 'from') setDateFrom(value); else setDateTo(value)
    setOffset(0)
  }

  async function handleExport(format: 'csv' | 'json') {
    const blob = await auditApi.exportBlob(projectId, apiFilters, format)
    triggerDownload(blob, `audit-log.${format}`)
  }

  const hasFilters = hasAuditFilters(smartFilters, dateFrom, dateTo, entityNameSearch)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {total > 0 && <span className="text-xs text-gray-500">{total} entries</span>}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-700 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300 transition-colors"
          >Export CSV</button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-700 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300 transition-colors"
          >Export JSON</button>
        </div>
      </div>

      <SmartFilterBar
        filters={smartFilters}
        onFiltersChange={handleFiltersChange}
        placeholder="Type @ to filter by actor, action, or entity type…"
        fields={[
          { id: 'actor', label: 'Actor', options: members.map(m => ({ value: m.id, label: m.username ?? m.email })) },
          { id: 'action', label: 'Action', options: AUDIT_ACTION_TYPES.map(a => ({ value: a, label: a })) },
          { id: 'type', label: 'Type', options: AUDIT_ENTITY_TYPES.map(t => ({ value: t, label: t })) },
        ]}
      />

      <input
        type="text"
        placeholder="Search by entity name…"
        value={entityNameSearch}
        onChange={e => { setEntityNameSearch(e.target.value); setOffset(0) }}
        className="w-full text-sm bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand transition-colors"
        aria-label="Search by entity name"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-from" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">From</label>
          <input id="audit-from" type="date"
            className="text-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:border-brand"
            value={dateFrom} onChange={e => handleDateChange('from', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="audit-to" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To</label>
          <input id="audit-to" type="date"
            className="text-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:border-brand"
            value={dateTo} onChange={e => handleDateChange('to', e.target.value)} />
        </div>
        {hasFilters && (
          <div className="flex flex-col justify-end pb-0.5 self-end">
            <button
              onClick={() => { setSmartFilters([]); setDateFrom(''); setDateTo(''); setEntityNameSearch(''); setOffset(0) }}
              className="text-xs text-red-400 hover:text-red-300 py-1.5 transition-colors"
            >Clear all</button>
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No audit entries found</div>
        ) : (
          // Below md the Detail blob is dropped and what remains scrolls sideways,
          // so the page itself never scrolls horizontally on a phone.
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                  <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry, i) => (
                  <tr key={entry.id} className={`border-b border-gray-800/50 last:border-0 ${i % 2 !== 0 ? 'bg-gray-950/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-gray-200 text-xs">{entry.actor_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-mono bg-gray-800 text-brand px-1.5 py-0.5 rounded">{entry.action}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">
                      <span className="text-gray-500 mr-1">[{entry.entity_type}]</span>
                      {entry.entity_name ?? '—'}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs">
                      {entry.meta ? JSON.stringify(entry.meta) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(p => Math.max(0, p - PAGE_SIZE))}
              className="px-3 py-1.5 border border-gray-700 rounded-lg disabled:opacity-40 hover:border-gray-500 text-gray-400 transition-colors">Previous</button>
            <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(p => p + PAGE_SIZE)}
              className="px-3 py-1.5 border border-gray-700 rounded-lg disabled:opacity-40 hover:border-gray-500 text-gray-400 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Activity log section (inside Reports tab) ────────────────────────────────

function filtersToActivityParams(
  smartFilters: ActiveFilter[],
  dateFrom: string,
  dateTo: string,
): ProjectActivityFilters {
  const result: ProjectActivityFilters = {}
  const actionPos = smartFilters.filter(f => f.fieldId === 'action' && !f.negate).map(f => f.value)
  const actionNeg = smartFilters.filter(f => f.fieldId === 'action' && f.negate).map(f => f.value)
  if (actionPos.length > 0) result.actions = actionPos
  if (actionNeg.length > 0) result.exclude_actions = actionNeg
  if (dateFrom) result.date_from = dateFrom
  if (dateTo) result.date_to = dateTo
  return result
}

function ActivityLogSection({ projectId }: { projectId: string }) {
  const [smartFilters, setSmartFilters] = useState<ActiveFilter[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [offset, setOffset] = useState(0)

  const apiFilters = filtersToActivityParams(smartFilters, dateFrom, dateTo)
  const { data, isLoading } = useProjectActivity(projectId, apiFilters, PAGE_SIZE, offset)

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  async function handleExport(format: 'csv' | 'json') {
    const blob = await activityApi.exportWorkspaceBlob(projectId, apiFilters, format)
    triggerDownload(blob, `activity-log.${format}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-300">Activity Log</h3>
        <div className="flex gap-2">
          <button onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-700 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300 transition-colors">Export CSV</button>
          <button onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-xs font-medium border border-gray-700 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300 transition-colors">Export JSON</button>
        </div>
      </div>

      <SmartFilterBar
        filters={smartFilters}
        onFiltersChange={f => { setSmartFilters(f); setOffset(0) }}
        placeholder="Type @ to filter by action…"
        fields={[
          { id: 'action', label: 'Action', options: ACTIVITY_ACTION_TYPES.map(a => ({ value: a, label: a })) },
        ]}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="act-from" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">From</label>
          <input id="act-from" type="date"
            className="text-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:border-brand"
            value={dateFrom} onChange={e => { setDateFrom(e.target.value); setOffset(0) }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="act-to" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To</label>
          <input id="act-to" type="date"
            className="text-sm bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 focus:outline-none focus:border-brand"
            value={dateTo} onChange={e => { setDateTo(e.target.value); setOffset(0) }} />
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No activity found</div>
        ) : (
          // Same treatment as the audit table: Detail is dropped below md and the
          // remainder scrolls inside its own box rather than widening the page.
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-950 border-b border-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Task</th>
                  <th className="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((entry, i) => (
                  <tr key={entry.id} className={`border-b border-gray-800/50 last:border-0 ${i % 2 !== 0 ? 'bg-gray-950/40' : ''}`}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-gray-200 text-xs">{entry.actor_name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-mono bg-gray-800 text-brand px-1.5 py-0.5 rounded">{entry.action}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{entry.entity_name ?? '—'}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-gray-500 text-xs">
                      {entry.old_value && entry.new_value
                        ? <span className="text-gray-400">{entry.old_value} → {entry.new_value}</span>
                        : entry.meta ? JSON.stringify(entry.meta) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(p => Math.max(0, p - PAGE_SIZE))}
              className="px-3 py-1.5 border border-gray-700 rounded-lg disabled:opacity-40 hover:border-gray-500 text-gray-400 transition-colors">Previous</button>
            <button disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(p => p + PAGE_SIZE)}
              className="px-3 py-1.5 border border-gray-700 rounded-lg disabled:opacity-40 hover:border-gray-500 text-gray-400 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Reports tab ──────────────────────────────────────────────────────────────

function ReportsTab({ projectId }: { projectId: string }) {
  const { data: boards = [] } = useBoards(projectId)
  const { data: projects = [] } = useProjects()
  const method = projects.find((p) => p.id === projectId)?.estimation_method
  const showVelocity = method === 'story_points'
  const showForecast = method === 'flow'

  return (
    <div className="space-y-8">
      <ActivityLogSection projectId={projectId} />

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Issue Distribution</h3>
        <StatsPanel workspaceId={projectId} boards={boards} />
      </div>

      {showVelocity && (
        <>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Velocity</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <VelocityChart projectId={projectId} />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Points Burndown</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <BurndownChart workspaceId={projectId} unit="points" />
            </div>
          </div>
        </>
      )}

      {showForecast && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-300">Delivery Forecast</h3>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <ForecastPanel projectId={projectId} />
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-300">Burndown</h3>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <BurndownChart workspaceId={projectId} />
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'audit' | 'reports'

export default function ProjectAuditLogPage() {
  const { projectId } = useResolvedProject()
  const { data: user } = useMe()
  const { data: projects = [] } = useProjects()
  const { data: members = [] } = useMembers(projectId!)

  const isAdmin = isProjectAdmin(projects, members, projectId!, user?.id)

  const [activeTab, setActiveTab] = useState<Tab>('reports')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    ...(isAdmin ? [{ id: 'audit' as Tab, label: 'Audit Trail', icon: <ScrollText size={14} /> }] : []),
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={14} /> },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-sm font-semibold text-gray-200 mb-6">Analytics</h1>
        {tabs.length > 1 && (
          <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-8">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-gray-800 text-gray-100' : 'text-gray-500 hover:text-gray-300'
                }`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'audit' && isAdmin && <AuditLogTab projectId={projectId!} members={members} />}
        {activeTab === 'reports' && <ReportsTab projectId={projectId!} />}
      </div>
    </div>
  )
}
