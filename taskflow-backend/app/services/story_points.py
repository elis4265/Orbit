"""Pure Story-Points reporting math (velocity, sprint report). DB-free → unit-testable.

`is_resolved(task)` decides whether a task counts as completed (status in the
completed/cancelled category, or done in Flow) — supplied by the caller so this
module stays free of status/category lookups.
"""


def _points(task) -> int:
    return task.estimate or 0


def velocity_series(sprints, tasks_by_sprint, is_resolved, window: int = 3) -> dict:
    """sprints: closed sprints (have .id, .name, .committed_points), oldest→newest.
    tasks_by_sprint: {sprint_id: [tasks]}. Returns committed vs completed per sprint,
    a rolling average of completed over the last `window`, and a suggested capacity."""
    series = []
    for s in sprints:
        tasks = tasks_by_sprint.get(s.id, [])
        completed = sum(_points(t) for t in tasks if is_resolved(t))
        series.append({
            "sprint_id": s.id,
            "name": s.name,
            "committed": s.committed_points,
            "completed": completed,
        })
    recent = [p["completed"] for p in series[-window:]] if window > 0 else []
    rolling = sum(recent) / len(recent) if recent else 0.0
    return {
        "sprints": series,
        "rolling_average": round(rolling, 1),
        "suggested_capacity": round(rolling),
    }


def sprint_report(sprint, tasks, is_resolved) -> dict:
    """Committed vs completed for one sprint, plus scope change and carryover.
    scope_change = current total points − committed snapshot (positive = added)."""
    total = sum(_points(t) for t in tasks)
    completed = sum(_points(t) for t in tasks if is_resolved(t))
    return {
        "committed": sprint.committed_points,
        "completed": completed,
        "total": total,
        "scope_change": total - sprint.committed_points,
        "carryover": total - completed,
        "task_count": len(tasks),
        "completed_count": sum(1 for t in tasks if is_resolved(t)),
    }
