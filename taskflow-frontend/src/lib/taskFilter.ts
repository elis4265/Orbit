import type { Task, TaskStatus } from '../types'
import type { ActiveFilter } from '../components/SmartFilterBar'
import { isThisWeek, isPast, isToday, parseISO, startOfDay, startOfWeek, addWeeks } from 'date-fns'

function isNextWeek(date: Date, opts: { weekStartsOn: 0 | 1 }): boolean {
  const nextWeekStart = addWeeks(startOfWeek(new Date(), opts), 1)
  const nextWeekEnd = addWeeks(nextWeekStart, 1)
  return date >= nextWeekStart && date < nextWeekEnd
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ')
}

// REQ-152: id sets resolved server-side (/related-to-me) for identity filters.
export interface IdentitySets {
  commented: Set<string>
  mentioned: Set<string>
}

export function taskMatchesFilter(t: Task, f: ActiveFilter, isCustomMode: boolean, idSets?: IdentitySets): boolean {
  switch (f.fieldId) {
    case 'related': {
      const set = f.value === 'commented' ? idSets?.commented : idSets?.mentioned
      return set?.has(t.id) ?? false
    }

    case 'tag':
      return t.tags?.some((tag) => tag.id === f.value) ?? false

    case 'assignee':
      return (t.assignee_id ?? '') === f.value

    case 'status':
      if (isCustomMode) return (t.custom_status_id ?? '') === f.value
      return t.status === (f.value as TaskStatus)

    case 'priority':
      return (t.priority_id ?? '') === f.value

    case 'type':
      return (t.issue_type ?? 'task') === f.value

    case 'epic':
      // matches the epic itself or any task whose parent is this epic
      return t.id === f.value || t.parent_id === f.value

    case 'sprint':
      return (t.sprint_id ?? '') === f.value

    case 'severity':
      return (t.severity ?? '') === f.value

    case 'due': {
      if (f.value === 'none') return !t.due_date
      if (!t.due_date) return false
      const d = startOfDay(parseISO(t.due_date))
      if (f.value === 'overdue')   return isPast(d) && !isToday(d) && !t.completed_at
      if (f.value === 'today')     return isToday(d)
      if (f.value === 'this_week') return isThisWeek(d, { weekStartsOn: 1 })
      if (f.value === 'next_week') return isNextWeek(d, { weekStartsOn: 1 })
      return false
    }

    case 'text': {
      const q = f.value.toLowerCase()
      return t.title.toLowerCase().includes(q)
          || stripHtml(t.description ?? '').toLowerCase().includes(q)
    }

    default:
      return true
  }
}

export function applyTaskFilters(t: Task, activeFilters: ActiveFilter[], isCustomMode: boolean, idSets?: IdentitySets): boolean {
  if (activeFilters.length === 0) return true
  const grouped = new Map<string, ActiveFilter[]>()
  for (const f of activeFilters) {
    const arr = grouped.get(f.fieldId) ?? []
    arr.push(f)
    grouped.set(f.fieldId, arr)
  }
  return [...grouped.values()].every((group) => {
    const pos = group.filter((f) => !f.negate)
    const neg = group.filter((f) => f.negate)
    return (pos.length === 0 || pos.some((f) => taskMatchesFilter(t, f, isCustomMode, idSets)))
        && neg.every((f) => !taskMatchesFilter(t, f, isCustomMode, idSets))
  })
}
