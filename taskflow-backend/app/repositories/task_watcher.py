import uuid
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_watcher import TaskWatcher
from app.models.user import User


class TaskWatcherRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_watchers(self, task_id: uuid.UUID) -> list[User]:
        result = await self.session.execute(
            select(User)
            .join(TaskWatcher, TaskWatcher.user_id == User.id)
            .where(TaskWatcher.task_id == task_id)
        )
        return list(result.scalars().all())

    async def get_watcher_ids(self, task_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.session.execute(
            select(TaskWatcher.user_id).where(TaskWatcher.task_id == task_id)
        )
        return list(result.scalars().all())

    async def is_watching(self, task_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            select(TaskWatcher).where(
                TaskWatcher.task_id == task_id,
                TaskWatcher.user_id == user_id,
            )
        )
        return result.scalars().first() is not None

    async def add_watcher(self, task_id: uuid.UUID, user_id: uuid.UUID) -> None:
        if await self.is_watching(task_id, user_id):
            return
        self.session.add(TaskWatcher(task_id=task_id, user_id=user_id))
        await self.session.commit()

    async def remove_watcher(self, task_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            delete(TaskWatcher).where(
                TaskWatcher.task_id == task_id,
                TaskWatcher.user_id == user_id,
            )
        )
        await self.session.commit()
        return result.rowcount > 0
