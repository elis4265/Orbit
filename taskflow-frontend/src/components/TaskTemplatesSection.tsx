import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { IssueType, SeverityLevel } from '../types'
import { useTaskTemplates, useCreateTaskTemplate, useDeleteTaskTemplate } from '../hooks/useTaskTemplates'
import { useProjectPriorities } from '../hooks/usePriorities'
import { useTags } from '../hooks/useTags'

const SEL = 'bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand'
const ISSUE_TYPES: IssueType[] = ['epic', 'story', 'task', 'bug']
const SEVERITIES: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

export default function TaskTemplatesSection({ projectId }: { projectId: string }) {
  const { data: templates = [] } = useTaskTemplates(projectId)
  const create = useCreateTaskTemplate(projectId)
  const del = useDeleteTaskTemplate(projectId)
  const { data: priorities = [] } = useProjectPriorities(projectId)
  const { data: tags = [] } = useTags(projectId)

  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [issueType, setIssueType] = useState('')
  const [priorityId, setPriorityId] = useState('')
  const [severity, setSeverity] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  function toggleTag(id: string) {
    setTagIds((ids) => (ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id]))
  }

  async function add() {
    if (!name.trim()) return
    setError(null)
    try {
      await create.mutateAsync({
        name: name.trim(),
        title: title.trim() || null,
        description: description.trim() || null,
        issue_type: (issueType || null) as IssueType | null,
        priority_id: priorityId || null,
        severity: (severity || null) as SeverityLevel | null,
        tag_ids: tagIds,
      })
      setName(''); setTitle(''); setDescription(''); setIssueType(''); setPriorityId(''); setSeverity(''); setTagIds([])
    } catch {
      setError('Could not save the template.')
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-400 mb-4">
        Templates are reusable presets that prefill a new task — title, description, type, priority, severity and tags. Anyone creating a task can pick one from the <strong className="text-gray-200">Template</strong> dropdown. Available in all modes.
      </p>

      {templates.length > 0 && (
        <ul className="mb-5 divide-y divide-gray-800">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-gray-300">
                {t.name}
                <span className="text-xs text-gray-500">
                  {' · '}{t.issue_type ?? 'any type'}
                  {t.severity ? ` · ${t.severity}` : ''}
                  {t.tag_ids.length ? ` · ${t.tag_ids.length} tag${t.tag_ids.length > 1 ? 's' : ''}` : ''}
                </span>
              </span>
              <button onClick={() => del.mutate(t.id)} className="text-gray-600 hover:text-red-400" aria-label="Delete template"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-gray-800 pt-4 max-w-lg">
        <p className="text-sm font-medium text-gray-200">New template</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Bug report)" className={SEL} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Default title (optional, e.g. [BUG] )" className={SEL} />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Default description (optional)" rows={4} className={`${SEL} resize-y`} />
        <div className="flex flex-wrap items-center gap-2">
          <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className={SEL} aria-label="Default type">
            <option value="">— type —</option>
            {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={priorityId} onChange={(e) => setPriorityId(e.target.value)} className={SEL} aria-label="Default priority">
            <option value="">— priority —</option>
            {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={SEL} aria-label="Default severity">
            <option value="">— severity —</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 mr-1">Tags:</span>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  tagIds.includes(tag.id) ? 'border-brand text-brand bg-brand/10' : 'border-gray-700 text-gray-400 hover:border-gray-500'
                }`}
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={add} disabled={!name.trim() || create.isPending} className="self-start flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40">
          <Plus size={14} /> Add template
        </button>
      </div>
    </div>
  )
}
