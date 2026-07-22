from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.core.logging import get_logger
from app.database import async_session_local as AsyncSessionLocal
from app.models.task import Task, TaskStatus

logger = get_logger("scheduler")

scheduler = AsyncIOScheduler(timezone="UTC")


async def _check_due_dates() -> None:
    logger.info("due_date_check_start")
    from app.repositories.task_watcher import TaskWatcherRepository
    from app.repositories.notification import NotificationRepository
    from app.repositories.notification_preferences import NotificationPreferencesRepository
    from app.repositories.user import UserRepository
    from app.services.notification import NotificationService

    async with AsyncSessionLocal() as session:
        now = datetime.now(timezone.utc)
        notif_repo = NotificationRepository(session)
        prefs_repo = NotificationPreferencesRepository(session)
        watcher_repo = TaskWatcherRepository(session)
        user_repo = UserRepository(session)
        notif_service = NotificationService(notif_repo, prefs_repo, watcher_repo, user_repo)

        # Gather all workspace member reminder_hours to build a superset window.
        # Simplification: scan tasks due within max(24..72) hours.
        # Per-user due_date_reminder_hours checked inside NotificationService.
        lookahead = timedelta(hours=72)
        result = await session.execute(
            select(Task).where(
                Task.due_date.isnot(None),
                Task.due_date >= now,
                Task.due_date <= now + lookahead,
                Task.status != TaskStatus.done,
            )
        )
        tasks = result.scalars().all()
        logger.info("due_date_check_tasks_found", count=len(tasks))

        for task in tasks:
            watcher_ids = await watcher_repo.get_watcher_ids(task.id)
            candidate_ids = list({*watcher_ids, *([task.assignee_id] if task.assignee_id else [])})
            prefs_map = await prefs_repo.get_for_users(candidate_ids, task.workspace_id)

            for uid, prefs in prefs_map.items():
                if not prefs.on_due_date_approaching:
                    continue
                hours_until = (task.due_date.replace(tzinfo=timezone.utc) - now).total_seconds() / 3600
                if hours_until > prefs.due_date_reminder_hours:
                    continue
                await notif_service.on_due_date_approaching(
                    task_id=task.id,
                    workspace_id=task.workspace_id,
                    task_title=task.title,
                    assignee_id=task.assignee_id,
                    watcher_ids=watcher_ids,
                )
                break  # on_due_date_approaching handles all candidates internally


async def _run_cycle_reconciliation() -> None:
    """Flow-mode automated cycles: ensure current+upcoming cycles exist and roll
    unfinished tasks forward on cycle end. Runs for every enabled CycleConfig."""
    from app.models.cycle_config import CycleConfig
    from app.repositories.sprint import SprintRepository
    from app.repositories.task import TaskRepository
    from app.services.cycle_runner import reconcile_project_cycles

    logger.info("cycle_reconciliation_start")
    async with AsyncSessionLocal() as session:
        today = datetime.now(timezone.utc).date()
        configs = (await session.execute(
            select(CycleConfig).where(CycleConfig.enabled.is_(True))
        )).scalars().all()

        sprint_repo = SprintRepository(session)
        task_repo = TaskRepository(session)
        for cfg in configs:
            try:
                result = await reconcile_project_cycles(cfg, today, sprint_repo, task_repo)
                logger.info("cycle_reconciled", project_id=str(cfg.project_id), **result)
            except Exception as exc:  # one bad project must not stop the others
                logger.error("cycle_reconcile_failed", project_id=str(cfg.project_id), error=str(exc))


async def _run_recurring_tasks() -> None:
    """REQ-148: create tasks for recurring rules whose next_run_at has arrived."""
    from app.services.recurrence import run_due_recurring_tasks

    async with AsyncSessionLocal() as session:
        await run_due_recurring_tasks(session)


async def _run_auto_archive() -> None:
    """REQ-161: archive done tasks past the project's auto_archive_after_days."""
    from app.services.archive import run_auto_archive

    await run_auto_archive()


def start_scheduler() -> None:
    scheduler.add_job(_check_due_dates, "interval", hours=1, id="due_date_check", replace_existing=True)
    scheduler.add_job(_run_cycle_reconciliation, "interval", hours=6, id="cycle_reconciliation", replace_existing=True)
    scheduler.add_job(_run_recurring_tasks, "interval", hours=1, id="recurring_tasks", replace_existing=True)
    scheduler.add_job(_run_auto_archive, "interval", hours=1, id="auto_archive", replace_existing=True)
    scheduler.start()
    logger.info("scheduler_started")


def stop_scheduler() -> None:
    if not scheduler.running:
        return
    try:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
    except RuntimeError:
        pass  # event loop already closed in test environments
