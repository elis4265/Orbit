"""Pure release progress / ship-readiness math. DB-free → unit-testable.

A release groups tasks (via ``task.release_id``). Progress = done ÷ total, where
"done" depends on the project mode: custom-status modes use the set of
completed-category status ids; open/Flow uses the fixed ``status == 'done'`` enum.
The IO (loading tasks, flipping status) lives in the service/router layer.
"""


def _val(x):
    return getattr(x, "value", x)


def is_task_done(task, completed_status_ids: set[str] | None = None) -> bool:
    """True when a task counts as completed for release progress."""
    if completed_status_ids and getattr(task, "custom_status_id", None) is not None:
        return str(task.custom_status_id) in completed_status_ids
    return _val(getattr(task, "status", None)) == "done"


def release_progress(tasks, completed_status_ids: set[str] | None = None) -> dict:
    """{total_tasks, done_tasks, progress_pct} for a release's linked tasks."""
    total = len(tasks)
    done = sum(1 for t in tasks if is_task_done(t, completed_status_ids))
    pct = round(done / total * 100) if total else 0
    return {"total_tasks": total, "done_tasks": done, "progress_pct": pct}


def ship_summary(tasks, completed_status_ids: set[str] | None = None) -> dict:
    """Progress + whether the release can ship cleanly (no incomplete tasks).

    v1 allows shipping with unfinished work — this only surfaces the count so the
    UI/endpoint can warn. (Enforced complete-with-decision gate is a fast-follow.)
    """
    prog = release_progress(tasks, completed_status_ids)
    incomplete = prog["total_tasks"] - prog["done_tasks"]
    return {**prog, "incomplete_tasks": incomplete, "clean": incomplete == 0}
