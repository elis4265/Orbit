import uuid
from sqlalchemy import select, delete, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tag import Tag, TagVisibility
from app.models.task_tag import TaskTag


class TagRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_visible(self, project_id: uuid.UUID, user_id: uuid.UUID) -> list[Tag]:
        """Workspace-scoped tags + user's own private tags."""
        result = await self.session.execute(
            select(Tag).where(
                Tag.project_id == project_id,
                (Tag.visibility == TagVisibility.workspace)
                | (Tag.owner_id == user_id),
            ).order_by(Tag.name)
        )
        return list(result.scalars().all())

    async def get_by_id(self, tag_id: uuid.UUID) -> Tag | None:
        result = await self.session.execute(select(Tag).where(Tag.id == tag_id))
        return result.scalars().first()

    async def get_by_name(self, project_id: uuid.UUID, name: str) -> Tag | None:
        result = await self.session.execute(
            select(Tag).where(
                Tag.project_id == project_id,
                func.lower(Tag.name) == name.lower(),
            )
        )
        return result.scalars().first()

    async def create(self, project_id: uuid.UUID, owner_id: uuid.UUID, name: str, color: str, visibility: TagVisibility) -> Tag:
        tag = Tag(
            project_id=project_id,
            owner_id=owner_id,
            name=name,
            color=color,
            visibility=visibility,
        )
        self.session.add(tag)
        await self.session.commit()
        await self.session.refresh(tag)
        return tag

    async def update(self, tag: Tag, data: dict) -> Tag:
        for key, value in data.items():
            setattr(tag, key, value)
        await self.session.commit()
        await self.session.refresh(tag)
        return tag

    async def delete(self, tag: Tag) -> None:
        await self.session.delete(tag)
        await self.session.commit()

    async def get_task_tags(self, task_id: uuid.UUID) -> list[Tag]:
        result = await self.session.execute(
            select(Tag)
            .join(TaskTag, TaskTag.tag_id == Tag.id)
            .where(TaskTag.task_id == task_id)
            .order_by(Tag.name)
        )
        return list(result.scalars().all())

    async def is_applied(self, task_id: uuid.UUID, tag_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            select(TaskTag).where(
                TaskTag.task_id == task_id,
                TaskTag.tag_id == tag_id,
            )
        )
        return result.scalars().first() is not None

    async def add_to_task(self, task_id: uuid.UUID, tag_id: uuid.UUID, added_by: uuid.UUID) -> None:
        if await self.is_applied(task_id, tag_id):
            return
        self.session.add(TaskTag(task_id=task_id, tag_id=tag_id, added_by=added_by))
        await self.session.commit()

    async def remove_from_task(self, task_id: uuid.UUID, tag_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            delete(TaskTag).where(
                TaskTag.task_id == task_id,
                TaskTag.tag_id == tag_id,
            )
        )
        await self.session.commit()
        return result.rowcount > 0

    async def get_tasks_by_tag(self, tag_id: uuid.UUID) -> list[uuid.UUID]:
        result = await self.session.execute(
            select(TaskTag.task_id).where(TaskTag.tag_id == tag_id)
        )
        return list(result.scalars().all())
