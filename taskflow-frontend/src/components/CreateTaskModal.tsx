import { useState, type FormEvent, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Paperclip } from 'lucide-react'
import type { Task, TaskCreate, TaskStatus, IssueType, SeverityLevel, Board } from '../types'
import { useMembers } from '../hooks/useMembers'
import { useProjects } from '../hooks/useProjects'
import { useMe } from '../hooks/useAuth'
import { resolveDefaultAssignee } from '../lib/defaultAssignee'
import { useProjectPriorities } from '../hooks/usePriorities'
import { useTags, useCreateTag } from '../hooks/useTags'
import { useTaskTemplates } from '../hooks/useTaskTemplates'
import { applyTemplate } from '../lib/taskTemplate'
import AttachmentSection from './AttachmentSection'
import LocalRichTextEditor from './LocalRichTextEditor'
import TagPicker from './TagPicker'
import TagPill from './TagPill'
import { ISSUE_TYPE_OPTIONS } from './IssueTypeBadge'
import { attachmentApi, tagApi } from '../api/client'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: TaskCreate, boardId: string) => Promise<Task | void>
  initialStatus?: TaskStatus
  initialCustomStatusId?: string | null
  initialParentId?: string | null
  initialParentLabel?: string
  editTask?: Task | null
  projectId: string
  boardId?: string
  boards?: Board[]
}

function submitLabel(isSubmitting: boolean, editTask: { id: string } | null | undefined): string {
  if (isSubmitting) return editTask ? 'Saving…' : 'Creating…'
  return editTask ? 'Save changes' : 'Create task'
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function CreateTaskModal({ open, onClose, onSubmit, initialStatus = 'todo', initialCustomStatusId, initialParentId, initialParentLabel, editTask, projectId, boardId, boards }: Props) {
  const qc = useQueryClient()
  const [selectedBoardId, setSelectedBoardId] = useState<string>(boardId ?? boards?.[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<TaskStatus>(initialStatus)
  const [issueType, setIssueType] = useState<IssueType>('task')
  const [severity, setSeverity] = useState<SeverityLevel | ''>('')
  const [priorityId, setPriorityId] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState('')
  const { data: priorityItems = [] } = useProjectPriorities(projectId)
  const [assigneeId, setAssigneeId] = useState<string>('')
  // HW-18: once the creator touches Assignee, the project default never overrides them —
  // useProjects/useMe can resolve after the modal is already open.
  const assigneeTouched = useRef(false)
  const { data: projects = [] } = useProjects()
  const { data: me } = useMe()
  const project = projects.find((p) => p.id === projectId)
  const defaultAssigneeId = resolveDefaultAssignee(project, me?.id)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [editorResetKey, setEditorResetKey] = useState(0)
  const { data: members = [] } = useMembers(projectId)
  const { data: availableTags = [] } = useTags(projectId)
  const createTag = useCreateTag(projectId)
  const { data: templates = [] } = useTaskTemplates(projectId, !editTask)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')

  function applyTemplateById(id: string) {
    setSelectedTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (!t) return
    const next = applyTemplate({ title, description, issueType, severity, priorityId, tagIds: selectedTagIds }, t)
    setTitle(next.title)
    setDescription(next.description)
    setIssueType(next.issueType)
    setSeverity(next.severity)
    setPriorityId(next.priorityId)
    setSelectedTagIds(next.tagIds)
    setEditorResetKey((k) => k + 1)
  }
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [boardError, setBoardError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const pendingFileInputRef = useRef<HTMLInputElement>(null)

  function syncBoardId() {
    if (boardId) setSelectedBoardId(boardId)
    else if (boards?.length) setSelectedBoardId(boards[0].id)
  }
  useEffect(syncBoardId, [boardId, boards])

  function syncFormState() {
    if (!open) return
    setBoardError('')
    assigneeTouched.current = false
    if (editTask) {
      setTitle(editTask.title)
      setDescription(editTask.description ?? '')
      setStatus(editTask.status)
      setIssueType((editTask.issue_type ?? 'task') as IssueType)
      setSeverity((editTask.severity ?? '') as SeverityLevel | '')
      setPriorityId(editTask.priority_id ?? null)
      setDueDate(editTask.due_date ? editTask.due_date.slice(0, 10) : '')
      setAssigneeId(editTask.assignee_id ?? '')
    } else {
      setTitle('')
      setDescription('')
      setStatus(initialStatus)
      setIssueType('task')
      setSeverity('')
      setPriorityId(null)
      setDueDate('')
      setAssigneeId(defaultAssigneeId)
      setSelectedTagIds([])
      setPendingFiles([])
      setSelectedTemplateId('')
    }
    setEditorResetKey((k) => k + 1)
    setTimeout(() => titleRef.current?.focus(), 50)
  }
  useEffect(syncFormState, [open, editTask, initialStatus])

  // HW-18: the project can load after the modal opens, so apply the default then too —
  // but only for a new task, and never over a choice the creator has already made.
  useEffect(() => {
    if (!open || editTask || assigneeTouched.current || !defaultAssigneeId) return
    setAssigneeId(defaultAssigneeId)
  }, [open, editTask, defaultAssigneeId])


  if (!open) return null

  function handlePendingFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPendingFiles((prev) => [...prev, file])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    // Resolve the board before showing the spinner: creation is board-scoped by
    // URL, and returning early after setIsSubmitting(true) would strand it on.
    const resolvedBoardId = boardId || selectedBoardId
    if (!resolvedBoardId) {
      setBoardError('This project has no board yet — create a board before adding tasks.')
      return
    }
    setBoardError('')
    setIsSubmitting(true)
    try {
      const result = await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        custom_status_id: initialCustomStatusId ?? undefined,
        issue_type: issueType,
        severity: severity || undefined,
        priority_id: priorityId ?? undefined,
        due_date: dueDate || undefined,
        // HW-18: null, not undefined — undefined drops the key and lets the server
        // re-apply the project default, refilling a field the creator just cleared.
        assignee_id: assigneeId || null,
        ...(initialParentId ? { parent_id: initialParentId } : {}),
      }, resolvedBoardId)
      if (result) {
        const promises: Promise<unknown>[] = []
        if (pendingFiles.length > 0) {
          promises.push(...pendingFiles.map((f) => attachmentApi.upload(projectId, result.id, f)))
        }
        if (selectedTagIds.length > 0) {
          promises.push(...selectedTagIds.map((tagId) => tagApi.applyToTask(projectId, result.id, tagId)))
        }
        await Promise.all(promises)
        if (selectedTagIds.length > 0) {
          await qc.invalidateQueries({ queryKey: ['tasks', projectId, resolvedBoardId] })
        }
      }
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Below md this is a full-screen sheet: full width/height, square corners,
          no outer margin. From md up it is the unchanged centered dialog. */}
      <div
        data-testid="create-task-panel"
        className="bg-gray-900 border-0 md:border border-gray-700 rounded-none md:rounded-2xl shadow-2xl w-full max-w-none md:max-w-md mx-0 md:mx-4 h-full md:h-auto max-h-none md:max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-800 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-100">
            {editTask ? 'Edit task' : initialParentId ? 'New child task' : 'New task'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Template picker — prefills the form from a saved preset */}
        {!editTask && templates.length > 0 && (
          <div className="px-4 md:px-6 pt-3 flex-shrink-0 flex items-center gap-2">
            <span className="text-xs text-gray-500">Template</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => applyTemplateById(e.target.value)}
              aria-label="Apply template"
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand"
            >
              <option value="">— Start blank —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Tag row — outside overflow-y-auto so the dropdown isn't clipped */}
        {!editTask && (
          <div className="px-4 md:px-6 py-2 border-b border-gray-800 flex-shrink-0 flex items-center gap-2 flex-wrap">
            <TagPicker
              availableTags={availableTags}
              selectedTagIds={selectedTagIds}
              onApply={(id) => setSelectedTagIds((prev) => [...prev, id])}
              onRemove={(id) => setSelectedTagIds((prev) => prev.filter((t) => t !== id))}
              onCreateTag={async (name, color) => { await createTag.mutateAsync({ name, color }) }}
            />
            {availableTags
              .filter((t) => selectedTagIds.includes(t.id))
              .map((t) => (
                <TagPill
                  key={t.id}
                  tag={t}
                  onRemove={() => setSelectedTagIds((prev) => prev.filter((id) => id !== t.id))}
                />
              ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
            <input
              ref={titleRef}
              type="text"
              placeholder="Task title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand transition-colors"
            />

            {!boardId && boards && boards.length > 0 && (
              <div>
                <label className="block text-xs text-gray-400 mb-1" htmlFor="board-select">Board</label>
                <select
                  id="board-select"
                  aria-label="Board"
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="" disabled>Select a board…</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {initialParentId && initialParentLabel && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">Parent</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-sm text-gray-300 cursor-default select-none">
                  <span className="truncate">{initialParentLabel}</span>
                </div>
              </div>
            )}

            <LocalRichTextEditor
              key={editorResetKey}
              initialContent={description}
              placeholder="Description (optional)"
              onChange={setDescription}
              autoFocus={false}
              minHeight="60px"
              onAttach={(file) => setPendingFiles((prev) => [...prev, file])}
            />

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <select
                  aria-label="Issue type"
                  value={issueType}
                  onChange={(e) => { setIssueType(e.target.value as IssueType); if (e.target.value !== 'bug') setSeverity('') }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
                >
                  {ISSUE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Priority</label>
                <select
                  value={priorityId ?? ''}
                  onChange={(e) => setPriorityId(e.target.value || null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="">— none —</option>
                  {priorityItems.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {issueType === 'bug' && (
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Severity
                  <span className="ml-1 text-gray-600">(required to start work in Enforced mode)</span>
                </label>
                <select
                  aria-label="Severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as SeverityLevel | '')}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="">— Not set —</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Assignee</label>
                <select
                  aria-label="Assignee"
                  value={assigneeId}
                  onChange={(e) => {
                    assigneeTouched.current = true
                    setAssigneeId(e.target.value)
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-brand transition-colors"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.username || m.email}</option>
                  ))}
                </select>
              </div>
            </div>


            {editTask ? (
              <AttachmentSection projectId={projectId} taskId={editTask.id} />
            ) : (
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-gray-400">Attachments</p>
                  <button
                    type="button"
                    onClick={() => pendingFileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs text-brand hover:text-brand-hover transition-colors"
                  >
                    <Paperclip size={12} />
                    Add file
                  </button>
                  <input
                    ref={pendingFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handlePendingFileChange}
                  />
                </div>
                {pendingFiles.length > 0 && (
                  <ul className="space-y-1">
                    {pendingFiles.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 group bg-gray-800 rounded-lg px-3 py-2">
                        <Paperclip size={12} className="text-gray-500 flex-shrink-0" />
                        <span className="flex-1 text-sm text-gray-200 truncate">{f.name}</span>
                        <span className="text-xs text-gray-500 flex-shrink-0">{formatBytes(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                          aria-label={`Remove ${f.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {boardError && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{boardError}</p>
            )}

            {/* Sticky on the phone sheet so Create/Cancel stay reachable while the
                form scrolls; reverts to the plain inline row from md up. */}
            <div className="flex gap-3 pt-2 sticky bottom-0 -mx-4 px-4 pb-4 bg-gray-900 border-t border-gray-800 md:static md:mx-0 md:px-0 md:pb-0 md:bg-transparent md:border-t-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-brand hover:bg-brand-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitLabel(isSubmitting, editTask)}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
