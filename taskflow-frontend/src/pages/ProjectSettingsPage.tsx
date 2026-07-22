import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useResolvedProject } from '../hooks/useResolvedProject'
import { Plus, Trash2, GripVertical, Check } from 'lucide-react'
import openImg from '../assets/open.png'
import guidedImg from '../assets/guided.png'
import enforcedImg from '../assets/enforced.png'
import { useCycleConfig, useUpdateCycleConfig } from '../hooks/useCycles'
import { useUpdateEstimationMethod } from '../hooks/useEstimation'
import { useCustomFields, useCreateCustomField, useDeleteCustomField } from '../hooks/useCustomFields'
import AutomationSection from '../components/AutomationSection'
import TaskTemplatesSection from '../components/TaskTemplatesSection'
import IntegrationsSection from '../components/IntegrationsSection'
import MembersSection from '../components/MembersSection'
import WebhooksSection from '../components/WebhooksSection'
import RecurringTasksSection from '../components/RecurringTasksSection'
import ImportSection from '../components/ImportSection'
import type { EstimationMethod, CustomFieldType } from '../types'
import {
  useProjectStatuses,
  useCreateProjectStatus,
  useUpdateProjectStatus,
  useDeleteProjectStatus,

  useProjectTransitions,
  useCreateTransition,
  useDeleteTransition,
  useUpdateProjectMode,
  useUpdateCreationPolicy,
} from '../hooks/useProjectStatuses'
import { useProjects, useUpdateHideDoneAfterDays, useUpdateAutoArchiveAfterDays, useUpdateDefaultAssignee } from '../hooks/useProjects'
import { useMembers } from '../hooks/useMembers'
import {
  useProjectPriorities,
  useCreatePriorityItem,
  useUpdatePriorityItem,
  useDeletePriorityItem,
} from '../hooks/usePriorities'
import type { CreationStatusPolicy, DefaultAssigneeMode, IssueType, ProjectMode, ProjectStatus, StatusCategory } from '../types'

// Task-creation policy (Jira Create-transition model, DD: choice over convention)
const CREATION_POLICIES: { id: CreationStatusPolicy; label: string; description: string }[] = [
  { id: 'any',     label: 'Any status',     description: 'Tasks can be created directly in any status. The board + button creates into its column.' },
  { id: 'initial', label: 'Initial only',   description: "Every new task lands on the workflow's initial status (the default unstarted one), whatever column you click + on." },
  { id: 'curated', label: 'Curated',        description: 'Only statuses you flag below are valid at creation. Anything else is rejected.' },
]

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  unstarted: 'Unstarted',
  started: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const CATEGORY_COLORS: Record<StatusCategory, string> = {
  unstarted: 'text-gray-400',
  started: 'text-brand',
  completed: 'text-green-400',
  cancelled: 'text-red-400',
}

const PALETTE = [
  '#6b7280', '#7c6af7', '#22c55e', '#ef4444',
  '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6',
]

const MODES: { id: ProjectMode; label: string; subtitle: string; description: string; features: string[]; image: string }[] = [
  {
    id: 'open',
    label: 'Flow',
    subtitle: 'Standard Sty',
    description: 'Best for small teams or solo projects. You get 3 fixed statuses — To Do, In Progress, Done. Work runs in automated cycles that roll unfinished tasks forward — no manual sprint management.',
    features: ['3 fixed statuses, always', 'Automated cycles with auto-rollover', 'Fastest to get started', 'No transition restrictions'],
    image: openImg,
  },
  {
    id: 'guided',
    label: 'Guided',
    subtitle: 'DIY Pasture',
    description: 'Best for teams with a defined process. Create your own statuses, name them anything, group them by category. Tasks can move freely between any status.',
    features: ['Fully custom statuses', 'Grouped by category (unstarted / active / done)', 'Tasks move freely between any status', 'Admin controls status list'],
    image: guidedImg,
  },
  {
    id: 'enforced',
    label: 'Enforced',
    subtitle: 'Hydraulic Labyrinth',
    description: 'Best for regulated or complex workflows. Same as Guided, but admins define exactly which status transitions are allowed. Tasks can only move along approved paths.',
    features: ['All Guided features included', 'Admin-defined transition rules', 'Tasks blocked from skipping steps', 'Ideal for QA, compliance, release flows'],
    image: enforcedImg,
  },
]

interface StatusRowProps {
  status: ProjectStatus
  onRename: (id: string, name: string) => void
  onRecolor: (id: string, color: string) => void
  onDelete: (id: string) => void
  isOpen: boolean
}

function StatusRow({ status, onRename, onRecolor, onDelete, isOpen }: StatusRowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(status.name)
  const [showPalette, setShowPalette] = useState(false)

  function commit() {
    if (name.trim() && name.trim() !== status.name) onRename(status.id, name.trim())
    setEditing(false)
  }

  return (
    <li className="flex items-center gap-3 py-2 group">
      <GripVertical size={14} className="text-gray-700 flex-shrink-0" />
      <button
        className="w-4 h-4 rounded-full flex-shrink-0 relative"
        style={{ backgroundColor: status.color }}
        onClick={() => !isOpen && setShowPalette((v) => !v)}
        title="Click to change color"
      >
        {showPalette && (
          <div className="absolute top-5 left-0 z-50 bg-gray-800 border border-gray-700 rounded-lg p-2 flex gap-1 flex-wrap w-32 shadow-xl">
            {PALETTE.map((c) => (
              <button
                key={c}
                className="w-5 h-5 rounded-full hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={(e) => { e.stopPropagation(); onRecolor(status.id, c); setShowPalette(false) }}
              />
            ))}
          </div>
        )}
      </button>

      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setName(status.name); setEditing(false) } }}
          className="flex-1 bg-gray-700 border border-brand rounded px-2 py-0.5 text-sm text-gray-100 focus:outline-none"
        />
      ) : (
        <button
          className="flex-1 text-left text-sm text-gray-200 hover:text-gray-100"
          onClick={() => !isOpen && setEditing(true)}
        >
          {status.name}
        </button>
      )}

      <span className={`text-xs ${CATEGORY_COLORS[status.category as StatusCategory]}`}>
        {CATEGORY_LABELS[status.category as StatusCategory]}
      </span>

      {!isOpen && (
        <button
          onClick={() => onDelete(status.id)}
          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
          aria-label="Delete status"
        >
          <Trash2 size={13} />
        </button>
      )}
    </li>
  )
}

type TabId = 'mode' | 'statuses' | 'transitions' | 'priorities' | 'defaults' | 'templates' | 'integrations' | 'members'

export default function ProjectSettingsPage() {
  const { projectId: workspaceId } = useResolvedProject()
  const projectId = workspaceId!

  // Active settings tab lives in the URL (?tab=integrations) so each is linkable.
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_TABS: TabId[] = ['mode', 'statuses', 'transitions', 'priorities', 'defaults', 'templates', 'integrations', 'members']
  const paramTab = searchParams.get('tab') as TabId | null
  const [tab, _setTab] = useState<TabId>(paramTab && VALID_TABS.includes(paramTab) ? paramTab : 'mode')
  const setTab = (t: TabId) => {
    _setTab(t)
    setSearchParams((prev) => {
      if (prev.get('tab') === t) return prev
      const p = new URLSearchParams(prev)
      p.set('tab', t)
      return p
    }, { replace: true })
  }
  const [error, setError] = useState('')

  const { data: projects = [] } = useProjects()
  const project = Array.isArray(projects) ? projects.find((p) => p.id === projectId) : undefined
  const currentMode = (project?.mode ?? 'open') as ProjectMode
  const isOpen = currentMode === 'open'

  const { data: statuses = [] } = useProjectStatuses(projectId)
  const { data: transitions = [] } = useProjectTransitions(projectId)

  const createStatus = useCreateProjectStatus(projectId)
  const updateStatus = useUpdateProjectStatus(projectId)
  const deleteStatus = useDeleteProjectStatus(projectId)

  const createTransition = useCreateTransition(projectId)
  const deleteTransition = useDeleteTransition(projectId)
  const updateMode = useUpdateProjectMode(projectId)

  const { data: priorityItems = [] } = useProjectPriorities(projectId)
  const createPriority = useCreatePriorityItem(projectId)
  const updatePriority = useUpdatePriorityItem(projectId)
  const deletePriority = useDeletePriorityItem(projectId)

  const [newPriorityName, setNewPriorityName] = useState('')
  const [newPriorityColor, setNewPriorityColor] = useState('#888888')
  const [editingPriorityId, setEditingPriorityId] = useState<string | null>(null)
  const [editingPriorityName, setEditingPriorityName] = useState('')
  const [editingPriorityColor, setEditingPriorityColor] = useState('')

  const [newStatusName, setNewStatusName] = useState('')
  const [newStatusCategory, setNewStatusCategory] = useState<StatusCategory>('unstarted')
  const [newStatusColor, setNewStatusColor] = useState('#6b7280')
  const [confirmModeChange, setConfirmModeChange] = useState<ProjectMode | null>(null)

  // Transition builder state
  const [transFromId, setTransFromId] = useState('')
  const [transToId, setTransToId] = useState('')
  const [transIssueType, setTransIssueType] = useState<IssueType | ''>('')

  async function handleModeSelect(mode: ProjectMode) {
    if (mode === currentMode) return
    if (mode === 'open') {
      setConfirmModeChange(mode)
      return
    }
    await applyModeChange(mode)
  }

  async function applyModeChange(mode: ProjectMode) {
    setError('')
    try {
      await updateMode.mutateAsync({ mode })
      setConfirmModeChange(null)
    } catch {
      setError('Failed to update project mode.')
    }
  }

  async function handleEnforceBlockLinksToggle(val: boolean) {
    setError('')
    try {
      await updateMode.mutateAsync({ mode: currentMode, enforceBlockLinks: val })
    } catch {
      setError('Failed to update block link enforcement.')
    }
  }

  async function handleAddStatus() {
    if (!newStatusName.trim()) return
    setError('')
    try {
      await createStatus.mutateAsync({ name: newStatusName.trim(), color: newStatusColor, category: newStatusCategory })
      setNewStatusName('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      setError(msg ?? 'Failed to create status.')
    }
  }

  async function handleAddTransition() {
    if (!transFromId || !transToId || transFromId === transToId) return
    setError('')
    try {
      await createTransition.mutateAsync({ fromId: transFromId, toId: transToId, issueType: transIssueType || null })
      setTransFromId('')
      setTransToId('')
      setTransIssueType('')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      setError(msg ?? 'Failed to create transition rule.')
    }
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'mode', label: 'Mode' },
    { id: 'statuses', label: 'Statuses' },
    { id: 'transitions', label: 'Transitions' },
    { id: 'priorities', label: 'Priorities' },
    // "Defaults" (not "Default assignee") so future project defaults can live here.
    { id: 'defaults', label: 'Defaults' },
    { id: 'templates', label: 'Templates' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'members', label: 'Members' },
  ]

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-gray-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 max-w-6xl mx-auto px-6 pt-6">
        <h1 className="text-lg font-semibold">Project Settings</h1>
        {project && (
          <span className="ml-1 text-sm text-gray-500 min-w-0 truncate">— {project.name}</span>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs — below md the strip scrolls horizontally so every tab stays reachable */}
        <div className="flex flex-nowrap gap-1 mb-8 bg-gray-900 rounded-xl p-1 max-w-full overflow-x-auto md:w-fit md:overflow-x-visible">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 whitespace-nowrap px-4 py-2 text-sm rounded-lg transition-colors ${
                tab === t.id
                  ? 'bg-gray-800 text-gray-100 font-medium'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* ── Mode tab ─────────────────────────────────────────────────────── */}
        {tab === 'mode' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-400 mb-2">
              The project mode controls how statuses and workflows behave. Switching modes does not delete your custom statuses.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {MODES.map((m) => {
                const active = currentMode === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModeSelect(m.id)}
                    className={`relative flex flex-col rounded-2xl border-2 overflow-hidden transition-all duration-200 focus:outline-none text-left ${
                      active
                        ? 'border-brand shadow-[0_0_0_4px_rgba(124,106,247,0.25)] scale-[1.02]'
                        : 'border-gray-700 bg-gray-900 hover:border-brand/50 hover:scale-[1.01]'
                    }`}
                  >
                    {/* Image */}
                    <div className={`w-full transition-all duration-200 ${active ? '' : 'brightness-60 hover:brightness-90'}`}>
                      <img src={m.image} alt={m.label} className="w-full object-contain" />
                    </div>

                    {/* Text body */}
                    <div className="p-5 flex flex-col gap-3 flex-1 bg-gray-900">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-base text-gray-100">{m.label}</span>
                          <span className="ml-2 text-xs text-gray-500 italic">{m.subtitle}</span>
                        </div>
                        {active && <Check size={16} className="text-brand flex-shrink-0 mt-0.5" />}
                      </div>

                      <p className="text-xs text-gray-400 leading-relaxed">{m.description}</p>

                      <ul className="flex flex-col gap-1 mt-1">
                        {m.features.map((f) => (
                          <li key={f} className="flex items-start gap-1.5 text-xs text-gray-500">
                            <span className="mt-0.5 text-brand flex-shrink-0">›</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {active && (
                      <div className="absolute inset-0 rounded-2xl ring-2 ring-brand/30 pointer-events-none" />
                    )}
                  </button>
                )
              })}
            </div>

            {currentMode === 'enforced' && (
              <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-xl">
                <p className="text-sm font-medium text-gray-200 mb-1">Enforced mode options</p>
                <label className="flex items-center gap-3 cursor-pointer select-none mt-2">
                  <input
                    type="checkbox"
                    checked={project?.enforce_block_links ?? false}
                    onChange={(e) => handleEnforceBlockLinksToggle(e.target.checked)}
                    className="w-4 h-4 flex-shrink-0 rounded accent-brand"
                  />
                  <span className="text-sm text-gray-300">Hard-block tasks with unresolved blockers from being marked Done</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-7">
                  When enabled, tasks cannot be moved to Done while a blocking issue is still open. No override allowed.
                </p>
              </div>
            )}

            <TaskCreationSection
              projectId={projectId}
              current={(project?.creation_status_policy ?? 'any') as CreationStatusPolicy}
              isOpen={isOpen}
              statuses={statuses}
              onToggleAllowOnCreate={(sid, value) => updateStatus.mutate({ statusId: sid, data: { allow_on_create: value } })}
            />

            {isOpen && <CycleConfigSection projectId={projectId} />}

            <EstimationSection projectId={projectId} current={(project?.estimation_method ?? 'none') as EstimationMethod} />

            <DoneCleanupSection projectId={projectId} current={project?.hide_done_after_days ?? null} />

            <AutoArchiveSection projectId={projectId} current={project?.auto_archive_after_days ?? null} />

            {confirmModeChange && (
              <div className="mt-2 p-4 bg-yellow-900/20 border border-yellow-700/40 rounded-xl">
                <p className="text-sm text-yellow-300 mb-3">
                  Switching to Open mode will reset the board to 3 fixed columns. Custom statuses are preserved but not used.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => applyModeChange(confirmModeChange)}
                    className="bg-yellow-600 hover:bg-yellow-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    Switch to Open
                  </button>
                  <button
                    onClick={() => setConfirmModeChange(null)}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-4 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Statuses tab ─────────────────────────────────────────────────── */}
        {tab === 'statuses' && (
          <div>
            {isOpen && (
              <div className="mb-4 p-3 bg-gray-900 rounded-xl border border-gray-800 text-sm text-gray-500">
                Flow mode uses fixed statuses. Switch to Guided or Enforced to customise.
              </div>
            )}

            <ul className="divide-y divide-gray-800 mb-6">
              {statuses.map((s) => (
                <StatusRow
                  key={s.id}
                  status={s}
                  isOpen={isOpen}
                  onRename={(id, name) => updateStatus.mutate({ statusId: id, data: { name } })}
                  onRecolor={(id, color) => updateStatus.mutate({ statusId: id, data: { color } })}
                  onDelete={(id) => deleteStatus.mutate(id)}
                />
              ))}
            </ul>

            {!isOpen && (
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Name</label>
                  <input
                    type="text"
                    placeholder="Status name"
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddStatus() }}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand w-44"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <label className="text-xs text-gray-500">Category</label>
                  <select
                    value={newStatusCategory}
                    onChange={(e) => setNewStatusCategory(e.target.value as StatusCategory)}
                    className="max-w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand"
                  >
                    {(Object.keys(CATEGORY_LABELS) as StatusCategory[]).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500">Color</label>
                  <div className="flex gap-1">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${newStatusColor === c ? 'ring-2 ring-white' : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setNewStatusColor(c)}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleAddStatus}
                  disabled={!newStatusName.trim() || createStatus.isPending}
                  aria-label="Add status"
                  className="flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40 self-end"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
            )}

            <CustomFieldsSection projectId={projectId} mode={currentMode} />
            <AutomationSection projectId={projectId} mode={currentMode} />
          </div>
        )}

        {/* ── Transitions tab ──────────────────────────────────────────────── */}
        {tab === 'transitions' && (
          <div>
            {currentMode !== 'enforced' && (
              <div className="mb-4 p-3 bg-gray-900 rounded-xl border border-gray-800 text-sm text-gray-500">
                Transition rules only apply in <strong className="text-gray-400">Enforced</strong> mode. Switch to Enforced to activate them.
              </div>
            )}

            <div className="mb-6">
              {transitions.length === 0 ? (
                <p className="text-sm text-gray-600">No transition rules defined. All status changes are allowed.</p>
              ) : (
                <ul className="divide-y divide-gray-800">
                  {transitions.map((rule) => {
                    const from = statuses.find((s) => s.id === rule.from_status_id)
                    const to = statuses.find((s) => s.id === rule.to_status_id)
                    return (
                      <li key={rule.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 group">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: from?.color ?? '#6b7280' }}
                        />
                        <span className="text-sm text-gray-300">{from?.name ?? rule.from_status_id}</span>
                        <span className="text-gray-600 text-xs">→</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: to?.color ?? '#6b7280' }}
                        />
                        <span className="text-sm text-gray-300">{to?.name ?? rule.to_status_id}</span>
                        {rule.issue_type && (
                          <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                            {rule.issue_type}
                          </span>
                        )}
                        {rule.require_role && (
                          <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded ml-auto">
                            {rule.require_role}+
                          </span>
                        )}
                        <button
                          onClick={() => deleteTransition.mutate(rule.id)}
                          className="opacity-0 group-hover:opacity-100 ml-auto text-gray-600 hover:text-red-400 transition-all"
                          aria-label="Delete rule"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs text-gray-500">From</label>
                <select
                  value={transFromId}
                  onChange={(e) => setTransFromId(e.target.value)}
                  className="max-w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand"
                >
                  <option value="">Select status</option>
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <span className="text-gray-600 text-lg self-end pb-2">→</span>
              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs text-gray-500">To</label>
                <select
                  value={transToId}
                  onChange={(e) => setTransToId(e.target.value)}
                  className="max-w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand"
                >
                  <option value="">Select status</option>
                  {statuses.filter((s) => s.id !== transFromId).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <label className="text-xs text-gray-500">Issue type (optional)</label>
                <select
                  value={transIssueType}
                  onChange={(e) => setTransIssueType(e.target.value as IssueType | '')}
                  className="max-w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-300 focus:outline-none focus:border-brand"
                >
                  <option value="">All types</option>
                  <option value="epic">Epic</option>
                  <option value="story">Story</option>
                  <option value="task">Task</option>
                  <option value="bug">Bug</option>
                </select>
              </div>
              <button
                onClick={handleAddTransition}
                disabled={!transFromId || !transToId || createTransition.isPending}
                className="flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40 self-end"
              >
                <Plus size={14} /> Add Rule
              </button>
            </div>
          </div>
        )}
        {/* ── Priorities tab ────────────────────────────────────────────────── */}
        {tab === 'priorities' && (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Priority levels are used to classify task urgency. In <strong className="text-gray-200">Guided</strong> or <strong className="text-gray-200">Enforced</strong> mode, editing a level forks the global scheme into a project-specific copy.
            </p>

            <ul className="divide-y divide-gray-800 mb-6">
              {priorityItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5 group">
                  {editingPriorityId === item.id ? (
                    <>
                      <input
                        type="color"
                        value={editingPriorityColor}
                        onChange={(e) => setEditingPriorityColor(e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
                      />
                      <input
                        className="flex-1 bg-gray-800 border border-brand rounded px-2 py-1 text-sm text-gray-100 focus:outline-none"
                        value={editingPriorityName}
                        onChange={(e) => setEditingPriorityName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updatePriority.mutate({ itemId: item.id, name: editingPriorityName, color: editingPriorityColor })
                            setEditingPriorityId(null)
                          }
                          if (e.key === 'Escape') setEditingPriorityId(null)
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          updatePriority.mutate({ itemId: item.id, name: editingPriorityName, color: editingPriorityColor })
                          setEditingPriorityId(null)
                        }}
                        className="text-brand hover:text-brand/80 text-xs"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingPriorityId(null)} className="text-gray-600 hover:text-gray-400 text-xs">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="flex-1 text-sm text-gray-300">{item.name}</span>
                      <button
                        onClick={() => {
                          setEditingPriorityId(item.id)
                          setEditingPriorityName(item.name)
                          setEditingPriorityColor(item.color)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-xs text-gray-500 hover:text-gray-300 transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deletePriority.mutate(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all ml-1"
                        aria-label="Delete priority"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={newPriorityColor}
                onChange={(e) => setNewPriorityColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
              />
              <input
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-brand transition-colors"
                placeholder="New priority level name"
                value={newPriorityName}
                onChange={(e) => setNewPriorityName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPriorityName.trim()) {
                    createPriority.mutate({ name: newPriorityName.trim(), color: newPriorityColor })
                    setNewPriorityName('')
                    setNewPriorityColor('#888888')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (!newPriorityName.trim()) return
                  createPriority.mutate({ name: newPriorityName.trim(), color: newPriorityColor })
                  setNewPriorityName('')
                  setNewPriorityColor('#888888')
                }}
                disabled={!newPriorityName.trim() || createPriority.isPending}
                className="flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        )}

        {/* ── Defaults tab (HW-18) ─────────────────────────────────────────── */}
        {tab === 'defaults' && (
          <DefaultAssigneeSection
            projectId={projectId}
            mode={project?.default_assignee_mode ?? 'unassigned'}
            assigneeId={project?.default_assignee_id ?? null}
          />
        )}

        {tab === 'templates' && (
          <>
            <TaskTemplatesSection projectId={projectId} />
            <RecurringTasksSection projectId={projectId} />
          </>
        )}

        {tab === 'integrations' && (
          <>
            <IntegrationsSection projectId={projectId} />
            <WebhooksSection projectId={projectId} />
            <ImportSection projectId={projectId} />
          </>
        )}

        {/* ── Members tab (REQ-165) ────────────────────────────────────────── */}
        {tab === 'members' && <MembersSection projectId={projectId} />}

      </div>
    </div>
  )
}

// ── Default assignee (HW-18) ──────────────────────────────────────────────────
const DEFAULT_ASSIGNEE_OPTIONS: { value: DefaultAssigneeMode; label: string; hint: string }[] = [
  { value: 'unassigned', label: 'Unassigned', hint: 'New tasks start with nobody assigned.' },
  { value: 'creator', label: 'Creator', hint: 'Whoever creates the task is assigned it.' },
  { value: 'member', label: 'Specific member', hint: 'Always assign the same person — useful for a triage queue.' },
]

function DefaultAssigneeSection({ projectId, mode, assigneeId }: {
  projectId: string
  mode: DefaultAssigneeMode
  assigneeId: string | null
}) {
  const { data: members = [] } = useMembers(projectId)
  const update = useUpdateDefaultAssignee()
  // Local draft so picking "Specific member" can reveal the dropdown before saving.
  const [draftMode, setDraftMode] = useState<DefaultAssigneeMode>(mode)
  const [draftAssignee, setDraftAssignee] = useState<string | null>(assigneeId)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Re-seed the draft whenever the server value changes (initial load, other tabs).
  useEffect(() => { setDraftMode(mode); setDraftAssignee(assigneeId) }, [mode, assigneeId])

  const needsMember = draftMode === 'member'
  const canSave = !needsMember || !!draftAssignee

  async function save() {
    setError('')
    setSaved(false)
    try {
      await update.mutateAsync({ id: projectId, mode: draftMode, assigneeId: draftAssignee })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      setError(msg ?? 'Failed to save the default assignee.')
    }
  }

  return (
    <div className="p-4 bg-gray-900 border border-gray-700 rounded-xl max-w-2xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Default assignee</p>
      <p className="text-xs text-gray-500 mb-4">
        Who gets a new task when the person creating it doesn't pick someone. Choosing an
        assignee explicitly on the task always wins. Applies to every creation path —
        the board, the API, imports and recurring tasks.
      </p>

      <div className="space-y-2 mb-4">
        {DEFAULT_ASSIGNEE_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="radio"
              name="default-assignee-mode"
              value={o.value}
              checked={draftMode === o.value}
              onChange={() => setDraftMode(o.value)}
              className="w-4 h-4 mt-0.5 accent-brand"
            />
            <span>
              <span className="text-sm text-gray-200 block">{o.label}</span>
              <span className="text-xs text-gray-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {needsMember && (
        <div className="mb-4 pl-7">
          <label htmlFor="default-assignee-member" className="block text-xs text-gray-400 mb-1">
            Assign new tasks to
          </label>
          <select
            id="default-assignee-member"
            aria-label="Default assignee member"
            value={draftAssignee ?? ''}
            onChange={(e) => setDraftAssignee(e.target.value || null)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand max-w-full"
          >
            <option value="">Select a member…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.username || `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            If this person later leaves the project, the setting resets to Unassigned.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!canSave || update.isPending}
          className="bg-brand hover:brightness-110 text-white text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-40"
        >
          Save
        </button>
        {saved && <span className="text-xs text-green-400">Saved ✓</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}

// ── Custom fields ─────────────────────────────────────────────────────────────
const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'checkbox', label: 'Checkbox' },
]
const CF_INPUT = 'bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand'

function CustomFieldsSection({ projectId, mode }: { projectId: string; mode: ProjectMode }) {
  const { data: fields = [] } = useCustomFields(projectId, mode !== 'open')
  const create = useCreateCustomField(projectId)
  const del = useDeleteCustomField(projectId)
  const [name, setName] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [options, setOptions] = useState('')
  const [required, setRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (mode === 'open') return null  // Flow has no custom fields

  async function add() {
    if (!name.trim()) return
    setError(null)
    try {
      await create.mutateAsync({
        name: name.trim(),
        field_type: type,
        required,
        options: type === 'select' ? options.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      })
      setName(''); setOptions(''); setRequired(false); setType('text')
    } catch {
      setError('Could not add field — a Select field needs at least one option.')
    }
  }

  return (
    <div className="mt-6 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Custom fields</p>
      <p className="text-xs text-gray-500 mb-3">
        Admin-defined fields shown on every task. {mode === 'enforced' ? 'Required fields block saving when empty.' : 'All optional in Guided mode.'}
      </p>
      {fields.length > 0 && (
        <ul className="mb-3 divide-y divide-gray-800">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-300">
                {f.name} <span className="text-xs text-gray-500">· {f.field_type}{f.required ? ' · required' : ''}</span>
              </span>
              <button onClick={() => del.mutate(f.id)} className="text-gray-600 hover:text-red-400 transition-colors" aria-label="Delete field">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name" className={`${CF_INPUT} flex-1 min-w-[120px]`} />
        <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)} className={CF_INPUT}>
          {FIELD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {type === 'select' && (
          <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="opt1, opt2, opt3" className={`${CF_INPUT} flex-1 min-w-[120px]`} />
        )}
        {mode === 'enforced' && (
          <label className="flex items-center gap-1 text-xs text-gray-400">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="accent-brand" /> required
          </label>
        )}
        <button onClick={add} disabled={!name.trim() || create.isPending} className="flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40">
          <Plus size={14} /> Add
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  )
}

// ── Estimation method ─────────────────────────────────────────────────────────
const ESTIMATION_OPTIONS: { value: EstimationMethod; label: string; hint: string; ready: boolean }[] = [
  { value: 'none', label: 'Off', hint: 'No estimation.', ready: true },
  { value: 'story_points', label: 'Story Points', hint: 'Classic points + velocity, capacity, sprint report.', ready: true },
  { value: 'flow', label: 'Flow', hint: 'Forecast delivery from throughput (Monte Carlo).', ready: true },
  { value: 'baseline', label: 'Baseline', hint: 'Local effort prediction from similar past tasks.', ready: true },
  { value: 'impact', label: 'Impact', hint: 'Prioritise by value ÷ effort (WSJF-lite).', ready: true },
]

function EstimationSection({ projectId, current }: { projectId: string; current: EstimationMethod }) {
  const update = useUpdateEstimationMethod(projectId)
  return (
    <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Estimation & measurement</p>
      <p className="text-xs text-gray-500 mb-3">How this project sizes and forecasts work. See the team handbook for the difference between methods.</p>
      <div className="flex flex-col gap-2">
        {ESTIMATION_OPTIONS.map((o) => (
          <button
            key={o.value}
            disabled={!o.ready || update.isPending}
            onClick={() => update.mutate(o.value)}
            className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-left px-3 py-2 rounded-lg border transition-colors ${
              current === o.value ? 'border-brand bg-brand/10' : 'border-gray-700 hover:bg-gray-800'
            } ${!o.ready ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <span className="text-sm text-gray-200 flex-shrink-0">{o.label}</span>
            <span className="text-xs text-gray-500">{o.ready ? o.hint : 'coming soon'}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Done column cleanup (REQ-138) ─────────────────────────────────────────────
const HIDE_DONE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Off' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

function TaskCreationSection({
  projectId, current, isOpen, statuses, onToggleAllowOnCreate,
}: {
  projectId: string
  current: CreationStatusPolicy
  isOpen: boolean
  statuses: ProjectStatus[]
  onToggleAllowOnCreate: (statusId: string, value: boolean) => void
}) {
  const updatePolicy = useUpdateCreationPolicy(projectId)
  return (
    <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Task creation</p>
      <p className="text-xs text-gray-500 mb-3">
        Which statuses can a task be born in? Switching modes resets this to the mode's default
        (Enforced → Initial only; Flow and Guided → Any status).
      </p>
      <div className="space-y-2">
        {CREATION_POLICIES.map((p) => (
          <label key={p.id} className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="radio"
              name="creation-policy"
              checked={current === p.id}
              onChange={() => updatePolicy.mutate(p.id)}
              disabled={updatePolicy.isPending}
              className="w-4 h-4 mt-0.5 accent-brand"
            />
            <span>
              <span className="text-sm text-gray-200 block">{p.label}</span>
              <span className="text-xs text-gray-500">{p.description}</span>
            </span>
          </label>
        ))}
      </div>
      {current === 'curated' && (
        isOpen ? (
          <p className="text-xs text-yellow-400/80 mt-3">
            Flow mode has fixed statuses — Curated behaves like Initial only (tasks start in To Do).
          </p>
        ) : (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-400 mb-2">Allowed creation statuses:</p>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={s.allow_on_create ?? false}
                    onChange={(e) => onToggleAllowOnCreate(s.id, e.target.checked)}
                    className="w-3.5 h-3.5 accent-brand"
                  />
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-gray-200">{s.name}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              Nothing checked = tasks start on the initial status.
            </p>
          </div>
        )
      )}
    </div>
  )
}


function DoneCleanupSection({ projectId, current }: { projectId: string; current: number | null }) {
  const update = useUpdateHideDoneAfterDays()
  return (
    <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Done column cleanup</p>
      <p className="text-xs text-gray-500 mb-3">
        Hide completed tasks from the board after a period. Hidden tasks stay in search, reports and exports;
        anyone can reveal them with “Show older” on the Done column.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {HIDE_DONE_OPTIONS.map((o) => (
          <button
            key={o.label}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: projectId, days: o.value })}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              current === o.value ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Auto-archive (REQ-161) ────────────────────────────────────────────────────
function AutoArchiveSection({ projectId, current }: { projectId: string; current: number | null }) {
  const update = useUpdateAutoArchiveAfterDays()
  return (
    <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Auto-archive completed tasks</p>
      <p className="text-xs text-gray-500 mb-3">
        Archive tasks automatically after they've been done for a period. Archived tasks leave boards,
        search, and stats entirely (unlike the cleanup above) but stay restorable from the Issues page
        and are always included in exports.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {HIDE_DONE_OPTIONS.map((o) => (
          <button
            key={`aa-${o.label}`}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: projectId, days: o.value })}
            className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              current === o.value ? 'border-brand bg-brand/10 text-brand' : 'border-gray-700 text-gray-400 hover:bg-gray-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Flow-mode automated cycle config ──────────────────────────────────────────
function CycleConfigSection({ projectId }: { projectId: string }) {
  const { data: config } = useCycleConfig(projectId)
  const updateConfig = useUpdateCycleConfig(projectId)
  const today = new Date().toISOString().slice(0, 10)

  const [enabled, setEnabled] = useState(true)
  const [duration, setDuration] = useState(2)
  const [cooldown, setCooldown] = useState(0)
  const [anchor, setAnchor] = useState(today)
  const [upcoming, setUpcoming] = useState(2)
  const [seeded, setSeeded] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config && !seeded) {
      setEnabled(config.enabled)
      setDuration(config.duration_weeks)
      setCooldown(config.cooldown_days)
      setAnchor(config.start_anchor)
      setUpcoming(config.upcoming_count)
      setSeeded(true)
    }
  }, [config, seeded])

  async function save() {
    await updateConfig.mutateAsync({
      enabled,
      duration_weeks: duration,
      cooldown_days: cooldown,
      start_anchor: anchor,
      upcoming_count: upcoming,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const numField = (label: string, value: number, onChange: (n: number) => void, min: number, max: number, hint: string) => (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand"
      />
      <span className="ml-2 text-xs text-gray-600">{hint}</span>
    </div>
  )

  return (
    <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Automated cycles</p>
      <p className="text-xs text-gray-500 mb-3">
        Flow runs work in repeating time-boxed cycles. Unfinished tasks roll forward automatically when a cycle ends — no manual sprint management.
      </p>
      <label className="flex items-center gap-3 cursor-pointer select-none mb-3">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
        <span className="text-sm text-gray-300">Enable automated cycles</span>
      </label>
      {enabled && (
        <div className="flex flex-wrap gap-5 mb-3">
          {numField('Duration (weeks)', duration, setDuration, 1, 8, '1–8')}
          {numField('Cooldown (days)', cooldown, setCooldown, 0, 7, '0–7 gap between cycles')}
          {numField('Upcoming cycles', upcoming, setUpcoming, 1, 6, 'pre-created ahead')}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Start anchor</label>
            <input
              type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand"
            />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={updateConfig.isPending}
          className="bg-brand hover:brightness-110 text-white text-sm px-4 py-2 rounded-lg transition-all disabled:opacity-40"
        >
          Save cycle settings
        </button>
        {saved && <span className="text-xs text-green-400">Saved ✓</span>}
      </div>
    </div>
  )
}
