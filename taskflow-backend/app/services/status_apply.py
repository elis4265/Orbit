"""Shared status-transition applier — used by VCS webhooks and automation rules.

Flow → fixed enum; Guided/Enforced → ProjectStatus row; Enforced validates
against transition rules (illegal → note + skip). Returns 'changed'|'blocked'|'noop'.
Target is given by status *category* ('in_progress'|'done') or status *name*.
"""
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.core.errors import AppError
from app.models.comment import Comment
from app.models.project_status import ProjectStatus
from app.models.task import TaskStatus
from app.repositories.project_status import ProjectStatusRepository
from app.services.project_status import ProjectStatusService

_RESOLVED_CATEGORIES = {"completed", "cancelled"}

# HW-31: the fixed enum a custom status's category maps to. The scheduler, blocker gate,
# stats and the ?status= filter all read task.status, so it must track the custom status
# rather than staying frozen at the task's creation value. Same mapping used by the
# Guided/Enforced → Flow mode switch (_CATEGORY_TO_TASK_STATUS) and the UI update path.
_CATEGORY_TO_ENUM = {
    "unstarted": TaskStatus.todo,
    "started": TaskStatus.in_progress,
    "completed": TaskStatus.done,
    "cancelled": TaskStatus.done,
}


def _stamp_completed_at(task, resolved: bool) -> None:
    """REQ-137: stamp on entering a resolved state (preserving an existing stamp),
    clear on leaving it."""
    task.completed_at = (task.completed_at or datetime.now(timezone.utc)) if resolved else None


_CATEGORY = {"in_progress": "started", "done": "completed"}
_FLOW = {
    "todo": TaskStatus.todo, "to_do": TaskStatus.todo, "to do": TaskStatus.todo,
    "in_progress": TaskStatus.in_progress, "in progress": TaskStatus.in_progress,
    "done": TaskStatus.done,
}


def _flow_target(category, name):
    if name:
        return _FLOW.get(name.strip().lower())
    if category == "in_progress":
        return TaskStatus.in_progress
    if category == "done":
        return TaskStatus.done
    return None


async def _find_by_category(session, project_id, category):
    if not category:
        return None
    return (await session.execute(
        select(ProjectStatus).where(
            ProjectStatus.project_id == project_id,
            ProjectStatus.category == category,
            ProjectStatus.is_active.is_(True),
        ).order_by(ProjectStatus.position).limit(1)
    )).scalars().first()


async def _find_by_name(session, project_id, name):
    if not name:
        return None
    return (await session.execute(
        select(ProjectStatus).where(
            ProjectStatus.project_id == project_id,
            func.lower(ProjectStatus.name) == name.strip().lower(),
            ProjectStatus.is_active.is_(True),
        ).limit(1)
    )).scalars().first()


async def apply_transition(session, task, project, *, category=None, name=None) -> str:
    if project.mode == "open":
        target = _flow_target(category, name)
        if target is None or task.status == target:
            return "noop"
        task.status = target
        _stamp_completed_at(task, target == TaskStatus.done)
        return "changed"

    status = (await _find_by_name(session, project.id, name) if name
              else await _find_by_category(session, project.id, _CATEGORY.get(category)))
    if status is None or task.custom_status_id == status.id:
        return "noop"

    if project.mode == "enforced":
        try:
            await ProjectStatusService(ProjectStatusRepository(session)).validate_transition(
                project.id, "enforced", task.custom_status_id, status.id, task.issue_type,
            )
        except AppError:
            session.add(Comment(
                task_id=task.id, author_id=None,
                content=f"⚠️ Auto-transition to “{status.name}” blocked by Enforced transition rules.",
            ))
            return "blocked"

    task.custom_status_id = status.id
    # HW-31: keep the fixed enum in step with the custom status's category.
    task.status = _CATEGORY_TO_ENUM.get(status.category, task.status)
    _stamp_completed_at(task, status.category in _RESOLVED_CATEGORIES)
    return "changed"
