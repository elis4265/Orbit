"""REQ-161 — task archive: manual archive/restore + hourly auto-archive runner."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.project import Project
from app.models.task import Task

logger = get_logger("archive")


async def auto_archive_due_tasks(session: AsyncSession) -> int:
    """Archive done tasks whose completed_at is older than the project's
    auto_archive_after_days. Returns the number of tasks archived."""
    now = datetime.now(timezone.utc)
    projects = (await session.execute(
        select(Project).where(Project.auto_archive_after_days.is_not(None))
    )).scalars().all()

    total = 0
    for project in projects:
        cutoff = now - timedelta(days=project.auto_archive_after_days)
        result = await session.execute(
            update(Task)
            .where(
                Task.project_id == project.id,
                Task.archived_at.is_(None),
                Task.completed_at.is_not(None),
                Task.completed_at < cutoff,
            )
            .values(archived_at=now)
        )
        if result.rowcount:
            logger.info("auto_archived", project_id=str(project.id), count=result.rowcount)
            total += result.rowcount
    await session.commit()
    return total


async def run_auto_archive() -> None:
    """Scheduler entrypoint — own session, never raises into the scheduler."""
    try:
        from app.database import async_session_local
        async with async_session_local() as session:
            await auto_archive_due_tasks(session)
    except Exception as exc:
        logger.error("auto_archive_failed", error=str(exc))
