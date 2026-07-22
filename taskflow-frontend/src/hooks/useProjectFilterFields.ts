// REQ-166 — shared SmartFilterBar field definitions (Issues page + Export page).
import { useMemo } from 'react'
import { useMembers } from './useMembers'
import { useTags } from './useTags'
import { useProjectStatuses } from './useProjectStatuses'
import { useProjectPriorities } from './usePriorities'
import type { FilterFieldDef } from '../components/SmartFilterBar'

export function useProjectFilterFields(projectId: string, mode: string) {
  const { data: members = [] } = useMembers(projectId)
  const { data: allTags = [] } = useTags(projectId)
  const { data: projectStatuses = [] } = useProjectStatuses(projectId || undefined)
  const { data: priorityItems = [] } = useProjectPriorities(projectId || undefined)

  const isCustomMode = mode !== 'open' && projectStatuses.length > 0

  const filterFields: FilterFieldDef[] = useMemo(() => [
    {
      id: 'status', label: 'Status',
      options: isCustomMode
        ? projectStatuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))
        : [
            { value: 'todo', label: 'To Do' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'done', label: 'Done' },
          ],
    },
    {
      id: 'assignee', label: 'Assignee',
      options: members.map((m) => ({ value: m.id, label: m.username ?? m.email })),
    },
    {
      id: 'tag', label: 'Tag',
      options: allTags.map((t) => ({ value: t.id, label: t.name, color: t.color })),
    },
    {
      id: 'type', label: 'Type',
      options: ['epic', 'story', 'task', 'bug'].map((t) => ({ value: t, label: t })),
    },
    {
      id: 'priority', label: 'Priority',
      options: priorityItems.map((p) => ({ value: p.id, label: p.name })),
    },
  ], [isCustomMode, projectStatuses, members, allTags, priorityItems])

  return { filterFields, isCustomMode, members, allTags, projectStatuses, priorityItems }
}
