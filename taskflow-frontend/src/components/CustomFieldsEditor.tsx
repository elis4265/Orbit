import { useState } from 'react'
import { useCustomFields } from '../hooks/useCustomFields'
import type { CustomField, ProjectMode } from '../types'

interface Props {
  projectId: string
  mode: ProjectMode
  values: Record<string, unknown>
  onSave: (next: Record<string, unknown>) => Promise<void>
}

const INPUT = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-brand'

function FieldInput({ field, value, onCommit }: { field: CustomField; value: unknown; onCommit: (v: unknown) => void }) {
  // text/number/date keep local state and commit on blur; select/checkbox commit immediately
  const [local, setLocal] = useState(value == null ? '' : String(value))

  if (field.field_type === 'checkbox') {
    return (
      <input type="checkbox" checked={value === true} onChange={(e) => onCommit(e.target.checked)} className="w-4 h-4 rounded accent-brand" />
    )
  }
  if (field.field_type === 'select') {
    return (
      <select value={value == null ? '' : String(value)} onChange={(e) => onCommit(e.target.value || null)} className={INPUT}>
        <option value="">—</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  const type = field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'
  return (
    <input
      type={type}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== (value == null ? '' : String(value))) onCommit(local === '' ? null : local) }}
      className={INPUT}
    />
  )
}

export default function CustomFieldsEditor({ projectId, mode, values, onSave }: Props) {
  const { data: fields = [] } = useCustomFields(projectId, mode !== 'open')
  const [error, setError] = useState<string | null>(null)

  if (mode === 'open' || fields.length === 0) return null

  async function commit(fieldId: string, value: unknown) {
    setError(null)
    try {
      await onSave({ ...values, [fieldId]: value })
    } catch {
      setError('Couldn\'t save — a required field may be empty.')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400">Custom fields</p>
      {fields.map((f) => (
        <div key={f.id}>
          <p className="text-xs text-gray-500 mb-1">
            {f.name}
            {f.required && mode === 'enforced' && <span className="text-amber-400"> *</span>}
          </p>
          <FieldInput field={f} value={values[f.id]} onCommit={(v) => commit(f.id, v)} />
        </div>
      ))}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}
