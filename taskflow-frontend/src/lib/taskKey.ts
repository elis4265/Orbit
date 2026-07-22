// The human-facing task identifier — "HW-22". People refer to issues by number far
// more than by title, so it belongs anywhere a task is listed or picked.
//
// The pieces come from different shapes (Task, TaskSearchResult, LinkedTaskInfo,
// ParentTaskInfo), hence the structural parameter rather than a Task.

interface TaskKeyParts {
  project_key?: string | null
  sequence_number?: number | null
}

/**
 * Format a task key. Falls back to the bare number when the project key is
 * missing (older payloads, the deleted-task placeholder), and to '' when there
 * is no number either — callers can then skip rendering it entirely.
 */
export function taskKey(parts: TaskKeyParts): string {
  const seq = parts.sequence_number
  if (seq === null || seq === undefined) return ''
  return parts.project_key ? `${parts.project_key}-${seq}` : String(seq)
}
