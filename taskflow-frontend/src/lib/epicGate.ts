import type { IssueType, TaskStatus } from '../types'

interface ChildLike {
  parent_id?: string | null
  status: TaskStatus
}

interface EpicLike {
  id: string
  title: string
  issue_type: IssueType | null
}

export function countIncompleteChildren(tasks: ChildLike[], epicId: string): number {
  return tasks.filter((t) => t.parent_id === epicId && t.status !== 'done').length
}

/** Warning text when an epic is completed with open children, or null if no warning applies. */
export function epicDoneWarning(task: EpicLike, projectTasks: ChildLike[]): string | null {
  if (task.issue_type !== 'epic') return null
  const n = countIncompleteChildren(projectTasks, task.id)
  if (n === 0) return null
  return `"${task.title}" moved to Done with ${n} incomplete child task${n > 1 ? 's' : ''}.`
}

/**
 * Incomplete-child count iff completing `task` warrants a heads-up: an epic
 * entering done from a non-done status. 0 means apply without confirmation.
 */
export function epicDoneGateCount(
  task: EpicLike & { status: TaskStatus },
  targetStatus: TaskStatus,
  projectTasks: ChildLike[],
): number {
  if (task.issue_type !== 'epic') return 0
  if (targetStatus !== 'done' || task.status === 'done') return 0
  return countIncompleteChildren(projectTasks, task.id)
}
