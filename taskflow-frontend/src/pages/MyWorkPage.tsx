import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMyWork } from '../hooks/useMyWork'
import IssueTypeBadge from '../components/IssueTypeBadge'
import type { MyWorkFacet, Task } from '../types'

// REQ-142: personal cross-project view — Linear's My Issues tabs, Orbit data.
const FACETS: { id: MyWorkFacet; label: string }[] = [
  { id: 'assigned', label: 'Assigned to me' },
  { id: 'created', label: 'Created by me' },
  { id: 'watching', label: 'Watching' },
]

const STATUS_LABEL: Record<Task['status'], string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
}

const STATUS_COLOR: Record<Task['status'], string> = {
  todo: 'bg-gray-700 text-gray-300',
  in_progress: 'bg-brand/20 text-brand',
  done: 'bg-green-900/60 text-green-300',
}

// HW-30: in guided/enforced projects the real status is the custom one — the fixed `status`
// enum is bypassed by custom statuses and goes stale (a task sitting in a custom "Done"
// column still reads status=todo). Board and Issues resolve the name from the project's
// status list, but My Work spans projects, so the API resolves it for us. Prefer that;
// fall back to the fixed enum for Flow projects.
const CATEGORY_COLOR: Record<string, string> = {
  unstarted: 'bg-gray-700 text-gray-300',
  started: 'bg-brand/20 text-brand',
  completed: 'bg-green-900/60 text-green-300',
  cancelled: 'bg-gray-800 text-gray-500 line-through',
}

function statusBadge(task: Task): { label: string; color: string } {
  if (task.custom_status_name) {
    return {
      label: task.custom_status_name,
      color: CATEGORY_COLOR[task.custom_status_category ?? ''] ?? STATUS_COLOR.todo,
    }
  }
  return { label: STATUS_LABEL[task.status], color: STATUS_COLOR[task.status] }
}

function isOverdue(task: Task): boolean {
  // completed_at is the category-aware done signal (set for any completed/cancelled
  // status incl. user-defined ones); task.status is the legacy enum custom statuses bypass.
  return !!task.due_date && !task.completed_at && new Date(task.due_date) < new Date()
}

function dueLabel(dueDate: string): string {
  return new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function MyWorkPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const rawFacet = params.get('facet')
  const facet: MyWorkFacet = FACETS.some((f) => f.id === rawFacet) ? (rawFacet as MyWorkFacet) : 'assigned'
  const { data: tasks = [], isLoading } = useMyWork(facet)

  const overdueCount = tasks.filter(isOverdue).length

  return (
    <div className="flex-1 min-h-0 overflow-y-auto text-gray-100">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl font-bold">My Work</h1>
          {overdueCount > 0 && (
            <span className="text-xs font-semibold text-red-400 bg-red-900/40 rounded-full px-2 py-0.5">
              {overdueCount} overdue
            </span>
          )}
        </div>

        <div className="flex flex-nowrap items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-0.5 mb-4 max-w-full overflow-x-auto md:w-fit md:overflow-x-visible">
          {FACETS.map((f) => (
            <button
              key={f.id}
              onClick={() => setParams({ facet: f.id })}
              className={`flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-sm transition-colors ${
                facet === f.id ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Nothing here — {facet === 'assigned' ? 'no tasks assigned to you' : facet === 'created' ? 'you have not created any tasks' : 'you are not watching any tasks'}.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-800 border border-gray-800 rounded-xl bg-gray-900 overflow-hidden">
            {tasks.map((task) => (
              <li key={task.id}>
                <button
                  onClick={() => navigate(`/projects/${task.project_key || task.project_id}?task=${task.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/60 transition-colors"
                >
                  <IssueTypeBadge type={task.issue_type ?? 'task'} size={14} />
                  <span className="text-xs font-bold text-gray-500 shrink-0">
                    {task.project_key}-{task.sequence_number}
                  </span>
                  <span className="text-sm text-gray-100 truncate flex-1">{task.title}</span>
                  {task.due_date && (
                    <span className={`text-xs shrink-0 ${isOverdue(task) ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                      {dueLabel(task.due_date)}
                    </span>
                  )}
                  <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${statusBadge(task).color}`}>
                    {statusBadge(task).label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
