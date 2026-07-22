"""Orchestration for Flow-mode automated cycles (IO; pure math lives in cycles.py).

Reconciles a project's CycleConfig against its auto-managed `sprints` rows:
creates missing cycles, activates the current one, and on a cycle's end rolls its
unfinished tasks into the current cycle before closing it.
"""
from datetime import date

from app.models.task import TaskStatus
from app.services.cycles import generate_cycle_windows, reconcile


def _flow_resolved(t) -> bool:
    """Flow mode uses the three fixed statuses; resolved == done."""
    status_value = getattr(t.status, "value", t.status)
    return status_value == TaskStatus.done.value


async def reconcile_project_cycles(config, on_date: date, sprint_repo, task_repo) -> dict:
    windows = generate_cycle_windows(
        config.start_anchor,
        config.duration_weeks,
        config.cooldown_days,
        on_date,
        config.upcoming_count,
    )
    existing = await sprint_repo.list_auto_cycles(config.project_id)
    to_create, to_close = reconcile(windows, existing, on_date)

    by_start = {e.start_date: e for e in existing}
    for w in to_create:
        status = "active" if w.start <= on_date <= w.end else "planned"
        row = await sprint_repo.create_cycle(
            config.project_id, name=w.name, start=w.start, end=w.end, status=status
        )
        by_start[w.start] = row

    current_window = next((w for w in windows if w.start <= on_date <= w.end), None)
    current = by_start.get(current_window.start) if current_window else None
    if current is not None and current.status == "planned":
        await sprint_repo.activate(current)

    rolled = 0
    for c in to_close:
        if current is not None and current.id != c.id:
            tasks = await task_repo.get_project_tasks_filtered(config.project_id, c.id)
            incomplete_ids = [t.id for t in tasks if not _flow_resolved(t)]
            if incomplete_ids:
                await task_repo.bulk_update(config.project_id, incomplete_ids, {"sprint_id": current.id})
                rolled += len(incomplete_ids)
        await sprint_repo.close(c)

    # R-O7: auto-add started (in_progress) cycle-less tasks to the current cycle.
    # Unstarted/backlog tasks stay out so the backlog remains meaningful.
    added = 0
    if current is not None:
        backlog = await task_repo.get_project_tasks_filtered(config.project_id, "none")
        started_ids = [
            t.id for t in backlog
            if getattr(t.status, "value", t.status) == TaskStatus.in_progress.value
        ]
        if started_ids:
            await task_repo.bulk_update(config.project_id, started_ids, {"sprint_id": current.id})
            added = len(started_ids)

    return {"created": len(to_create), "closed": len(to_close), "rolled": rolled, "added": added}


async def disable_project_cycles(project_id, sprint_repo) -> dict:
    """R-O8: on disable, close the active auto cycle and drop upcoming (planned)
    ones. Tasks on the closed cycle keep their sprint_id."""
    closed = removed = 0
    for c in await sprint_repo.list_auto_cycles(project_id):
        if c.status == "active":
            await sprint_repo.close(c)
            closed += 1
        elif c.status == "planned":
            await sprint_repo.delete(c)
            removed += 1
    return {"closed": closed, "removed": removed}
