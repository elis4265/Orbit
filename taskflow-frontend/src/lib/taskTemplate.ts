import type { TaskTemplate, IssueType, SeverityLevel } from '../types'

/** The subset of the create-task form a template can prefill. */
export interface TemplateFormFields {
  title: string
  description: string
  issueType: IssueType
  severity: SeverityLevel | ''
  priorityId: string | null
  tagIds: string[]
}

/**
 * Apply a template onto the current form values. A template overrides only the
 * fields it actually sets — anything the template leaves blank keeps the user's
 * current value (so picking a template doesn't wipe a title they already typed).
 */
export function applyTemplate(current: TemplateFormFields, t: TaskTemplate): TemplateFormFields {
  return {
    title: t.title && t.title.trim() ? t.title : current.title,
    description: t.description != null && t.description !== '' ? t.description : current.description,
    issueType: (t.issue_type as IssueType) || current.issueType,
    severity: (t.severity as SeverityLevel) || current.severity,
    priorityId: t.priority_id ?? current.priorityId,
    tagIds: t.tag_ids && t.tag_ids.length ? t.tag_ids : current.tagIds,
  }
}
