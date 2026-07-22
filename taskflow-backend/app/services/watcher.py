import uuid

from app.core.logging import get_logger
from app.repositories.task_watcher import TaskWatcherRepository

logger = get_logger("watcher")


class WatcherService:
    def __init__(self, watcher_repo: TaskWatcherRepository):
        self.watcher_repo = watcher_repo

    async def watch(self, task_id: uuid.UUID, user_id: uuid.UUID) -> None:
        logger.info("watch_task", task_id=str(task_id), user_id=str(user_id))
        await self.watcher_repo.add_watcher(task_id, user_id)

    async def unwatch(self, task_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        logger.info("unwatch_task", task_id=str(task_id), user_id=str(user_id))
        return await self.watcher_repo.remove_watcher(task_id, user_id)

    async def is_watching(self, task_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return await self.watcher_repo.is_watching(task_id, user_id)

    # ── Auto-watch rules (REQ-062) ────────────────────────────────────────────

    async def auto_watch_creator(self, task_id: uuid.UUID, creator_id: uuid.UUID) -> None:
        logger.info("auto_watch_creator", task_id=str(task_id), creator_id=str(creator_id))
        await self.watcher_repo.add_watcher(task_id, creator_id)

    async def auto_watch_assignee(self, task_id: uuid.UUID, assignee_id: uuid.UUID) -> None:
        logger.info("auto_watch_assignee", task_id=str(task_id), assignee_id=str(assignee_id))
        await self.watcher_repo.add_watcher(task_id, assignee_id)

    async def auto_watch_commenter(self, task_id: uuid.UUID, commenter_id: uuid.UUID) -> None:
        logger.info("auto_watch_commenter", task_id=str(task_id), commenter_id=str(commenter_id))
        await self.watcher_repo.add_watcher(task_id, commenter_id)
