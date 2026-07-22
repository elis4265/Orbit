import uuid
from typing import Sequence

from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_link import TaskLink


class TaskLinkRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_for_task(self, task_id: uuid.UUID) -> Sequence[TaskLink]:
        result = await self.session.execute(
            select(TaskLink).where(
                or_(TaskLink.source_id == task_id, TaskLink.target_id == task_id)
            )
        )
        return result.scalars().all()

    async def get(self, link_id: uuid.UUID) -> TaskLink | None:
        result = await self.session.execute(
            select(TaskLink).where(TaskLink.id == link_id)
        )
        return result.scalars().first()

    async def exists(self, source_id: uuid.UUID, target_id: uuid.UUID, link_type: str) -> bool:
        result = await self.session.execute(
            select(TaskLink).where(
                TaskLink.source_id == source_id,
                TaskLink.target_id == target_id,
                TaskLink.link_type == link_type,
            )
        )
        return result.scalars().first() is not None

    async def create(self, data: dict) -> TaskLink:
        link = TaskLink(**data)
        self.session.add(link)
        await self.session.commit()
        await self.session.refresh(link)
        return link

    async def get_incoming_active_blocks(self, task_id: uuid.UUID) -> list[TaskLink]:
        from app.models.task import Task, TaskStatus
        result = await self.session.execute(
            select(TaskLink)
            .join(Task, Task.id == TaskLink.source_id)
            .where(
                TaskLink.target_id == task_id,
                TaskLink.link_type == "blocks",
                Task.status != TaskStatus.done,
            )
        )
        return list(result.scalars().all())

    async def delete(self, link: TaskLink) -> None:
        await self.session.delete(link)
        await self.session.commit()
