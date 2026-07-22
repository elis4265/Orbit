import React, { useState, useRef, useEffect } from 'react'
import { X, SlidersHorizontal } from 'lucide-react'
import { parseQuery, analyzeInput } from '../lib/filterParser'

export interface FilterFieldOption {
  value: string
  label: string
  color?: string
}

export interface FilterFieldDef {
  id: string
  label: string
  options: FilterFieldOption[]
}

export interface ActiveFilter {
  instanceId: string
  fieldId: string
  fieldLabel: string
  value: string
  label: string
  color?: string
  negate: boolean
}

interface Props {
  filters: ActiveFilter[]
  onFiltersChange: (filters: ActiveFilter[]) => void
  fields: FilterFieldDef[]
  placeholder?: string
}

function uid() {
  return Math.random().toString(36).slice(2)
}

function resolveGroupFilters(
  g: { fieldId: string; values: string[]; negate: boolean },
  field: FilterFieldDef,
  currentFilters: ActiveFilter[],
): ActiveFilter[] {
  const result: ActiveFilter[] = []
  for (const rawVal of g.values) {
    const opt =
      field.options.find((o) => o.value === rawVal) ??
      field.options.find((o) => o.label.toLowerCase() === rawVal.toLowerCase())
    if (!opt) continue
    if (currentFilters.some((f) => f.fieldId === g.fieldId && f.value === opt.value && f.negate === g.negate)) continue
    result.push({
      instanceId: uid(),
      fieldId: field.id,
      fieldLabel: field.label,
      value: opt.value,
      label: opt.label,
      color: opt.color,
      negate: g.negate,
    })
  }
  return result
}

function resolveMultiPaste(
  value: string,
  fields: FilterFieldDef[],
  currentFilters: ActiveFilter[],
): ActiveFilter[] | null {
  if (!value.includes('@') || (value.match(/@/g)?.length ?? 0) <= 1) return null
  const groups = parseQuery(value)
  if (groups.length === 0) return null
  const newFilters: ActiveFilter[] = []
  for (const g of groups) {
    const field = fields.find((f) => f.id === g.fieldId)
    if (!field) continue
    newFilters.push(...resolveGroupFilters(g, field, currentFilters))
  }
  return newFilters.length > 0 ? newFilters : null
}

function isEnterAccept(key: string, mode: string | null, optsLength: number): boolean {
  return key === 'Enter' && mode !== null && optsLength > 0
}
function isBackspaceRemove(key: string, inputValue: string, filtersLength: number): boolean {
  return key === 'Backspace' && inputValue === '' && filtersLength > 0
}

function pillBorderStyle(f: ActiveFilter): React.CSSProperties | undefined {
  return !f.negate && f.color ? { borderColor: `${f.color}55`, backgroundColor: `${f.color}18` } : undefined
}
function pillLabelStyle(f: ActiveFilter): React.CSSProperties | undefined {
  return !f.negate && f.color ? { color: f.color } : undefined
}
function colorDot(f: ActiveFilter): React.ReactNode {
  return !f.negate && f.color
    ? <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
    : null
}

interface FilterPillProps {
  f: ActiveFilter
  onToggleNegate: (id: string) => void
  onRemove: (id: string) => void
}

function FilterPill({ f, onToggleNegate, onRemove }: FilterPillProps) {
  const negCls = f.negate ? 'bg-red-950/40 border-red-800/60' : 'bg-gray-800 border-gray-700'
  const lblCls = f.negate ? 'text-red-300' : 'text-gray-200'
  const negBtnCls = f.negate ? 'text-red-400 hover:text-red-200' : 'text-gray-600 hover:text-yellow-400'
  return (
    // max-w-full + a truncating label keep a long value from forcing the whole bar
    // wider than the viewport on a phone; on desktop the cap never binds.
    <span className={`inline-flex max-w-full min-w-0 items-center gap-1 text-xs font-medium rounded-lg px-2 py-0.5 whitespace-nowrap border ${negCls}`} style={pillBorderStyle(f)}>
      {f.negate && <span className="text-red-400 font-semibold text-[10px] uppercase tracking-wide flex-shrink-0">NOT</span>}
      <span className="text-gray-500 font-normal flex-shrink-0">{f.fieldLabel}:</span>
      {colorDot(f)}
      <span className={`min-w-0 truncate ${lblCls}`} style={pillLabelStyle(f)}>{f.label}</span>
      <button onPointerDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); onToggleNegate(f.instanceId) }}
        className={`ml-0.5 flex-shrink-0 text-[10px] font-mono leading-none transition-colors ${negBtnCls}`}
        title={f.negate ? 'Remove NOT (make positive)' : 'Add NOT (negate)'}
        aria-label={`${f.negate ? 'Remove NOT from' : 'Negate'} ${f.fieldLabel}: ${f.label}`}
      >≠</button>
      <button onPointerDown={e => e.preventDefault()} onClick={e => { e.stopPropagation(); onRemove(f.instanceId) }}
        className="ml-0.5 flex-shrink-0 text-gray-600 hover:text-gray-300 transition-colors leading-none"
        aria-label={`Remove ${f.fieldLabel}: ${f.label}`}
      ><X size={9} /></button>
    </span>
  )
}

interface FieldOptionsProps {
  opts: FilterFieldDef[]
  pendingNegate: boolean
  highlightIdx: number
  onMouseEnter: (i: number) => void
  onSelect: (field: FilterFieldDef) => void
}

function FieldOptions({ opts, pendingNegate, highlightIdx, onMouseEnter, onSelect }: FieldOptionsProps) {
  return (
    <>
      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider select-none">
        {pendingNegate ? 'NOT — Filter by' : 'Filter by'}
      </div>
      {opts.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-600">No fields match</div>
      ) : (
        opts.map((field, i) => (
          <button
            key={field.id}
            role="option"
            aria-selected={i === highlightIdx}
            onPointerDown={e => e.preventDefault()}
            onMouseEnter={() => onMouseEnter(i)}
            onClick={() => onSelect(field)}
            className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
              i === highlightIdx ? 'bg-gray-800 text-gray-100' : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span className={`font-mono text-xs flex-shrink-0 ${pendingNegate ? 'text-red-400' : 'text-brand'}`}>
              {pendingNegate ? '-@' : '@'}{field.id}
            </span>
            <span className="text-gray-400 min-w-0 truncate">{field.label}</span>
          </button>
        ))
      )}
    </>
  )
}

interface ValueOptionsProps {
  opts: FilterFieldOption[]
  pendingField: FilterFieldDef
  pendingNegate: boolean
  highlightIdx: number
  filters: ActiveFilter[]
  onMouseEnter: (i: number) => void
  onSelect: (opt: FilterFieldOption) => void
}

function ValueOptions({ opts, pendingField, pendingNegate, highlightIdx, filters, onMouseEnter, onSelect }: ValueOptionsProps) {
  return (
    <>
      <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold text-gray-600 uppercase tracking-wider select-none">
        {pendingNegate && <span className="text-red-400">NOT </span>}
        {pendingField.label}
        <span className="ml-1.5 text-gray-700 normal-case font-normal">(pick multiple for OR)</span>
      </div>
      {opts.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-600">No options match</div>
      ) : (
        opts.map((opt, i) => {
          const alreadyActive = filters.some(
            f => f.fieldId === pendingField.id && f.value === opt.value && f.negate === pendingNegate
          )
          return (
            <button
              key={opt.value}
              role="option"
              aria-selected={i === highlightIdx}
              onPointerDown={e => e.preventDefault()}
              onMouseEnter={() => onMouseEnter(i)}
              onClick={() => onSelect(opt)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                i === highlightIdx ? 'bg-gray-800 text-gray-100' : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {opt.color && (
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.color }} />
              )}
              <span className="min-w-0 truncate">{opt.label}</span>
              {alreadyActive && <span className="ml-auto flex-shrink-0 text-brand text-xs">✓</span>}
            </button>
          )
        })
      )}
    </>
  )
}

type Mode = 'field' | 'value' | null

export default function SmartFilterBar({ filters, onFiltersChange, fields, placeholder }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<Mode>(null)
  const [pendingField, setPendingField] = useState<FilterFieldDef | null>(null)
  const [pendingNegate, setPendingNegate] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  function closeDropdown() {
    setMode(null)
    setInputValue('')
    setPendingField(null)
    setPendingNegate(false)
    setSearch('')
  }

  function handleInputChange(value: string) {
    setInputValue(value)
    setHighlightIdx(0)

    const analysis = analyzeInput(value)

    if (analysis.mode === 'field') {
      setMode('field')
      setPendingNegate(analysis.negate)
      setSearch(analysis.search)
      setPendingField(null)
      return
    }

    if (analysis.mode === 'value') {
      const field = fields.find((f) => f.id === analysis.fieldId)
      if (field) {
        setMode('value')
        setPendingField(field)
        setPendingNegate(analysis.negate)
        setSearch(analysis.search)
        return
      }
    }

    const pasted = resolveMultiPaste(value, fields, filters)
    if (pasted) {
      onFiltersChange([...filters, ...pasted])
      setInputValue('')
      setMode(null)
      return
    }

    setMode(null)
    setPendingField(null)
    setPendingNegate(false)
    setSearch('')
  }

  function selectField(field: FilterFieldDef) {
    setPendingField(field)
    setMode('value')
    setSearch('')
    setHighlightIdx(0)
    const prefix = pendingNegate ? `-@${field.id}:` : `@${field.id}:`
    setInputValue(prefix)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // selectValue intentionally does NOT close the dropdown — user can pick more values (OR)
  function selectValue(option: FilterFieldOption) {
    if (!pendingField) return
    // Skip if identical filter already exists
    if (filters.some(f => f.fieldId === pendingField.id && f.value === option.value && f.negate === pendingNegate)) {
      return
    }
    onFiltersChange([
      ...filters,
      {
        instanceId: uid(),
        fieldId: pendingField.id,
        fieldLabel: pendingField.label,
        value: option.value,
        label: option.label,
        color: option.color,
        negate: pendingNegate,
      },
    ])
    // Stay in value mode for same field (OR accumulation) — just clear the search text
    setSearch('')
    setInputValue(pendingNegate ? `-@${pendingField.id}:` : `@${pendingField.id}:`)
    setHighlightIdx(0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function removeFilter(instanceId: string) {
    onFiltersChange(filters.filter(f => f.instanceId !== instanceId))
  }

  function toggleNegate(instanceId: string) {
    onFiltersChange(
      filters.map(f => f.instanceId === instanceId ? { ...f, negate: !f.negate } : f)
    )
  }

  function fieldOptions(): FilterFieldDef[] {
    return fields.filter(
      f =>
        f.label.toLowerCase().includes(search.toLowerCase()) ||
        f.id.toLowerCase().includes(search.toLowerCase())
    )
  }

  function valueOptions(): FilterFieldOption[] {
    if (!pendingField) return []
    return pendingField.options.filter(o =>
      o.label.toLowerCase().includes(search.toLowerCase())
    )
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const opts = mode === 'field' ? fieldOptions() : mode === 'value' ? valueOptions() : []
    const key = e.key

    if (key === 'Escape') { closeDropdown(); return }
    if (key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, opts.length - 1)); return }
    if (key === 'ArrowUp')   { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return }
    if (isEnterAccept(key, mode, opts.length)) {
      e.preventDefault()
      if (mode === 'field') selectField(opts[highlightIdx] as FilterFieldDef)
      else selectValue(opts[highlightIdx] as FilterFieldOption)
      return
    }
    if (key === 'Enter' && mode === null && inputValue.trim()) {
      e.preventDefault()
      onFiltersChange([...filters, {
        instanceId: uid(),
        fieldId: 'text',
        fieldLabel: 'Text',
        value: inputValue.trim(),
        label: inputValue.trim(),
        negate: false,
      }])
      setInputValue('')
      return
    }
    if (isBackspaceRemove(key, inputValue, filters.length)) {
      onFiltersChange(filters.slice(0, -1))
    }
  }

  const fOpts = mode === 'field' ? fieldOptions() : []
  const vOpts = mode === 'value' ? valueOptions() : []

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]') as HTMLElement | null
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [highlightIdx])

  return (
    <div ref={containerRef} className="relative min-w-0">
      <div
        className="flex items-center flex-wrap gap-1.5 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 min-h-[40px] cursor-text focus-within:border-brand transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        <SlidersHorizontal size={12} className="text-gray-600 flex-shrink-0 mr-0.5" />

        {filters.map(f => (
          <FilterPill key={f.instanceId} f={f} onToggleNegate={toggleNegate} onRemove={removeFilter} />
        ))}

        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            filters.length === 0
              ? (placeholder ?? 'Type @ to filter by field, or text + Enter to search…')
              : ''
          }
          className="flex-1 min-w-[120px] md:min-w-[140px] bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={mode !== null}
          aria-haspopup="listbox"
        />

        {filters.length > 0 && (
          <button
            onPointerDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); onFiltersChange([]) }}
            className="ml-auto text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0"
            title="Clear all filters"
            aria-label="Clear all filters"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {mode !== null && (
        <div
          ref={listRef}
          className="absolute top-full mt-1.5 left-0 z-50 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/40 py-1 min-w-[220px] max-w-[calc(100vw-2rem)] max-h-64 overflow-y-auto"
          role="listbox"
        >
          {mode === 'field' && (
            <FieldOptions
              opts={fOpts}
              pendingNegate={pendingNegate}
              highlightIdx={highlightIdx}
              onMouseEnter={setHighlightIdx}
              onSelect={selectField}
            />
          )}

          {mode === 'value' && pendingField && (
            <ValueOptions
              opts={vOpts}
              pendingField={pendingField}
              pendingNegate={pendingNegate}
              highlightIdx={highlightIdx}
              filters={filters}
              onMouseEnter={setHighlightIdx}
              onSelect={selectValue}
            />
          )}
        </div>
      )}
    </div>
  )
}
