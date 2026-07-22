// REQ-166 — Export & Import: the data-in/data-out surface for a project.
// Export = REQ-159 server dump with column picker + filtered export.
// Import = CSV (REQ-149) + Trello JSON / Jira CSV (REQ-160).
import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Download, Upload } from 'lucide-react'
import { useResolvedProject } from '../hooks/useResolvedProject'
import { useProjectTasks } from '../hooks/useTasks'
import { useProjectFilterFields } from '../hooks/useProjectFilterFields'
import ImportSection from '../components/ImportSection'
import SmartFilterBar, { type ActiveFilter } from '../components/SmartFilterBar'
import { applyTaskFilters } from '../lib/taskFilter'
import { downloadCsv, SERVER_EXPORT_FIELDS } from '../lib/csvExport'
import { taskApi, trackerImportApi, type TrackerImportResult } from '../api/client'

const FIELDS_STORAGE_KEY = 'orbit_export_fields'

function loadChosenFields(): Set<string> {
  try {
    const raw = localStorage.getItem(FIELDS_STORAGE_KEY)
    if (!raw) return new Set(SERVER_EXPORT_FIELDS)
    const parsed = JSON.parse(raw) as string[]
    return new Set(parsed.filter((f) => SERVER_EXPORT_FIELDS.includes(f)))
  } catch {
    return new Set(SERVER_EXPORT_FIELDS)
  }
}

export default function ExportImportPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { projectId, seg: wsSeg, project, projects } = useResolvedProject()
  const [chosenFields, setChosenFields] = useState<Set<string>>(loadChosenFields)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  // REQ-166: filtered export — same filter language as everywhere else;
  // the client filters, the server renders full-fidelity CSV for those ids.
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const { data: tasks = [] } = useProjectTasks(projectId)
  const { filterFields, isCustomMode } = useProjectFilterFields(projectId, project?.mode ?? 'open')
  const filtered = useMemo(
    () => tasks.filter((t) => applyTaskFilters(t, filters, isCustomMode)),
    [tasks, filters, isCustomMode]
  )

  // REQ-160: Trello/Jira import
  const jiraFileRef = useRef<HTMLInputElement>(null)
  const trelloFileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<TrackerImportResult | null>(null)
  const [importError, setImportError] = useState('')

  async function runTrackerImport(kind: 'jira' | 'trello', file: File) {
    setImporting(true)
    setImportResult(null)
    setImportError('')
    console.log('[Import] tracker import:', kind, file.name)
    try {
      const result = kind === 'jira'
        ? await trackerImportApi.jira(projectId, file)
        : await trackerImportApi.trello(projectId, file)
      setImportResult(result)
      qc.invalidateQueries({ queryKey: ['project-tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    } catch (err: unknown) {
      console.error('[Import] failed:', err)
      const data = (err as { response?: { data?: { error?: { message?: string }; detail?: string } } })?.response?.data
      setImportError((data?.error?.message ?? data?.detail ?? 'Import failed — is this the right file?') as string)
    } finally {
      setImporting(false)
    }
  }

  function toggleField(field: string) {
    setChosenFields((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  async function exportAll() {
    setError('')
    setExporting(true)
    const fields = SERVER_EXPORT_FIELDS.filter((f) => chosenFields.has(f))
    localStorage.setItem(FIELDS_STORAGE_KEY, JSON.stringify(fields))
    const taskIds = filters.length > 0 ? filtered.map((t) => t.id) : undefined
    console.log('[ExportImport] export — fields:', fields.join(','), 'filtered ids:', taskIds?.length ?? 'all')
    try {
      const csv = await taskApi.exportCsv(projectId, fields.join(','), taskIds)
      downloadCsv(`${wsSeg || 'tasks'}-export.csv`, csv)
    } catch (err: unknown) {
      console.error('[ExportImport] export failed:', err)
      setError('Export failed. Try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-gray-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 max-w-3xl mx-auto px-6 pt-8">
        <h1 className="text-lg font-semibold">Export & Import</h1>
        {/* Switch projects without leaving the page — filters/count re-scope */}
        <select
          aria-label="Project"
          value={projectId}
          onChange={(e) => {
            const target = projects.find((p) => p.id === e.target.value)
            if (target) navigate(`/projects/${target.key ?? target.id}/export`)
          }}
          className="min-w-0 max-w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-brand"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-8">
        {/* ── Export ─────────────────────────────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100 mb-1">
            <Download size={15} className="text-brand" /> Export tasks (CSV)
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Includes tasks hidden from boards. Narrow with the filter below or export everything;
            pick the columns — the default round-trips with Orbit's CSV import, and other trackers
            map columns on import.
          </p>
          <div className="mb-4">
            <SmartFilterBar
              filters={filters}
              onFiltersChange={setFilters}
              fields={filterFields}
              placeholder="Filter export — @status: @assignee: @tag: @type: @priority: (empty = everything)"
            />
            <p className="text-xs text-gray-500 mt-2">
              {filters.length > 0
                ? `${filtered.length} of ${tasks.length} tasks will be exported`
                : `All ${tasks.length} tasks will be exported`}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-4">
            {SERVER_EXPORT_FIELDS.map((f) => (
              <label key={f} className="flex items-center gap-2 text-xs text-gray-300 px-2 py-1 rounded hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={f}
                  checked={chosenFields.has(f)}
                  onChange={() => toggleField(f)}
                  className="accent-brand"
                />
                {f}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2 mb-3">{error}</p>}
          <button
            onClick={exportAll}
            disabled={exporting || chosenFields.size === 0}
            className="bg-brand hover:bg-brand-hover disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {exporting ? 'Exporting…' : 'Download CSV'}
          </button>
        </section>

        {/* ── Import ─────────────────────────────────────────────────────── */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-100 mb-1">
            <Upload size={15} className="text-brand" /> Import tasks
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            CSV import creates tasks from a header-row file (admin only, ≤500 rows, per-row error report).
          </p>
          <ImportSection projectId={projectId} />

          <div className="mt-6 pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-2">From other trackers</p>
            <div className="flex flex-wrap gap-3">
              <input ref={jiraFileRef} type="file" accept=".csv" className="hidden"
                     data-testid="jira-file-input"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) runTrackerImport('jira', f); e.target.value = '' }} />
              <input ref={trelloFileRef} type="file" accept=".json" className="hidden"
                     data-testid="trello-file-input"
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) runTrackerImport('trello', f); e.target.value = '' }} />
              <button
                type="button"
                disabled={importing}
                onClick={() => jiraFileRef.current?.click()}
                className="text-xs text-gray-300 border border-gray-700 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                Import from Jira (CSV)
              </button>
              <button
                type="button"
                disabled={importing}
                onClick={() => trelloFileRef.current?.click()}
                className="text-xs text-gray-300 border border-gray-700 hover:bg-gray-800 px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                Import from Trello (JSON)
              </button>
              {importing && <span className="text-[11px] text-gray-500 self-center">Importing…</span>}
            </div>
            {importResult && (
              <div className="mt-3 text-xs">
                <p className="text-gray-300">{importResult.created} tasks imported
                  {importResult.errors.length > 0 && ` · ${importResult.errors.length} skipped`}</p>
                {importResult.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-red-400">{e.entity}: {e.error}</p>
                ))}
              </div>
            )}
            {importError && <p className="mt-2 text-xs text-red-400">{importError}</p>}
          </div>
        </section>
      </main>
    </div>
  )
}
