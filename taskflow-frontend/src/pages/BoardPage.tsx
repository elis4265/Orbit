import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import type { SpecialTab } from '../components/BoardTabs'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'

// Pointer-first collision so narrow (collapsed) column drop targets win when the
// cursor is over them; fall back to rect overlap for normal sortable reordering.
const boardCollisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args)
  return pointer.length > 0 ? pointer : rectIntersection(args)
}
import { LayoutGrid, LayoutList, Calendar, GanttChartSquare, X, AlertTriangle, Bookmark, BookmarkCheck, AlignJustify, Grid2x2, Flag, Map as MapIcon, Plus } from 'lucide-react'
import { useTheme, type ThemePreference } from '../context/ThemeContext'
import { useMe } from '../hooks/useAuth'
import { useProjects, useCreateProject } from '../hooks/useProjects'
import { useBoards, useCreateBoard, useRenameBoard, useDeleteBoard, useUpdateBoardFilter } from '../hooks/useBoards'
import { useTasks, useTask, useUpdateTask, useDeleteTask, useReorderTasks, useBulkUpdateTasks, useProjectTasks } from '../hooks/useTasks'
import { useProjectSocket } from '../hooks/useProjectSocket'
import { useMembers } from '../hooks/useMembers'
import { useTags } from '../hooks/useTags'
import { useKeyBindings } from '../hooks/useKeyBindings'
import { useAppShell } from '../components/AppShell'
import KeyboardShortcutsHelp from '../components/KeyboardShortcutsHelp'
import Column from '../components/Column'
import TaskCard from '../components/TaskCard'
import ListView from '../components/ListView'
import BulkEditBar from '../components/BulkEditBar'
import MobileBoard, { type MobileColumn } from '../components/MobileBoard'
import IssueTypeBadge from '../components/IssueTypeBadge'
import CalendarView from '../components/CalendarView'
import GanttView from '../components/GanttView'
import RoadmapView from '../components/RoadmapView'
import SmartFilterBar, { type ActiveFilter } from '../components/SmartFilterBar'
import ProjectFilterBar from '../components/ProjectFilterBar'
import CreateTaskModal from '../components/CreateTaskModal'
import TaskDetailModal from '../components/TaskDetailModal'
import CommandPalette, { type Command } from '../components/CommandPalette'
import SprintPanel from '../components/SprintPanel'
import CreateProjectModal from '../components/CreateProjectModal'
import BoardTabs from '../components/BoardTabs'
import BoardMobileControls from '../components/BoardMobileControls'
import { taskLinkApi, taskApi, projectTaskApi } from '../api/client'
import { useProjectStatuses, useProjectTransitions } from '../hooks/useProjectStatuses'
import { useProjectPriorities } from '../hooks/usePriorities'
import { useSprints } from '../hooks/useSprints'
import { useBoardViewState, type SwimlaneMode } from '../hooks/useBoardViewState'
import { initialBoardViewMode, VIEW_PREFERENCE_KEY, type BoardViewMode } from '../lib/viewport'
import { applyTaskFilters } from '../lib/taskFilter'
import { landingProject, readLastProjectSeg } from '../lib/lastProject'
import { resolveProjectId } from '../lib/projectResolve'
import { canManageProject } from '../lib/rbac'
import { epicDoneGateCount } from '../lib/epicGate'
import { useRelatedToMe } from '../hooks/useRelatedToMe'
import { packGridPositions, tasksToGridReorderItems, nextFreeCell } from '../lib/gridPacker'
import { useSavedSearches, useCreateSavedSearch, useDeleteSavedSearch } from '../hooks/useSavedSearches'
import type { TaskStatus, TaskCreate, TaskUpdate, IssueType, Task, User, Project, PriorityItem, ProjectMember, ProjectMode } from '../types'

interface ColumnDef {
  id: string
  label: string
  labelColor?: string
  taskStatus: TaskStatus
  isCustom: boolean
  wipLimit?: number | null
}

const OPEN_COLUMNS: ColumnDef[] = [
  { id: 'todo',        label: 'To Do',       taskStatus: 'todo',        isCustom: false },
  { id: 'in_progress', label: 'In Progress',  taskStatus: 'in_progress', isCustom: false },
  { id: 'done',        label: 'Done',         taskStatus: 'done',        isCustom: false },
]

const CATEGORY_TO_STATUS: Record<string, TaskStatus> = {
  unstarted: 'todo',
  started: 'in_progress',
  completed: 'done',
  cancelled: 'done',
}

function getTaskColumnId(task: Task, isCustomMode: boolean, effectiveColumns?: ColumnDef[]): string {
  if (isCustomMode && task.custom_status_id) return task.custom_status_id
  if (isCustomMode && effectiveColumns) {
    // task was created in Open mode — map it to first column in the matching category
    const match = effectiveColumns.find((c) => c.taskStatus === task.status) ?? effectiveColumns[0]
    return match?.id ?? task.status
  }
  return task.status
}

// The URL carries the project KEY (e.g. /projects/ORB); resolve it to the id.
// A raw id is still accepted (legacy / post-auth redirects) for backward compat.
// No param (landing at '/') → last-visited project, so the pre-redirect render
// already shows the right board instead of flashing the first one.
// '' while unresolved (projects loading / unknown key) — never the raw key, so
// project-scoped queries stay disabled instead of 422ing on UUID path params.
function resolveWorkspaceId(param: string | undefined, list: Project[]): string {
  if (!param) return landingProject(list, readLastProjectSeg())?.id ?? ''
  return resolveProjectId(param, list)
}
// The URL segment for a project id — its key when known, else the id.
function projectSeg(list: Project[], id: string | undefined): string {
  if (!id) return ''
  return list.find((p) => p.id === id)?.key ?? id
}
function resolveBoardId(id: string | null): string {
  return id ?? ''
}
function findDetailTask(tasks: Task[], id: string | null): Task | null {
  return id ? tasks.find((t) => t.id === id) ?? null : null
}
function resolveUserId(user: User | undefined): string {
  return user?.id ?? ''
}
function resolveIsAdmin(list: Project[], wsId: string, user: User | undefined): boolean {
  return list.find((w) => w.id === wsId)?.owner_id === user?.id
}


export default function BoardPage() {
  const { workspaceId: paramWsId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { preference, setPreference } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const shell = useAppShell()
  const { data: user } = useMe()
  const { data: _projectsRaw, isLoading: projectsLoading } = useProjects()
  const projects: Project[] = useMemo(
    () => Array.isArray(_projectsRaw) ? _projectsRaw : [],
    [_projectsRaw]
  )
  const createProject = useCreateProject()

  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const autoOpenedCreateRef = useRef(false)
  // First run: a freshly registered user has no projects — open the create dialog
  // once so they land on a guided choice instead of a bare empty board.
  // HW-37: creation is superuser-only, so everyone else gets the invite-me
  // empty state instead of a dialog whose submit would 403.
  useEffect(() => {
    if (!projectsLoading && projects.length === 0 && user?.is_superuser && !autoOpenedCreateRef.current) {
      autoOpenedCreateRef.current = true
      setCreateProjectOpen(true)
    }
  }, [projectsLoading, projects.length, user?.is_superuser])

  const [showHelp, setShowHelp] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Resolve workspace: URL param (key or id) → first workspace → empty
  const workspaceId = resolveWorkspaceId(paramWsId, projects)
  // URL segment for the current project (its key) — keep UUIDs out of the address bar
  const wsSeg = projectSeg(projects, workspaceId)

  // Landing at '/' (fresh login, logo click): go to the last-visited project,
  // falling back to the first only when nothing is remembered or it's gone.
  function redirectToLandingProject() {
    if (!paramWsId && projects.length > 0) {
      const target = landingProject(projects, readLastProjectSeg())
      if (target) navigate(`/projects/${target.key ?? target.id}`, { replace: true })
    }
  }
  useEffect(redirectToLandingProject, [paramWsId, projects, navigate])

  // Normalize any UUID landing (login / notification / invite / old bookmark) to the
  // pretty key URL, once the project resolves — so the address bar never shows a UUID.
  useEffect(() => {
    const proj = projects.find((p) => p.id === workspaceId)
    if (proj?.key && paramWsId && paramWsId !== proj.key) {
      const qs = searchParams.toString()
      navigate(`/projects/${proj.key}${qs ? `?${qs}` : ''}`, { replace: true })
    }
  }, [paramWsId, workspaceId, projects, searchParams, navigate])

  useProjectSocket(workspaceId)

  const { data: boards = [] } = useBoards(workspaceId)
  const createBoard = useCreateBoard(workspaceId)
  const renameBoard = useRenameBoard(workspaceId)
  const deleteBoard = useDeleteBoard(workspaceId)

  const { data: members = [] } = useMembers(workspaceId)
  const memberMap: Record<string, typeof members[0]> = Object.fromEntries(
    members.map((m) => [m.id, m])
  )

  const { data: allTags = [] } = useTags(workspaceId)
  const { data: projectStatuses = [] } = useProjectStatuses(workspaceId || undefined)
  const { data: priorityItems = [] } = useProjectPriorities(workspaceId || undefined)
  const priorityMap: Record<string, PriorityItem> = Object.fromEntries(priorityItems.map((p) => [p.id, p]))

  // Resolve active project and its mode
  const activeProject = projects.find((p) => p.id === workspaceId)
  const projectMode = activeProject?.mode ?? 'open'

  const isCustomMode = projectMode !== 'open' && projectStatuses.length > 0
  const isEnforced = projectMode === 'enforced'
  const { data: transitions = [] } = useProjectTransitions(isEnforced ? (workspaceId || undefined) : undefined)

  // Build effective columns: Open → 3 fixed; Guided/Enforced → one per ProjectStatus
  const effectiveColumns = useMemo((): ColumnDef[] => {
    if (!isCustomMode) return OPEN_COLUMNS
    return [...projectStatuses]
      .filter((ps) => ps.is_active)
      .sort((a, b) => a.position - b.position)
      .map((ps) => ({
        id: ps.id,
        label: ps.name,
        labelColor: ps.color,
        taskStatus: CATEGORY_TO_STATUS[ps.category] ?? 'todo',
        isCustom: true,
        wipLimit: ps.wip_limit ?? null,
      }))
  }, [isCustomMode, projectStatuses])

  // Stored preference wins; with none, phones start in 'list' (kanban is unusable there).
  // Nothing is persisted here — only an explicit pick in handleViewMode writes storage.
  const [viewMode, setViewMode] = useState<BoardViewMode>(initialBoardViewMode)

  function handleViewMode(mode: BoardViewMode) {
    setViewMode(mode)
    localStorage.setItem(VIEW_PREFERENCE_KEY, mode)
  }

  // The selected board lives in the URL by its name (?board=Main). Plain state setter
  // (so auto-select is a no-op when unchanged); a guarded effect reflects the name to
  // the URL — the guard prevents a history-spam loop while `boards` is briefly empty.
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  useEffect(() => {
    const board = boards.find((b) => b.id === activeBoardId)
    const want = board ? board.name : null
    const cur = searchParams.get('board') ?? null
    if (cur === want) return
    const p = new URLSearchParams(searchParams)
    if (want) p.set('board', want)
    else p.delete('board')
    setSearchParams(p, { replace: true })
  }, [activeBoardId, boards, searchParams, setSearchParams])
  const [activeSpecialTab, setActiveSpecialTab] = useState<SpecialTab | null>(null)

  function autoSelectBoard() {
    if (boards.length === 0) {
      if (activeBoardId) setActiveBoardId(null)
      return
    }
    if (activeBoardId && boards.find((b) => b.id === activeBoardId)) return  // already valid
    const param = searchParams.get('board')
    const byName = param ? boards.find((b) => b.name.toLowerCase() === param.toLowerCase()) : null
    setActiveBoardId(byName?.id ?? boards[0].id)
  }
  useEffect(autoSelectBoard, [boards, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  const boardId = resolveBoardId(activeBoardId)

  const { data: sprints = [] } = useSprints(workspaceId, boardId)
  const activeSprint = sprints.find((s) => s.status === 'active') ?? null
  const hasActiveSprint = !!activeSprint

  const { data: backlogTasks = [] } = useProjectTasks(workspaceId, 'none')
  const { data: activeSprintTasks = [] } = useProjectTasks(
    workspaceId,
    activeSprint?.id,
  )

  const {
    swimlaneMode, setSwimlaneMode,
    compact, setCompact,
    gridMode, setGridMode,
    activeFilters, setActiveFilters,
    collapsedColumns, setCollapsedColumns,
    projectFilterActive, setProjectFilterActive,
    sprintScope, setSprintScope,
  } = useBoardViewState(boardId)

  // REQ-140: with a running sprint, the main board defaults to that sprint's tasks only.
  // Applies to the main board tab exclusively — Backlog/Active Sprint tabs have their own scope.
  const sprintScopeActive = hasActiveSprint && sprintScope === 'active'
  const inSprintScope = useCallback(
    (t: Task): boolean => !sprintScopeActive || t.sprint_id === activeSprint!.id,
    [sprintScopeActive, activeSprint],
  )

  const qc = useQueryClient()
  // REQ-139: per-user, per-session escape hatch revealing tasks hidden by hide_done_after_days.
  const [showOldDone, setShowOldDone] = useState(false)
  const hideDoneActive = activeProject?.hide_done_after_days != null
  const { data: tasks = [] } = useTasks(workspaceId, boardId, hideDoneActive && showOldDone)

  const updateTask = useUpdateTask(workspaceId)
  const deleteTask = useDeleteTask(workspaceId)
  const reorderTasks = useReorderTasks(workspaceId, boardId)
  const bulkUpdateTasks = useBulkUpdateTasks(workspaceId)

  const { data: savedSearches = [] } = useSavedSearches(workspaceId)
  const createSavedSearch = useCreateSavedSearch(workspaceId)
  const deleteSavedSearch = useDeleteSavedSearch(workspaceId)
  const [savedSearchPanelOpen, setSavedSearchPanelOpen] = useState(false)
  // Below md the secondary toolbar controls live in a bottom sheet (see BoardMobileControls).
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false)
  const [sprintPanelOpen, setSprintPanelOpen] = useState(false)
  const [saveSearchName, setSaveSearchName] = useState('')
  const [savingSearch, setSavingSearch] = useState(false)

  // ── Project (admin-defined) board scope filter ──────────────────────────────
  const updateBoardFilter = useUpdateBoardFilter(workspaceId)
  const isProjectAdmin = canManageProject(activeProject, user?.id, members)

  const currentBoard = boards.find((b) => b.id === boardId)
  const projectFilter = useMemo(
    () => ((currentBoard?.filter_config?.filters ?? []) as unknown as ActiveFilter[]),
    [currentBoard],
  )
  // enforced → always applied; guided → applied unless the user disabled it; open → never.
  const projectFilterApplies =
    projectFilter.length > 0 &&
    (projectMode === 'enforced' || (projectMode === 'guided' && projectFilterActive))

  // HW-13: a board may scope itself to a subset of the project's statuses via its own
  // filter — one board shows To Do / In Progress / Done, another Research / Conclude.
  // Statuses stay project-level (DD-043: a board is a filtered view); only the columns
  // this board renders are narrowed. effectiveColumns stays complete everywhere else,
  // so status resolution and drag logic still see every status.
  const visibleColumns = useMemo((): ColumnDef[] => {
    if (!projectFilterApplies) return effectiveColumns
    const statusFilters = projectFilter.filter((f) => f.fieldId === 'status')
    if (statusFilters.length === 0) return effectiveColumns
    const keep = statusFilters.filter((f) => !f.negate).map((f) => f.value)
    const drop = new Set(statusFilters.filter((f) => f.negate).map((f) => f.value))
    const keyOf = (c: ColumnDef) => (isCustomMode ? c.id : c.taskStatus)
    const narrowed = effectiveColumns.filter((c) => {
      const key = keyOf(c)
      if (drop.has(key)) return false
      return keep.length === 0 || keep.includes(key)
    })
    // Never render an empty board — a filter that matches nothing falls back to all.
    return narrowed.length > 0 ? narrowed : effectiveColumns
  }, [effectiveColumns, projectFilter, projectFilterApplies, isCustomMode])

  const relatedSets = useRelatedToMe(workspaceId)
  const passesFilters = useCallback(
    (t: Task): boolean => {
      if (projectFilterApplies && !applyTaskFilters(t, projectFilter, isCustomMode)) return false
      return applyTaskFilters(t, activeFilters, isCustomMode, relatedSets)
    },
    [projectFilterApplies, projectFilter, activeFilters, isCustomMode, relatedSets],
  )

  const [projectFilterEditorOpen, setProjectFilterEditorOpen] = useState(false)
  const [draftProjectFilter, setDraftProjectFilter] = useState<ActiveFilter[]>([])
  function openProjectFilterEditor() {
    setDraftProjectFilter(projectFilter)
    setProjectFilterEditorOpen(true)
  }
  // Tick/untick a status for this board — adds or removes a positive `status` filter
  // entry, leaving every other filter (type, assignee, …) untouched.
  function toggleBoardStatus(col: ColumnDef) {
    setDraftProjectFilter((prev) => {
      const on = prev.some((f) => f.fieldId === 'status' && !f.negate && f.value === col.id)
      if (on) return prev.filter((f) => !(f.fieldId === 'status' && !f.negate && f.value === col.id))
      return [...prev, {
        instanceId: `status-${col.id}-${Date.now()}`,
        fieldId: 'status',
        fieldLabel: 'Status',
        value: col.id,
        label: col.label,
        color: col.labelColor,
        negate: false,
      }]
    })
  }

  async function saveProjectFilter() {
    if (!boardId) return
    await updateBoardFilter.mutateAsync({
      boardId,
      filterConfig: draftProjectFilter.length
        ? { filters: draftProjectFilter as unknown as Record<string, unknown>[] }
        : null,
    })
    setProjectFilterEditorOpen(false)
  }

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())

  function handleSelectToggle(id: string) {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() { setSelectedTaskIds(new Set()) }

  async function handleBulkStatus(status: TaskStatus) {
    // Quick buttons for open mode; goes through the validated REQ-157 endpoint
    await bulkUpdateTasks.mutateAsync({ task_ids: [...selectedTaskIds], status })
    clearSelection()
  }

  async function handleBulkDelete() {
    for (const id of selectedTaskIds) deleteTask.mutate(id)
    clearSelection()
  }

  // HW-21: mobile "Move to" — send the selection to a column. Custom mode targets the
  // custom status by id; Open mode targets the fixed enum. Bulk endpoint validates both.
  async function moveSelectedToColumn(col: MobileColumn) {
    if (!selectedTaskIds.size) return
    const task_ids = [...selectedTaskIds]
    await bulkUpdateTasks.mutateAsync(
      isCustomMode ? { task_ids, custom_status_id: col.id } : { task_ids, status: col.taskStatus as TaskStatus },
    )
    clearSelection()
  }

  const SWIMLANE_LABELS: Record<string, string> = {
    assignee: 'Assignee', priority: 'Priority', type: 'Type', epic: 'Epic',
  }

  // Local ordered state for optimistic drag reordering
  const [orderedTasks, setOrderedTasks] = useState<Task[]>([])
  const [dragging, setDragging] = useState(false)
  const [blockWarning, setBlockWarning] = useState<string | null>(null)
  // Pending "epic entering done with open children" confirmation — fires on every
  // single-task completion surface (drag, list edit), in every project mode.
  const [epicGateConfirm, setEpicGateConfirm] = useState<{ taskId: string; title: string; count: number; data: TaskUpdate } | null>(null)
  const dragTargetColRef = useRef<ColumnDef | null>(null)
  const dragTargetGroupRef = useRef<string | null>(null)

  const childCountMap = useMemo((): Map<string, number> => {
    const m = new Map<string, number>()
    for (const t of orderedTasks) {
      if (t.parent_id) m.set(t.parent_id, (m.get(t.parent_id) ?? 0) + 1)
    }
    return m
  }, [orderedTasks])

  function syncTaskOrder() {
    if (!dragging) setOrderedTasks(tasks)
  }
  useEffect(syncTaskOrder, [tasks, dragging])  

  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Set<string>>(new Set())

  function toggleSwimlane(id: string) {
    setCollapsedSwimlanes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  interface SwimlaneGroup { id: string; label: string; tasks: Task[] }

  function _groupByAssignee(tasks: Task[], mMap: Record<string, ProjectMember>): SwimlaneGroup[] {
    const groups = new Map<string, SwimlaneGroup>()
    for (const t of tasks) {
      const key = t.assignee_id ?? '_unassigned'
      if (!groups.has(key)) {
        const m = t.assignee_id ? mMap[t.assignee_id] : null
        const label = m
          ? (m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.username ?? m.email)
          : 'Unassigned'
        groups.set(key, { id: key, label, tasks: [] })
      }
      groups.get(key)!.tasks.push(t)
    }
    return [...groups.values()]
  }

  function _groupByPriority(tasks: Task[], pMap: Record<string, PriorityItem>): SwimlaneGroup[] {
    const groups = new Map<string, SwimlaneGroup>()
    for (const t of tasks) {
      const key = t.priority_id ?? '_none'
      if (!groups.has(key)) {
        const p = t.priority_id ? pMap[t.priority_id] : null
        groups.set(key, { id: key, label: p?.name ?? 'No Priority', tasks: [] })
      }
      groups.get(key)!.tasks.push(t)
    }
    return [...groups.values()]
  }

  function _groupByType(tasks: Task[]): SwimlaneGroup[] {
    const groups = new Map<string, SwimlaneGroup>()
    for (const t of tasks) {
      const key = t.issue_type ?? 'task'
      if (!groups.has(key))
        groups.set(key, { id: key, label: key.charAt(0).toUpperCase() + key.slice(1), tasks: [] })
      groups.get(key)!.tasks.push(t)
    }
    return [...groups.values()]
  }

  function _groupByEpic(sourceTasks: Task[]): SwimlaneGroup[] {
    // A lane for EVERY epic in the project (resolved from the full task list, since
    // an epic may sit outside the current filter / sprint). Empty lanes still show
    // so they're visible and act as drop targets for re-parenting.
    const allEpics = tasks.filter((t) => t.issue_type === 'epic')
    const groups = new Map<string, SwimlaneGroup>()
    for (const epic of allEpics) groups.set(epic.id, { id: epic.id, label: epic.title, tasks: [] })
    const noneGroup: SwimlaneGroup = { id: '_none', label: 'No Epic', tasks: [] }
    for (const t of sourceTasks) {
      if (t.issue_type === 'epic') continue
      const epic = t.parent_id ? groups.get(t.parent_id) : undefined
      if (epic) epic.tasks.push(t)
      else noneGroup.tasks.push(t)
    }
    groups.set('_none', noneGroup)
    return [...groups.values()]
  }

  // The group a task currently belongs to, for the active swimlane grouping.
  function taskGroupId(t: Task): string {
    if (swimlaneMode === 'assignee') return t.assignee_id ?? '_none'
    if (swimlaneMode === 'priority') return t.priority_id ?? '_none'
    if (swimlaneMode === 'type')     return t.issue_type ?? 'task'
    if (swimlaneMode === 'epic')     return (t.parent_id && tasks.some((e) => e.id === t.parent_id && e.issue_type === 'epic')) ? t.parent_id : '_none'
    return '_all'
  }

  function getSwimlaneGroups(sourceTasks: Task[]): SwimlaneGroup[] {
    if (swimlaneMode === 'none')     return [{ id: '_all', label: '', tasks: sourceTasks }]
    if (swimlaneMode === 'assignee') return _groupByAssignee(sourceTasks, memberMap)
    if (swimlaneMode === 'priority') return _groupByPriority(sourceTasks, priorityMap)
    if (swimlaneMode === 'type')     return _groupByType(sourceTasks)
    if (swimlaneMode === 'epic')     return _groupByEpic(sourceTasks)
    return [{ id: '_all', label: '', tasks: sourceTasks }]
  }

  function toggleCollapse(id: string) {
    setCollapsedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const [activeTask, setActiveTask] = useState<Task | null>(null)

  // While dragging in Enforced mode: which columns are legal drop targets for the
  // active task (its current column + statuses an active transition rule allows).
  // null ⇒ no restriction (Flow/Guided, or no drag).
  const dragAllowedColIds = useMemo((): Set<string> | null => {
    if (!activeTask || !isEnforced || !isCustomMode) return null
    const from = getTaskColumnId(activeTask, isCustomMode, effectiveColumns)
    const targets = transitions
      .filter((t) => t.from_status_id === from && t.is_active)
      .map((t) => t.to_status_id)
    return new Set([from, ...targets])
  }, [activeTask, isEnforced, isCustomMode, transitions, effectiveColumns])

  const [modalOpen, setModalOpen] = useState(false)
  const [modalStatus, setModalStatus] = useState<TaskStatus>('todo')
  const [modalCustomStatusId, setModalCustomStatusId] = useState<string | null>(null)
  // HW-14: when the board is grouped by epic, "+" inside a lane parents the new
  // task to that lane's epic. Null for the "No Epic" lane and other groupings.
  const [modalParent, setModalParent] = useState<{ id: string; label: string } | null>(null)
  // The open task lives in the URL as the human ticket key (?task=ORB-123) — derived,
  // single source of truth (no mirrored state → no history-spam loop).
  const taskParam = searchParams.get('task')
  const detailTaskId = useMemo(() => {
    if (!taskParam) return null
    const byKey = tasks.find((t) => `${t.project_key}-${t.sequence_number}`.toLowerCase() === taskParam.toLowerCase())
    return byKey?.id ?? taskParam   // fall back to a raw id (cross-project / legacy links)
  }, [taskParam, tasks])
  const setDetailTaskId = useCallback((id: string | null) => {
    const t = id ? tasks.find((x) => x.id === id) : null
    const param = t ? `${t.project_key}-${t.sequence_number}` : id
    setSearchParams((prev) => {
      if ((prev.get('task') ?? null) === (param ?? null)) return prev
      const p = new URLSearchParams(prev)
      if (param) p.set('task', param)
      else p.delete('task')
      return p
    }, { replace: false })
  }, [tasks, setSearchParams])
  const localDetailTask = findDetailTask(tasks, detailTaskId)
  // Only fetch by id when the param resolved to a UUID (avoid fetching an unresolved key).
  const looksLikeId = !!detailTaskId && detailTaskId.length > 20
  const { data: fetchedDetailTask } = useTask(workspaceId, detailTaskId ?? '', !localDetailTask && looksLikeId)
  const detailTask = localDetailTask ?? fetchedDetailTask ?? null

  // Normalize a raw task UUID (e.g. a notification deep-link) to the ticket key.
  useEffect(() => {
    if (!taskParam) return
    const t = tasks.find((x) => x.id === taskParam)
    if (!t) return
    const key = `${t.project_key}-${t.sequence_number}`
    if (taskParam === key) return
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('task', key)
      return p
    }, { replace: true })
  }, [taskParam, tasks, setSearchParams])

  const epicTasks = useMemo(
    () => orderedTasks.filter((t) => t.issue_type === 'epic'),
    [orderedTasks]
  )

  const FILTER_FIELDS = useMemo(() => [
    { id: 'assignee', label: 'Assignee', options: members.map((m) => ({ value: m.id, label: m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.username ?? m.email })) },
    { id: 'tag',      label: 'Tag',      options: allTags.map((t) => ({ value: t.id, label: t.name, color: t.color })) },
    { id: 'status',   label: 'Status',   options: isCustomMode
      ? effectiveColumns.map((c) => ({ value: c.id, label: c.label, color: c.labelColor }))
      : [
          { value: 'todo',        label: 'To Do' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'done',        label: 'Done' },
        ]
    },
    { id: 'priority', label: 'Priority', options: priorityItems.map((p) => ({ value: p.id, label: p.name, color: p.color })) },
    { id: 'type',     label: 'Type',     options: [
      { value: 'epic',  label: 'Epic' },
      { value: 'story', label: 'Story' },
      { value: 'task',  label: 'Task' },
      { value: 'bug',   label: 'Bug' },
    ]},
    { id: 'epic',     label: 'Epic',     options: epicTasks.map((e) => ({ value: e.id, label: e.title })) },
    { id: 'sprint',   label: 'Sprint',   options: sprints.map((s) => ({ value: s.id, label: s.name })) },
    // REQ-152: identity filters — user-composed "related to me" (DD-045)
    { id: 'related',  label: 'Related',  options: [
      { value: 'commented', label: 'Commented by me' },
      { value: 'mentioned', label: 'Mentions me' },
    ]},
    { id: 'severity', label: 'Severity', options: [
      { value: 'critical', label: 'Critical' },
      { value: 'high',     label: 'High' },
      { value: 'medium',   label: 'Medium' },
      { value: 'low',      label: 'Low' },
    ]},
    { id: 'due',      label: 'Due Date', options: [
      { value: 'overdue',   label: 'Overdue' },
      { value: 'today',     label: 'Today' },
      { value: 'this_week', label: 'This week' },
      { value: 'next_week', label: 'Next week' },
      { value: 'none',      label: 'No due date' },
    ]},
  ], [members, allTags, isCustomMode, effectiveColumns, priorityItems, epicTasks, sprints])

  const addTagFilter = useCallback((tagId: string) => {
    const tag = allTags.find((t) => t.id === tagId)
    if (!tag || activeFilters.some((f) => f.fieldId === 'tag' && f.value === tagId && !f.negate)) return
    setActiveFilters([
      ...activeFilters,
      {
        instanceId: Math.random().toString(36).slice(2),
        fieldId: 'tag',
        fieldLabel: 'Tag',
        value: tagId,
        label: tag.name,
        color: tag.color,
        negate: false,
      },
    ])
  }, [allTags, activeFilters, setActiveFilters])


  // Split mouse/touch instead of one PointerSensor: on a phone a distance-only
  // constraint makes every attempted scroll start a drag. Touch requires a
  // press-and-hold (YouTrack Mobile's gesture), so a swipe scrolls the board
  // and a long-press picks a card up. Mouse keeps the instant 8px threshold.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  useKeyBindings({
    'command-palette': () => setPaletteOpen((v) => !v),
    'create-task':    () => { if (boardId) openCreate(visibleColumns[0]?.taskStatus ?? 'todo', isCustomMode ? (visibleColumns[0]?.id ?? null) : null) },
    'shortcuts-help': () => setShowHelp(true),
    'notifications':  () => shell?.toggleNotifications(),
    'members':        () => { if (workspaceId) navigate(`/projects/${wsSeg}/settings?tab=members`) },
    'next-board': () => {
      if (!boards.length) return
      const idx = boards.findIndex((b) => b.id === activeBoardId)
      setActiveBoardId(boards[(idx + 1) % boards.length].id)
    },
    'prev-board': () => {
      if (!boards.length) return
      const idx = boards.findIndex((b) => b.id === activeBoardId)
      setActiveBoardId(boards[(idx - 1 + boards.length) % boards.length].id)
    },
    // Palette navigation targets as first-class bindings (rebindable in Preferences)
    'issues':           () => { if (workspaceId) navigate(`/projects/${wsSeg}/issues`) },
    'export-import':    () => { if (workspaceId) navigate(`/projects/${wsSeg}/export`) },
    'project-settings': () => { if (workspaceId) navigate(`/projects/${wsSeg}/settings`) },
    'audit-log':        () => { if (workspaceId) navigate(`/projects/${wsSeg}/audit-log`) },
    'preferences':      () => navigate('/preferences'),
    'my-work':          () => navigate('/my-work'),
    'dashboard':        () => navigate('/dashboard'),
    'help':             () => navigate('/help'),
    'cycle-theme':      () => {
      const order: ThemePreference[] = ['light', 'dark', 'system']
      setPreference(order[(order.indexOf(preference) + 1) % order.length])
    },
  })

  async function handleSaveSearch() {
    if (!saveSearchName.trim()) return
    setSavingSearch(true)
    await createSavedSearch.mutateAsync({ name: saveSearchName.trim(), filters: activeFilters as unknown as Record<string, unknown>[] })
    setSaveSearchName('')
    setSavingSearch(false)
    setSavedSearchPanelOpen(false)
    setMobileControlsOpen(false)
  }

  function renderToolbar() {
    return (
      <div className="mb-4">
        {projectMode !== 'open' && (
          <ProjectFilterBar
            filters={projectFilter}
            mode={projectMode as 'guided' | 'enforced'}
            active={projectFilterActive}
            onToggleActive={setProjectFilterActive}
            isAdmin={isProjectAdmin}
            onEdit={openProjectFilterEditor}
          />
        )}
        {projectFilterEditorOpen && (
          <div className="mb-2 rounded-xl border border-brand/30 bg-gray-900/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300">
                Edit board filter <span className="font-normal text-gray-500">· {projectMode}</span>
              </span>
              <button onClick={() => setProjectFilterEditorOpen(false)} className="text-gray-500 hover:text-gray-300" aria-label="Close editor">
                <X size={14} />
              </button>
            </div>
            {/* HW-13: statuses shown on this board. Writes ordinary `status` filter
                entries, so it shares storage and semantics with the filter bar below —
                none ticked means "show every status". */}
            {isCustomMode && effectiveColumns.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs text-gray-500">Statuses shown on this board</p>
                <div className="flex flex-wrap gap-1.5">
                  {effectiveColumns.map((col) => {
                    const checked = draftProjectFilter.some(
                      (f) => f.fieldId === 'status' && !f.negate && f.value === col.id,
                    )
                    return (
                      <label
                        key={col.id}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition-colors ${
                          checked
                            ? 'border-brand/50 bg-brand/10 text-gray-200'
                            : 'border-gray-800 text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={col.label}
                          onChange={() => toggleBoardStatus(col)}
                          className="accent-brand"
                        />
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: col.labelColor }} />
                        {col.label}
                      </label>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-600">
                  {draftProjectFilter.some((f) => f.fieldId === 'status' && !f.negate)
                    ? 'Only the ticked statuses appear as columns on this board.'
                    : 'None ticked — this board shows every status.'}
                </p>
              </div>
            )}

            <SmartFilterBar
              filters={draftProjectFilter}
              onFiltersChange={setDraftProjectFilter}
              fields={FILTER_FIELDS}
              placeholder="Add fields that define this board's scope…"
            />
            <div className="mt-2 flex items-center justify-end gap-3">
              <button onClick={() => setDraftProjectFilter([])} className="text-xs text-gray-500 hover:text-gray-300">Clear</button>
              <button
                onClick={saveProjectFilter}
                disabled={updateBoardFilter.isPending}
                className="rounded-lg bg-brand px-3 py-1 text-xs text-white hover:brightness-110 disabled:opacity-40 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
        <div className="min-w-0 flex-1">
          <SmartFilterBar filters={activeFilters} onFiltersChange={setActiveFilters} fields={FILTER_FIELDS} />
        </div>

        {/* Secondary controls. `hidden md:contents` drops them out of the layout below md
            (they move into the BoardMobileControls sheet) while `display: contents` at md+
            makes this wrapper invisible to flex — the desktop row is unchanged. */}
        <div className="hidden md:contents">

        {/* Saved searches */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setSavedSearchPanelOpen((v) => !v)}
            title="Saved searches"
            className={`p-1.5 rounded-lg border transition-colors ${savedSearchPanelOpen || savedSearches.length > 0 ? 'border-brand/40 text-brand' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
          >
            {activeFilters.length > 0 ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>

          {savedSearchPanelOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
              {/* Apply a saved search */}
              {savedSearches.length > 0 && (
                <div className="border-b border-gray-800">
                  {savedSearches.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-800 group">
                      <button
                        className="flex-1 text-left text-sm text-gray-300 truncate"
                        onClick={() => { setActiveFilters(s.filters as unknown as typeof activeFilters); setSavedSearchPanelOpen(false) }}
                      >
                        {s.name}
                      </button>
                      <button
                        onClick={() => deleteSavedSearch.mutate(s.id)}
                        className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all ml-2"
                        aria-label="Delete saved search"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Save current filters */}
              {activeFilters.length > 0 ? (
                <div className="p-2 flex gap-1.5">
                  <input
                    autoFocus
                    value={saveSearchName}
                    onChange={(e) => setSaveSearchName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSearch() }}
                    placeholder="Name this search…"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-200 outline-none placeholder-gray-600 focus:border-brand/60"
                  />
                  <button
                    onClick={handleSaveSearch}
                    disabled={!saveSearchName.trim() || savingSearch}
                    className="px-2 py-1 rounded-lg text-xs bg-brand text-white disabled:opacity-40 hover:brightness-110 transition-all"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <p className="px-3 py-2.5 text-xs text-gray-500">Add filters above to save a search.</p>
              )}
            </div>
          )}
        </div>
        {viewMode === 'kanban' && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs text-gray-500 whitespace-nowrap">Group by</span>
            <select
              value={swimlaneMode}
              onChange={(e) => { setSwimlaneMode(e.target.value as SwimlaneMode); setCollapsedSwimlanes(new Set()) }}
              className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none cursor-pointer hover:border-gray-600"
            >
              <option value="none">None</option>
              <option value="assignee">Assignee</option>
              <option value="priority">Priority</option>
              <option value="type">Type</option>
              <option value="epic">Epic</option>
            </select>
            <button
              onClick={() => { setCompact(!compact); if (!compact) setGridMode(false) }}
              title={compact ? 'Switch to comfortable view' : 'Switch to compact view'}
              className={`p-1.5 rounded-lg border transition-colors ${compact ? 'border-brand/40 text-brand' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
            >
              <AlignJustify size={14} />
            </button>
            <button
              onClick={() => { setGridMode(!gridMode); if (!gridMode) setCompact(false) }}
              title={gridMode ? 'Switch to list layout' : 'Switch to grid layout'}
              className={`p-1.5 rounded-lg border transition-colors ${gridMode ? 'border-brand/40 text-brand' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
            >
              <Grid2x2 size={14} />
            </button>
          </div>
        )}
        {boardId && (
          <button
            onClick={() => setSprintPanelOpen((v) => !v)}
            aria-label="Manage sprints"
            title="Manage sprints"
            className={`p-1.5 rounded-lg border transition-colors flex-shrink-0 ${sprintPanelOpen ? 'border-brand/40 text-brand' : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}
          >
            <Flag size={14} />
          </button>
        )}
        {hasActiveSprint && activeSpecialTab === null && (
          <div
            className="flex items-center gap-0.5 bg-gray-900 border border-gray-800 rounded-lg p-0.5 flex-shrink-0"
            title={`Board scope — “${activeSprint!.name}” is active`}
          >
            <button
              onClick={() => setSprintScope('active')}
              aria-label="Scope board to active sprint"
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${sprintScope === 'active' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Sprint
            </button>
            <button
              onClick={() => setSprintScope('all')}
              aria-label="Show all board tasks"
              className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${sprintScope === 'all' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              All
            </button>
          </div>
        )}
        </div>{/* /secondary controls (desktop-inline) */}

        {/* Mobile row: the "View" sheet trigger plus the view-mode switcher, which stays
            visible because it is how a phone user moves between list and kanban.
            `md:contents` dissolves both wrappers at desktop widths. */}
        <div className="flex items-center gap-2 md:contents">
          <BoardMobileControls
            open={mobileControlsOpen}
            onOpenChange={setMobileControlsOpen}
            showKanbanControls={viewMode === 'kanban'}
            swimlaneMode={swimlaneMode}
            onSwimlaneChange={(m) => { setSwimlaneMode(m); setCollapsedSwimlanes(new Set()) }}
            compact={compact}
            onToggleCompact={() => { setCompact(!compact); if (!compact) setGridMode(false) }}
            gridMode={gridMode}
            onToggleGrid={() => { setGridMode(!gridMode); if (!gridMode) setCompact(false) }}
            showSprintPanelToggle={!!boardId}
            sprintPanelOpen={sprintPanelOpen}
            onToggleSprintPanel={() => setSprintPanelOpen((v) => !v)}
            showSprintScope={hasActiveSprint && activeSpecialTab === null}
            sprintScope={sprintScope}
            onSprintScopeChange={setSprintScope}
            activeSprintName={activeSprint?.name}
            savedSearches={savedSearches}
            onApplySavedSearch={(s) => setActiveFilters(s.filters as unknown as typeof activeFilters)}
            onDeleteSavedSearch={(id) => deleteSavedSearch.mutate(id)}
            canSaveSearch={activeFilters.length > 0}
            saveSearchName={saveSearchName}
            onSaveSearchNameChange={setSaveSearchName}
            onSaveSearch={handleSaveSearch}
            savingSearch={savingSearch}
          />
          {/* Scroll strip so five view icons never squash on a narrow phone. */}
          <div className="flex min-w-0 flex-1 overflow-x-auto md:contents">
        {activeSpecialTab !== 'backlog' && (
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => handleViewMode('kanban')}
            aria-label="Kanban view" title="Kanban view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => handleViewMode('list')}
            aria-label="List view" title="List view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <LayoutList size={14} />
          </button>
          <button
            onClick={() => handleViewMode('calendar')}
            aria-label="Calendar view" title="Calendar view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'calendar' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <Calendar size={14} />
          </button>
          <button
            onClick={() => handleViewMode('gantt')}
            aria-label="Gantt view" title="Gantt view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'gantt' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <GanttChartSquare size={14} />
          </button>
          <button
            onClick={() => handleViewMode('roadmap')}
            aria-label="Roadmap view" title="Roadmap view"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'roadmap' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <MapIcon size={14} />
          </button>
        </div>
        )}
          </div>{/* /view-switcher scroll strip */}
        </div>{/* /mobile row */}
        </div>
      </div>
    )
  }

  function renderSpecialTabContent(tasks: Task[], label: string, listOnly = false) {
    let filtered = tasks.filter((t) => passesFilters(t))
    // Impact mode: order the backlog by priority score (value ÷ size), highest first.
    if (activeProject?.estimation_method === 'impact') {
      const score = (t: Task) => (t.business_value ?? 0) / Math.max(t.estimate ?? 1, 1)
      filtered = [...filtered].sort((a, b) => score(b) - score(a))
    }
    return (
      <>
        {renderToolbar()}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">{label}</h2>
          <button
            onClick={() => openCreate('todo', null)}
            className="text-xs text-brand hover:text-brand-hover border border-brand/40 rounded-lg px-3 py-1.5 transition-colors"
            aria-label="New task"
          >
            + New task
          </button>
        </div>
        {listOnly ? (
          <ListView
            tasks={filtered}
            memberMap={memberMap}
            onRowClick={(task) => setDetailTaskId(task.id)}
            projectStatuses={projectStatuses}
            isCustomMode={isCustomMode}
            priorityMap={priorityMap}
            onUpdateTask={(taskId, data) => updateTaskGated(taskId, data)}
            sprints={sprints}
          />
        ) : (
          renderViews(filtered)
        )}
      </>
    )
  }

  function renderContent() {
    if (!workspaceId) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <div>
            <p className="text-gray-200 font-medium">No projects yet</p>
            <p className="text-gray-500 text-sm mt-1">
              {user?.is_superuser
                ? 'Create your first project and choose how its workflow behaves.'
                : 'Project creation is handled by your instance admin — ask them for an invite to get started.'}
            </p>
          </div>
          {user?.is_superuser && (
            <button
              onClick={() => setCreateProjectOpen(true)}
              className="flex items-center gap-2 text-sm bg-brand hover:bg-brand-hover text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} /> Create project
            </button>
          )}
        </div>
      )
    }

    if (activeSpecialTab === 'backlog') {
      return renderSpecialTabContent(backlogTasks, 'Backlog — tasks with no sprint assigned', true)
    }

    if (activeSpecialTab === 'active-sprint' && activeSprint) {
      return renderSpecialTabContent(activeSprintTasks, `Active Sprint: ${activeSprint.name}`)
    }

    if (!boardId) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <p className="text-gray-400">No boards yet. Create one above.</p>
        </div>
      )
    }
    if (viewMode === 'roadmap') {
      return (
        <>
          {renderToolbar()}
          <RoadmapView projectId={workspaceId} isAdmin={isProjectAdmin} mode={projectMode} onOpenTask={(id) => setDetailTaskId(id)} />
        </>
      )
    }
    return (
      <>
        {renderToolbar()}
        {renderViews(orderedTasks.filter((t) => passesFilters(t) && inSprintScope(t)))}
      </>
    )
  }

  // Render the active view (list / calendar / gantt / kanban) for a given task set,
  // so the main board AND the Backlog/Sprint tabs share the same views.
  function renderViews(viewTasks: Task[]) {
    if (viewMode === 'list') {
      return (
        <ListView
          tasks={viewTasks}
          memberMap={memberMap}
          onRowClick={(task) => setDetailTaskId(task.id)}
          projectStatuses={projectStatuses}
          isCustomMode={isCustomMode}
          priorityMap={priorityMap}
          onUpdateTask={(taskId, data) => updateTaskGated(taskId, data)}
          selectedIds={selectedTaskIds}
          onSelectionChange={setSelectedTaskIds}
        />
      )
    }
    if (viewMode === 'calendar') {
      return (
        <CalendarView
          tasks={viewTasks}
          onTaskClick={(task) => setDetailTaskId(task.id)}
          onUpdateTask={(taskId, data) => updateTaskGated(taskId, data)}
        />
      )
    }
    if (viewMode === 'gantt') {
      return (
        <GanttView
          tasks={viewTasks}
          onTaskClick={(task) => setDetailTaskId(task.id)}
          onUpdateTask={(taskId, data) => updateTaskGated(taskId, data)}
        />
      )
    }
    const swimlaneGroups = getSwimlaneGroups(viewTasks)

    return (
      <>
      {/* HW-21: phones get a swipe-one-status-per-screen board; ≥md is the desktop board below, unchanged. */}
      <div className="md:hidden">
        <MobileBoard
          columns={visibleColumns as unknown as MobileColumn[]}
          tasks={viewTasks}
          colIdOf={(t) => getTaskColumnId(t, isCustomMode, effectiveColumns)}
          groupTasks={getSwimlaneGroups}
          grouped={swimlaneMode !== 'none'}
          groupLabel={SWIMLANE_LABELS[swimlaneMode]}
          filterActive={activeFilters.length > 0}
          onClearFilter={() => setActiveFilters([])}
          memberMap={memberMap}
          priorityMap={priorityMap}
          childCountMap={childCountMap}
          selectedIds={selectedTaskIds}
          onToggleSelect={handleSelectToggle}
          onClearSelection={clearSelection}
          onOpenTask={(id) => setDetailTaskId(id)}
          onDeleteTask={(id) => deleteTask.mutate(id)}
          onCreate={(col) => openCreate(col.taskStatus as TaskStatus, isCustomMode ? col.id : null)}
          onMove={moveSelectedToColumn}
        />
      </div>
      <div className="hidden md:block">
      <DndContext sensors={sensors} collisionDetection={boardCollisionDetection} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        {swimlaneGroups.map((group) => (
          <div key={group.id} className="mb-6">
            {swimlaneMode !== 'none' && (() => {
              const collapsed = collapsedSwimlanes.has(group.id)
              const swimEpic = swimlaneMode === 'epic' && group.id !== '_none'
                ? tasks.find((t) => t.id === group.id) : null
              return (
                // YouTrack-style swimlane band: full-width header, identity left, count right
                <div className="flex items-center gap-2.5 mb-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800">
                  <button
                    onClick={() => toggleSwimlane(group.id)}
                    className="text-gray-500 hover:text-gray-200 transition-colors shrink-0"
                    aria-label={collapsed ? 'Expand swimlane' : 'Collapse swimlane'}
                  >
                    <span className={`inline-block text-[10px] transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
                  </button>
                  {swimEpic ? (
                    <button
                      onClick={() => setDetailTaskId(swimEpic.id)}
                      className="flex items-center gap-2 min-w-0 text-left hover:underline decoration-gray-600"
                      title="Open epic"
                    >
                      <IssueTypeBadge type="epic" size={15} />
                      <span className="font-mono text-xs text-purple-300 shrink-0">{swimEpic.project_key}-{swimEpic.sequence_number}</span>
                      <span className="text-sm font-semibold text-gray-100 truncate">{group.label}</span>
                    </button>
                  ) : (
                    <span className="text-sm font-semibold text-gray-300 truncate">{group.label || 'No Epic'}</span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-gray-500">
                    {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
              )
            })()}
            {!collapsedSwimlanes.has(group.id) && (
              <div className="flex items-stretch gap-4 pb-4">
                {visibleColumns.map((col) => (
                  <Column
                    key={`${group.id}-${col.id}`}
                    columnId={col.id}
                    droppableId={swimlaneMode !== 'none' ? `${group.id}::${col.id}` : col.id}
                    label={col.label}
                    labelColor={col.labelColor}
                    tasks={(() => {
                      const colTasks = group.tasks.filter((t) => getTaskColumnId(t, isCustomMode, effectiveColumns) === col.id)
                      return gridMode ? packGridPositions(colTasks) : colTasks
                    })()}
                    onAddClick={() => openCreate(
                      col.taskStatus,
                      isCustomMode ? col.id : null,
                      // Epic lanes only — '_none' is the "No Epic" catch-all.
                      swimlaneMode === 'epic' && group.id !== '_none'
                        ? { id: group.id, label: group.label }
                        : null,
                    )}
                    onDelete={(id) => deleteTask.mutate(id)}
                    onCardClick={(task) => setDetailTaskId(task.id)}
                    draggingFromColumn={activeTask ? getTaskColumnId(activeTask, isCustomMode, effectiveColumns) : null}
                    memberMap={memberMap}
                    onFilterByTag={addTagFilter}
                    collapsed={collapsedColumns.has(col.id)}
                    onToggleCollapse={() => toggleCollapse(col.id)}
                    dropDisabled={dragAllowedColIds ? !dragAllowedColIds.has(col.id) : false}
                    childCountMap={childCountMap}
                    priorityMap={priorityMap}
                    wipLimit={col.wipLimit}
                    selectedTaskIds={selectedTaskIds}
                    onSelectToggle={handleSelectToggle}
                    compact={compact}
                    gridMode={gridMode}
                    showingOlder={showOldDone}
                    onToggleShowOlder={
                      hideDoneActive && col.taskStatus === 'done'
                        ? () => setShowOldDone((v) => !v)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        <DragOverlay dropAnimation={null}>
          {activeTask && <TaskCard task={activeTask} onDelete={() => {}} onClick={() => {}} />}
        </DragOverlay>
      </DndContext>
      </div>
      </>
    )
  }

  function openCreate(
    status: TaskStatus,
    customStatusId?: string | null,
    parent?: { id: string; label: string } | null,
  ) {
    setModalStatus(status)
    setModalCustomStatusId(customStatusId ?? null)
    setModalParent(parent ?? null)
    setModalOpen(true)
  }

  async function handleSubmitTask(data: TaskCreate, resolvedBoardId: string): Promise<Task | void> {
    const task = await taskApi.create(workspaceId, resolvedBoardId, data)
    qc.invalidateQueries({ queryKey: ['tasks', workspaceId, resolvedBoardId] })
    if (activeSpecialTab) {
      qc.invalidateQueries({ queryKey: ['project-tasks', workspaceId] })
    }
    return task
  }

  function fetchProjectTasks(): Promise<Task[]> {
    return qc.fetchQuery({
      queryKey: ['project-tasks', workspaceId, '__all__'],
      queryFn: () => projectTaskApi.list(workspaceId),
      staleTime: 30_000,
    })
  }

  // Single-task update with the epic-completion heads-up (list/calendar/gantt edits).
  async function updateTaskGated(taskId: string, data: TaskUpdate) {
    if (data.status === 'done') {
      const projectTasks = await fetchProjectTasks()
      const task = projectTasks.find((t) => t.id === taskId)
      if (task) {
        const count = epicDoneGateCount(task, 'done', projectTasks)
        console.log('[epicGate] list edit: task=%s incomplete=%d', taskId, count)
        if (count > 0) {
          setEpicGateConfirm({ taskId, title: task.title, count, data })
          return
        }
      }
    }
    updateTask.mutate({ taskId, data })
  }

  function handleDragStart(event: DragStartEvent) {
    dragTargetColRef.current = null
    dragTargetGroupRef.current = null
    setDragging(true)
    const task = orderedTasks.find((t) => t.id === event.active.id)
    setActiveTask(task ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string
    const baseOverId = overId.includes('::') ? overId.split('::')[1] : overId

    setOrderedTasks((prev) => {
      const activeIdx = prev.findIndex((t) => t.id === activeId)
      if (activeIdx === -1) return prev

      function applyColumnToTask(t: Task, col: ColumnDef): Task {
        if (isCustomMode) return { ...t, custom_status_id: col.id, status: col.taskStatus }
        return { ...t, status: col.id as TaskStatus }
      }

      const targetCol = effectiveColumns.find((c) => c.id === baseOverId)
      if (targetCol) {
        // Enforced: don't let the card enter a column its transition rules forbid.
        if (dragAllowedColIds && !dragAllowedColIds.has(targetCol.id)) return prev
        dragTargetColRef.current = targetCol
        // Dropping on an empty column droppable carries the swimlane group (group::col).
        dragTargetGroupRef.current = overId.includes('::') ? overId.split('::')[0] : null
        if (getTaskColumnId(prev[activeIdx], isCustomMode, effectiveColumns) === targetCol.id) return prev
        return prev.map((t) => t.id === activeId ? applyColumnToTask(t, targetCol) : t)
      }

      const overIdx = prev.findIndex((t) => t.id === overId)
      if (overIdx === -1) return prev

      const overColId = getTaskColumnId(prev[overIdx], isCustomMode, effectiveColumns)
      const overCol = effectiveColumns.find((c) => c.id === overColId)
      if (!overCol) return prev
      if (dragAllowedColIds && !dragAllowedColIds.has(overCol.id)) return prev

      dragTargetColRef.current = overCol
      // Hovering a card adopts that card's swimlane group.
      dragTargetGroupRef.current = taskGroupId(prev[overIdx])

      const withUpdatedStatus = prev.map((t) =>
        t.id === activeId ? applyColumnToTask(t, overCol) : t
      )
      const newActiveIdx = withUpdatedStatus.findIndex((t) => t.id === activeId)
      return arrayMove(withUpdatedStatus, newActiveIdx, overIdx)
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null)
    const activeId = event.active.id as string
    const originalTask = tasks.find((t) => t.id === activeId)
    const targetCol = dragTargetColRef.current
    const targetGroup = dragTargetGroupRef.current
    dragTargetColRef.current = null
    dragTargetGroupRef.current = null

    if (!originalTask) {
      setDragging(false)
      return
    }

    try {
      const originalColId = getTaskColumnId(originalTask, isCustomMode, effectiveColumns)
      const colChanged = !!targetCol && targetCol.id !== originalColId
      const groupChanged = swimlaneMode !== 'none' && !!targetGroup && targetGroup !== taskGroupId(originalTask)

      if (colChanged || groupChanged) {
        const data: TaskUpdate = { version: originalTask.version }
        if (colChanged) {
          data.status = targetCol!.taskStatus as TaskStatus
          if (isCustomMode) data.custom_status_id = targetCol!.id
        }
        if (groupChanged) {
          const val = targetGroup === '_none' ? null : targetGroup
          if (swimlaneMode === 'assignee') data.assignee_id = val
          else if (swimlaneMode === 'epic') data.parent_id = val
          else if (swimlaneMode === 'priority') data.priority_id = val
          else if (swimlaneMode === 'type' && val) data.issue_type = val as IssueType
        }

        // Epic completion heads-up (every mode): confirm before applying the drop.
        // Early return leaves the server untouched; dragging=false re-syncs the card back.
        if (colChanged && originalTask.issue_type === 'epic') {
          const count = epicDoneGateCount(originalTask, targetCol!.taskStatus, await fetchProjectTasks())
          console.log('[epicGate] drag drop: task=%s targetStatus=%s incomplete=%d', originalTask.id, targetCol!.taskStatus, count)
          if (count > 0) {
            setEpicGateConfirm({ taskId: originalTask.id, title: originalTask.title, count, data })
            return
          }
        }

        await updateTask.mutateAsync({ taskId: originalTask.id, data })

        if (colChanged && targetCol!.taskStatus === 'done') {
          const links = await qc.fetchQuery({
            queryKey: ['task-links', workspaceId, originalTask.id],
            queryFn: () => taskLinkApi.list(workspaceId, originalTask.id),
            staleTime: 30_000,
          })
          const unresolved = links.filter(
            (l) => l.display_type === 'Is blocked by' && l.linked_task.status !== 'done'
          )
          if (unresolved.length > 0) {
            setBlockWarning(
              `"${originalTask.title}" moved to Done with ${unresolved.length} unresolved blocker${unresolved.length > 1 ? 's' : ''}: ${unresolved.map((l) => l.linked_task.title).join(', ')}.`
            )
          }
        }
      }

      // Reorder within the destination column (best-effort; orderedTasks may lag by one batch)
      const snapshot = orderedTasks
      const movedTask = snapshot.find((t) => t.id === activeId)
      if (movedTask) {
        const movedTaskColId = getTaskColumnId(movedTask, isCustomMode, effectiveColumns)
        const destColTasks = snapshot.filter(
          (t) => getTaskColumnId(t, isCustomMode, effectiveColumns) === movedTaskColId
        )
        if (destColTasks.length > 1) {
          const reorderItems = gridMode
            ? tasksToGridReorderItems(destColTasks, 0)
            : destColTasks.map((t, i) => ({ id: t.id, position: i }))
          await reorderTasks.mutateAsync(reorderItems)
        }

        if (gridMode && targetCol && targetCol.id !== getTaskColumnId(originalTask, isCustomMode, effectiveColumns)) {
          const { grid_x, grid_y } = nextFreeCell(
            snapshot.filter((t) => t.id !== activeId && getTaskColumnId(t, isCustomMode, effectiveColumns) === targetCol.id)
          )
          await updateTask.mutateAsync({
            taskId: originalTask.id,
            data: isCustomMode
              ? { custom_status_id: targetCol.id, status: targetCol.taskStatus, grid_x, grid_y, version: originalTask.version }
              : { status: targetCol.taskStatus as TaskStatus, grid_x, grid_y, version: originalTask.version },
          })
        }
      }
    } catch {
      // error: dragging=false will re-sync from server state
    } finally {
      setDragging(false)
    }
  }

  async function handleCreateProject(name: string, mode: ProjectMode = 'open') {
    const proj = await createProject.mutateAsync({ name, mode })
    setCreateProjectOpen(false)
    navigate(`/projects/${proj.key ?? proj.id}`)
  }

  async function handleCreateBoard(name: string) {
    const board = await createBoard.mutateAsync(name)
    setActiveBoardId(board.id)
  }

  async function handleDeleteBoard(id: string) {
    await deleteBoard.mutateAsync(id)
    const remaining = boards.filter((b) => b.id !== id)
    setActiveBoardId(remaining.length > 0 ? remaining[0].id : null)
  }

  function handleOpenTask(wsId: string, taskId: string) {
    if (wsId !== workspaceId) navigate(`/projects/${projectSeg(projects, wsId)}?task=${taskId}`)
    else setDetailTaskId(taskId)
  }

  const paletteCommands: Command[] = useMemo(() => {
    const cmds: Command[] = []
    if (boardId) cmds.push({ id: 'cmd-new-task', title: 'Create task', group: 'Create', keywords: ['add', 'new', 'issue'], run: () => openCreate(visibleColumns[0]?.taskStatus ?? 'todo', isCustomMode ? (visibleColumns[0]?.id ?? null) : null) })
    if (workspaceId) {
      cmds.push({ id: 'cmd-members', title: 'Go to Members', group: 'Navigate', keywords: ['team', 'people', 'invite'], run: () => navigate(`/projects/${wsSeg}/settings?tab=members`) })
      cmds.push({ id: 'cmd-issues', title: 'Go to Issues', group: 'Navigate', keywords: ['query', 'list', 'all tasks', 'filter'], run: () => navigate(`/projects/${wsSeg}/issues`) })
      cmds.push({ id: 'cmd-export', title: 'Go to Export & Import', group: 'Navigate', keywords: ['export', 'csv', 'import', 'download', 'jira', 'trello'], run: () => navigate(`/projects/${wsSeg}/export`) })
      cmds.push({ id: 'cmd-settings', title: 'Go to Project Settings', group: 'Navigate', keywords: ['config', 'statuses', 'transitions', 'automation', 'mode'], run: () => navigate(`/projects/${wsSeg}/settings`) })
      cmds.push({ id: 'cmd-audit', title: 'Go to Audit Log', group: 'Navigate', keywords: ['history', 'reports', 'activity'], run: () => navigate(`/projects/${wsSeg}/audit-log`) })
    }
    cmds.push({ id: 'cmd-prefs', title: 'Go to Preferences', group: 'Navigate', keywords: ['profile', 'account', 'notifications', 'keybindings'], run: () => navigate('/preferences') })
    cmds.push({ id: 'cmd-my-work', title: 'Go to My Work', group: 'Navigate', keywords: ['assigned', 'my tasks', 'created', 'watching'], run: () => navigate('/my-work') })
    cmds.push({ id: 'cmd-dashboard', title: 'Go to Dashboard', group: 'Navigate', keywords: ['charts', 'widgets', 'metrics'], run: () => navigate('/dashboard') })
    cmds.push({ id: 'cmd-help', title: 'Go to Help', group: 'Navigate', keywords: ['docs', 'documentation', 'guide'], run: () => navigate('/help') })
    cmds.push({ id: 'cmd-notif', title: 'Toggle notifications', group: 'View', keywords: ['bell', 'alerts'], run: () => shell?.toggleNotifications() })
    cmds.push({ id: 'cmd-shortcuts', title: 'Show keyboard shortcuts', group: 'View', keywords: ['keys', 'bindings', 'hotkeys'], run: () => setShowHelp(true) })
    cmds.push({ id: 'cmd-theme-light', title: 'Theme: Light', group: 'View', keywords: ['appearance', 'mode'], run: () => setPreference('light') })
    cmds.push({ id: 'cmd-theme-dark', title: 'Theme: Dark', group: 'View', keywords: ['appearance', 'mode'], run: () => setPreference('dark') })
    cmds.push({ id: 'cmd-theme-system', title: 'Theme: System', group: 'View', keywords: ['appearance', 'mode', 'auto'], run: () => setPreference('system') })
    boards.forEach((b) => cmds.push({ id: `cmd-board-${b.id}`, title: `Board: ${b.name}`, group: 'Switch board', keywords: ['go', 'open'], run: () => { setActiveBoardId(b.id); setActiveSpecialTab(null) } }))
    projects.forEach((p) => cmds.push({ id: `cmd-proj-${p.id}`, title: `Project: ${p.name}`, group: 'Switch project', keywords: ['go', 'open', 'switch'], run: () => navigate(`/projects/${p.key ?? p.id}`) }))
    return cmds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, boardId, boards, projects, visibleColumns, isCustomMode])

  return (
    // Fills the AppShell content column; min-w-0/min-h-0 keep the kanban
    // horizontal scroll inside <main> instead of widening the page.
    <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-gray-950">
      {workspaceId && (
        <BoardTabs
          boards={boards}
          activeId={activeBoardId}
          activeSpecialTab={activeSpecialTab}
          hasActiveSprint={hasActiveSprint}
          onSelect={(id) => { setActiveBoardId(id); setActiveSpecialTab(null) }}
          onSelectSpecial={(tab) => setActiveSpecialTab(tab)}
          onCreate={handleCreateBoard}
          onRename={async (id, name) => { await renameBoard.mutateAsync({ id, name }) }}
          onDelete={handleDeleteBoard}
          canManage={isProjectAdmin}
        />
      )}


      <div className="flex flex-1 min-h-0 min-w-0">
        <main className="flex-1 min-w-0 p-3 md:p-6 overflow-x-auto overflow-y-auto">
          {blockWarning && (
            <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-lg border border-yellow-600/40 bg-yellow-950/40 text-yellow-300 text-sm">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="flex-1">{blockWarning}</span>
              <button onClick={() => setBlockWarning(null)} className="shrink-0 text-yellow-600 hover:text-yellow-400 transition-colors">
                <X size={14} />
              </button>
            </div>
          )}
          {epicGateConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="bg-gray-900 border border-purple-600/50 rounded-xl p-5 mx-6 shadow-2xl max-w-sm w-full">
                <p className="text-sm font-medium text-purple-300 mb-1">Incomplete child tasks</p>
                <p className="text-xs text-gray-400 mb-4">
                  &ldquo;{epicGateConfirm.title}&rdquo; has{' '}
                  <span className="text-gray-200">{epicGateConfirm.count} incomplete child task{epicGateConfirm.count > 1 ? 's' : ''}</span>.
                  {' '}Complete the Epic anyway?
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEpicGateConfirm(null)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      updateTask.mutate({ taskId: epicGateConfirm.taskId, data: epicGateConfirm.data })
                      setEpicGateConfirm(null)
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-purple-700 text-white hover:opacity-90 transition-opacity"
                  >
                    Complete anyway
                  </button>
                </div>
              </div>
            </div>
          )}
          {renderContent()}
        </main>
        {sprintPanelOpen && workspaceId && boardId && (
          <SprintPanel
            projectId={workspaceId}
            boardId={boardId}
            mode={projectMode}
            showPoints={activeProject?.estimation_method === 'story_points'}
            onClose={() => setSprintPanelOpen(false)}
          />
        )}
      </div>

      <CreateProjectModal
        open={createProjectOpen}
        firstRun={projects.length === 0}
        onClose={() => setCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      <CreateTaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmitTask}
        initialStatus={modalStatus}
        initialCustomStatusId={modalCustomStatusId}
        initialParentId={modalParent?.id ?? null}
        initialParentLabel={modalParent?.label}
        projectId={workspaceId}
        boardId={activeSpecialTab ? undefined : boardId}
        boards={activeSpecialTab ? boards : undefined}
      />

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          projectId={workspaceId}
          boardId={boardId}
          currentUserId={resolveUserId(user)}
          isAdmin={resolveIsAdmin(projects, workspaceId, user)}
          onClose={() => setDetailTaskId(null)}
          onOpenTask={(id) => setDetailTaskId(id)}
        />
      )}

      {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        searchProjectId={workspaceId}
        onOpenTask={(id) => handleOpenTask(workspaceId, id)}
      />

      {/* REQ-157: selection bar + YouTrack-style command dialog (DD-050).
          HW-21: desktop only — on mobile the MobileBoard shows a simple "Move to" sheet instead. */}
      {workspaceId && (
        <div className="hidden md:block">
        <BulkEditBar
          projectId={workspaceId}
          selectedIds={[...selectedTaskIds]}
          context={{
            meId: user?.id ?? '',
            mode: projectMode as 'open' | 'guided' | 'enforced',
            members,
            statuses: projectStatuses,
            sprints,
            priorities: priorityItems,
            tags: allTags,
          }}
          onClear={clearSelection}
          onApplied={(updatedIds) => {
            setSelectedTaskIds((prev) => {
              const next = new Set(prev)
              updatedIds.forEach((id) => next.delete(id))
              return next
            })
          }}
          onQuickStatus={(s) => handleBulkStatus(s)}
          onDelete={handleBulkDelete}
        />
        </div>
      )}
    </div>
  )
}
