// REQ-159 (DD-051) — Issues page: the single-filter query/export surface.
// Boards stack admin ∩ user filters by design; here the SmartFilterBar is the
// ONLY filter — no board config, no hide-done cutoff, no sprint scope.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Download, FileDown } from 'lucide-react'
import { projectTaskApi } from '../api/client'
import { useResolvedProject } from '../hooks/useResolvedProject'
import { useProjectTasks } from '../hooks/useTasks'
import { useProjectFilterFields } from '../hooks/useProjectFilterFields'
import ListView from '../components/ListView'
import SmartFilterBar, { type ActiveFilter } from '../components/SmartFilterBar'
import { applyTaskFilters } from '../lib/taskFilter'
import { toCsv, downloadCsv } from '../lib/csvExport'
import type { PriorityItem, Task } from '../types'

export default function IssuesPage() {
  const navigate = useNavigate()
  const { projectId, seg: wsSeg, project } = useResolvedProject()
  const { data: tasks = [], isLoading } = useProjectTasks(projectId)
  const { filterFields, isCustomMode, members, projectStatuses, priorityItems } =
    useProjectFilterFields(projectId, project?.mode ?? 'open')

  const [filters, setFilters] = useState<ActiveFilter[]>([])

  // REQ-161: archived view — list + restore
  const qc = useQueryClient()
  const [showArchived, setShowArchived] = useState(false)
  const { data: archivedTasks = [] } = useQuery({
    queryKey: ['archived-tasks', projectId],
    queryFn: () => projectTaskApi.listArchived(projectId),
    enabled: showArchived && !!projectId,
  })
  const restore = useMutation({
    mutationFn: (taskId: string) => projectTaskApi.unarchive(projectId, taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['archived-tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members])
  const priorityMap: Record<string, PriorityItem> = useMemo(
    () => Object.fromEntries(priorityItems.map((p) => [p.id, p])), [priorityItems]
  )

  const filtered = useMemo(
    () => tasks.filter((t) => applyTaskFilters(t, filters, isCustomMode)),
    [tasks, filters, isCustomMode]
  )

  function exportView() {
    console.log('[Issues] export view —', filtered.length, 'rows')
    const csv = toCsv<Task>(filtered, [
      { header: 'key', cell: (t) => t.project_key ? `${t.project_key}-${t.sequence_number}` : String(t.sequence_number ?? '') },
      { header: 'title', cell: (t) => t.title },
      { header: 'status', cell: (t) => t.status },
      { header: 'issue_type', cell: (t) => t.issue_type ?? '' },
      { header: 'priority', cell: (t) => (t.priority_id && priorityMap[t.priority_id]?.name) || '' },
      { header: 'assignee', cell: (t) => (t.assignee_id && memberMap[t.assignee_id]?.username) || '' },
      { header: 'due_date', cell: (t) => t.due_date ?? '' },
      { header: 'tags', cell: (t) => (t.tags ?? []).map((tag) => tag.name).join(';') },
    ])
    downloadCsv(`${wsSeg || 'tasks'}-view.csv`, csv)
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-gray-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-w-6xl mx-auto px-6 pt-6">
        <h1 className="text-lg font-semibold">Issues</h1>
        <span className="text-sm text-gray-500">
          — {filtered.length} issue{filtered.length === 1 ? '' : 's'}
          {filters.length > 0 && ` (of ${tasks.length})`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`flex items-center gap-1.5 text-xs border px-3 py-1.5 rounded-lg transition-colors ${
              showArchived
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-gray-700 text-gray-300 hover:bg-gray-800'
            }`}
            title="Archived tasks (REQ-161)"
          >
            <Archive size={13} /> Archived
          </button>
          <button
            onClick={exportView}
            className="flex items-center gap-1.5 text-xs text-gray-300 border border-gray-700 hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors"
            title="CSV of the currently filtered rows and visible columns"
          >
            <FileDown size={13} /> Export view
          </button>
          <button
            onClick={() => navigate(`/projects/${wsSeg}/export`)}
            className="flex items-center gap-1.5 text-xs bg-brand hover:bg-brand-hover text-white px-3 py-1.5 rounded-lg transition-colors"
            title="Full server export — every task, your choice of columns (Export & Import page)"
          >
            <Download size={13} /> Export all…
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6 flex flex-col gap-4">
        {showArchived ? (
          <section>
            <p className="text-xs text-gray-500 mb-3">
              Archived tasks — out of boards, search, and stats; always included in exports.
            </p>
            {archivedTasks.length === 0 ? (
              <p className="text-sm text-gray-500 py-12 text-center">Nothing archived.</p>
            ) : (
              <ul className="divide-y divide-gray-800">
                {archivedTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <span className="text-xs text-gray-500 font-medium shrink-0">
                      {t.project_key}-{t.sequence_number}
                    </span>
                    <span className="flex-1 text-sm text-gray-300 truncate">{t.title}</span>
                    <button
                      type="button"
                      aria-label={`Restore ${t.title}`}
                      onClick={() => restore.mutate(t.id)}
                      disabled={restore.isPending}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand transition-colors disabled:opacity-40"
                    >
                      <ArchiveRestore size={13} /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <SmartFilterBar
              filters={filters}
              onFiltersChange={setFilters}
              fields={filterFields}
              placeholder="Filter issues — @status: @assignee: @tag: @type: @priority:"
            />
            {isLoading ? (
              <p className="text-sm text-gray-500 py-12 text-center">Loading…</p>
            ) : (
              <ListView
                tasks={filtered}
                memberMap={memberMap}
                onRowClick={(task) => navigate(`/projects/${wsSeg}?task=${task.id}`)}
                projectStatuses={projectStatuses}
                isCustomMode={isCustomMode}
                priorityMap={priorityMap}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
