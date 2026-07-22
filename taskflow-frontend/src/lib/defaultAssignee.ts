import type { DefaultAssigneeMode } from '../types'

interface DefaultAssigneeSource {
  default_assignee_mode?: DefaultAssigneeMode
  default_assignee_id?: string | null
}

/**
 * HW-18: which member the Create Task modal should pre-select.
 *
 * The server applies the same policy at creation time (TaskService.resolve_default_assignee);
 * pre-filling exists so the creator can *see* it and change it before saving rather than
 * discovering afterwards who the task landed on.
 *
 * Returns '' — the modal's "Unassigned" option — whenever there is nothing to pre-fill,
 * including while useProjects/useMe are still resolving. Guessing would be worse than
 * leaving it blank: a wrong assignee looks deliberate and nobody re-checks a filled field.
 */
export function resolveDefaultAssignee(
  project: DefaultAssigneeSource | undefined,
  currentUserId: string | undefined,
): string {
  if (!project) return ''
  switch (project.default_assignee_mode) {
    case 'creator':
      return currentUserId ?? ''
    case 'member':
      return project.default_assignee_id ?? ''
    default:
      return ''
  }
}
