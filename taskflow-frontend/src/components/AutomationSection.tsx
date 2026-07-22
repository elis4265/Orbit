import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { AutomationAction, AutomationTrigger, ProjectMode } from '../types'
import {
  useAutomationRules,
  useCreateAutomationRule,
  useDeleteAutomationRule,
  useUpdateAutomationRule,
} from '../hooks/useAutomationRules'
import { useMembers } from '../hooks/useMembers'
import { useProjectStatuses } from '../hooks/useProjectStatuses'
import { useProjectPriorities } from '../hooks/usePriorities'
import { useTags } from '../hooks/useTags'

const SEL = 'bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 outline-none focus:border-brand'
type ActionType = 'assign' | 'set_priority' | 'add_tag' | 'comment' | 'set_status'

export default function AutomationSection({ projectId, mode }: { projectId: string; mode: ProjectMode }) {
  const { data: rules = [] } = useAutomationRules(projectId, mode !== 'open')
  const create = useCreateAutomationRule(projectId)
  const update = useUpdateAutomationRule(projectId)
  const del = useDeleteAutomationRule(projectId)
  const { data: members = [] } = useMembers(projectId)
  const { data: statuses = [] } = useProjectStatuses(projectId)
  const { data: priorities = [] } = useProjectPriorities(projectId)
  const { data: tags = [] } = useTags(projectId)

  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<AutomationTrigger>('task_created')
  const [toStatus, setToStatus] = useState('')
  const [actions, setActions] = useState<AutomationAction[]>([{ type: 'assign' }])
  const [conditions, setConditions] = useState<{ field: string; op: string; value: string }[]>([])
  const [error, setError] = useState<string | null>(null)

  const needsValue = (op: string) => op !== 'is_set' && op !== 'is_empty'
  function setCond(i: number, patch: Partial<{ field: string; op: string; value: string }>) {
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

  if (mode === 'open') return null

  function setAction(i: number, patch: Partial<AutomationAction>) {
    setActions((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  async function add() {
    if (!name.trim()) return
    if (trigger === 'status_changed' && !toStatus) { setError('Pick the status that triggers this rule.'); return }
    setError(null)
    const validConds = conditions
      .filter((c) => c.field && (!needsValue(c.op) || c.value))
      .map((c) => (needsValue(c.op) ? { field: c.field, op: c.op, value: c.value } : { field: c.field, op: c.op }))
    try {
      await create.mutateAsync({
        name: name.trim(),
        trigger,
        trigger_config: trigger === 'status_changed' ? { to_status: toStatus } : null,
        conditions: validConds.length ? validConds : null,
        actions,
      })
      setName(''); setTrigger('task_created'); setToStatus(''); setActions([{ type: 'assign' }])
      setConditions([])
    } catch {
      setError('Could not save the rule.')
    }
  }

  // One-click Jira-style "close only when every linked PR has merged" rule.
  function loadCloseWhenAllMerged() {
    setError(null)
    setName('Close when all PRs merged')
    setTrigger('pr_merged')
    setToStatus('')
    setConditions([{ field: 'open_prs', op: 'is_empty', value: '' }])
    const done = statuses.find((s) => s.category === 'completed')
    setActions([{ type: 'set_status', status: done?.name ?? '' }])
  }

  function condValueInput(c: { field: string; op: string; value: string }, i: number) {
    const set = (v: string) => setCond(i, { value: v })
    if (c.field === 'issue_type') return (
      <select value={c.value} onChange={(e) => set(e.target.value)} className={SEL}>
        <option value="">— type —</option>
        {['epic', 'story', 'task', 'bug'].map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    )
    if (c.field === 'priority') return (
      <select value={c.value} onChange={(e) => set(e.target.value)} className={SEL}>
        <option value="">— priority —</option>
        {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    )
    if (c.field === 'status') return (
      <select value={c.value} onChange={(e) => set(e.target.value)} className={SEL}>
        <option value="">— status —</option>
        {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    )
    if (c.field === 'assignee') return (
      <select value={c.value} onChange={(e) => set(e.target.value)} className={SEL}>
        <option value="">— member —</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.username ?? m.email}</option>)}
      </select>
    )
    return null
  }

  function actionValueInput(a: AutomationAction, i: number) {
    if (a.type === 'assign') return (
      <select value={String(a.assignee_id ?? '')} onChange={(e) => setAction(i, { assignee_id: e.target.value })} className={SEL}>
        <option value="">— member —</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.username ?? m.email}</option>)}
      </select>
    )
    if (a.type === 'set_priority') return (
      <select value={String(a.priority_id ?? '')} onChange={(e) => setAction(i, { priority_id: e.target.value })} className={SEL}>
        <option value="">— priority —</option>
        {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    )
    if (a.type === 'set_status') return (
      <select value={String(a.status ?? '')} onChange={(e) => setAction(i, { status: e.target.value })} className={SEL}>
        <option value="">— status —</option>
        {statuses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
      </select>
    )
    if (a.type === 'add_tag') return (
      <select value={String(a.tag_id ?? '')} onChange={(e) => setAction(i, { tag_id: e.target.value })} className={SEL}>
        <option value="">— tag —</option>
        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    )
    return <input value={String(a.text ?? '')} onChange={(e) => setAction(i, { text: e.target.value })} placeholder="Comment text" className={`${SEL} flex-1`} />
  }

  return (
    <div className="mt-6 p-4 bg-gray-900 border border-gray-700 rounded-xl">
      <p className="text-sm font-medium text-gray-200 mb-1">Automation rules</p>
      <p className="text-xs text-gray-500 mb-3">When a trigger fires, run actions automatically. (State-machine/transition rules live in the Transitions tab.)</p>
      <button onClick={loadCloseWhenAllMerged} className="mb-3 self-start text-[11px] px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500">
        + Git template: close when all PRs merged
      </button>

      {rules.length > 0 && (
        <ul className="mb-3 divide-y divide-gray-800">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-300">
                {r.name} <span className="text-xs text-gray-500">· {r.trigger}{r.trigger === 'status_changed' && r.trigger_config?.to_status ? ` → ${String(r.trigger_config.to_status).slice(0, 8)}` : ''} · {r.actions.length} action{r.actions.length > 1 ? 's' : ''}</span>
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-gray-500">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update.mutate({ ruleId: r.id, data: { enabled: e.target.checked } })} className="accent-brand" /> on
                </label>
                <button onClick={() => del.mutate(r.id)} className="text-gray-600 hover:text-red-400" aria-label="Delete rule"><Trash2 size={14} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-gray-800 pt-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" className={SEL} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">When</span>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTrigger)} className={SEL}>
            <option value="task_created">task is created</option>
            <option value="status_changed">status changes to…</option>
            <optgroup label="Git">
              <option value="pr_opened">PR/MR opened</option>
              <option value="pr_merged">PR/MR merged</option>
              <option value="pr_closed">PR/MR closed</option>
              <option value="branch_created">branch created</option>
              <option value="commit_pushed">commit pushed</option>
            </optgroup>
          </select>
          {trigger === 'status_changed' && (
            <select value={toStatus} onChange={(e) => setToStatus(e.target.value)} className={SEL}>
              <option value="">— status —</option>
              {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-gray-500">Only if {conditions.length > 1 ? '(all match)' : ''}</span>
          {conditions.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={c.field} onChange={(e) => setCond(i, { field: e.target.value, value: '' })} className={SEL}>
                <option value="">— field —</option>
                <option value="issue_type">type</option>
                <option value="priority">priority</option>
                <option value="status">status</option>
                <option value="assignee">assignee</option>
                <option value="open_prs">open PRs</option>
              </select>
              <select value={c.op} onChange={(e) => setCond(i, { op: e.target.value })} className={SEL}>
                <option value="eq">is</option>
                <option value="neq">is not</option>
                <option value="is_set">is set</option>
                <option value="is_empty">is empty</option>
              </select>
              {needsValue(c.op) && c.field && condValueInput(c, i)}
              <button onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400" aria-label="Remove condition"><Trash2 size={13} /></button>
            </div>
          ))}
          <button onClick={() => setConditions((cs) => [...cs, { field: '', op: 'eq', value: '' }])} className="self-start text-[11px] text-gray-500 hover:text-gray-300">+ add condition</button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs text-gray-500">Then</span>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={a.type} onChange={(e) => setActions((arr) => arr.map((x, j) => j === i ? { type: e.target.value as ActionType } : x))} className={SEL}>
                <option value="assign">assign</option>
                <option value="set_status">set status</option>
                <option value="set_priority">set priority</option>
                <option value="add_tag">add tag</option>
                <option value="comment">comment</option>
              </select>
              {actionValueInput(a, i)}
              {actions.length > 1 && <button onClick={() => setActions((arr) => arr.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400"><Trash2 size={13} /></button>}
            </div>
          ))}
          <button onClick={() => setActions((a) => [...a, { type: 'assign' }])} className="self-start text-[11px] text-gray-500 hover:text-gray-300">+ add action</button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button onClick={add} disabled={!name.trim() || create.isPending} className="self-start flex items-center gap-1.5 bg-brand hover:bg-brand/80 text-white text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-40">
          <Plus size={14} /> Add rule
        </button>
      </div>
    </div>
  )
}
