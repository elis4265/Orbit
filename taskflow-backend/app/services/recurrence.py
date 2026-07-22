"""Recurring tasks (REQ-148): next-occurrence math + the scheduler runner.

The date math is pure and unit-tested. The runner creates tasks through the
normal TaskService path, so activity, watchers, WS broadcasts and outbound
webhooks all fire exactly as if a user created the task.
"""
import calendar
from datetime import date, timedelta

from sqlalchemy import select

from app.core.logging import get_logger

logger = get_logger("recurrence")


def next_occurrence(cadence: str, after: date, weekday: int | None = None, day_of_month: int | None = None) -> date:
    """Strictly-next run date after `after`. weekday: 0=Monday…6=Sunday.
    Monthly clamps day_of_month to the target month's length (31st → Feb 28)."""
    if cadence == "daily":
        return after + timedelta(days=1)
    if cadence == "weekly":
        days_ahead = (weekday - after.weekday()) % 7
        return after + timedelta(days=days_ahead or 7)
    # monthly
    if day_of_month > after.day:
        clamped = min(day_of_month, calendar.monthrange(after.year, after.month)[1])
        if clamped > after.day:
            return date(after.year, after.month, clamped)
    year, month = (after.year + 1, 1) if after.month == 12 else (after.year, after.month + 1)
    return date(year, month, min(day_of_month, calendar.monthrange(year, month)[1]))


async def run_due_recurring_tasks(session) -> int:
    """Create tasks for every enabled rule whose next_run_at has arrived.
    Returns the number of tasks created. One bad rule never stops the others."""
    from app.models.recurring_task import RecurringTask
    from app.models.task_template import TaskTemplate
    from app.repositories.task import TaskRepository
    from app.schemas.task import TaskCreate
    from app.services.task import TaskService

    today = date.today()
    rules = (await session.execute(
        select(RecurringTask).where(RecurringTask.enabled.is_(True), RecurringTask.next_run_at <= today)
    )).scalars().all()

    created = 0
    from app.repositories.project import ProjectRepository
    # project_repo: HW-18 — recurring tasks honour the project's default assignee too.
    task_service = TaskService(TaskRepository(session), project_repo=ProjectRepository(session))
    for rule in rules:
        try:
            template = await session.get(TaskTemplate, rule.template_id)
            if template is None:
                rule.enabled = False  # orphaned rule — disable instead of failing forever
                continue
            payload = TaskCreate(
                title=template.title or template.name,
                description=template.description,
                issue_type=template.issue_type or "task",
                priority_id=template.priority_id,
                severity=template.severity,
            )
            await task_service.create_task(rule.project_id, payload, created_by=rule.created_by)
            rule.next_run_at = next_occurrence(rule.cadence, today, rule.weekday, rule.day_of_month)
            created += 1
        except Exception as exc:
            logger.error("recurring_task_failed", rule_id=str(rule.id), error=str(exc))
    await session.commit()
    logger.info("recurring_tasks_run", created=created)
    return created
