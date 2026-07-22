import uuid
from typing import Sequence

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.task import Task
from app.models.task_link import TaskLink, LinkType, INVERSE_LINK_LABEL, LINK_DISPLAY_LABEL
from app.repositories.task_link import TaskLinkRepository
from app.schemas.task_link import TaskLinkResponse, LinkedTaskInfo


class TaskLinkService:
    def __init__(self, repo: TaskLinkRepository, session: AsyncSession):
        self.repo = repo
        self.session = session

    async def _build_response(self, link: TaskLink, perspective_task_id: uuid.UUID) -> TaskLinkResponse:
        lt = link.link_type.value if isinstance(link.link_type, LinkType) else link.link_type
        if link.source_id == perspective_task_id:
            linked_task_id = link.target_id
            display_type = LINK_DISPLAY_LABEL.get(lt, lt)
        else:
            linked_task_id = link.source_id
            inverse = INVERSE_LINK_LABEL.get(lt, lt)
            display_type = LINK_DISPLAY_LABEL.get(inverse, inverse)

        # Task.project_key reads Task.project, so eager-load it — a lazy load here
        # would raise MissingGreenlet under async SQLAlchemy (cf. services/search.py).
        result = await self.session.execute(
            select(Task).options(selectinload(Task.project)).where(Task.id == linked_task_id)
        )
        linked = result.scalars().first()

        return TaskLinkResponse(
            id=link.id,
            source_id=link.source_id,
            target_id=link.target_id,
            link_type=link.link_type,
            display_type=display_type,
            linked_task=LinkedTaskInfo(
                id=linked.id,
                title=linked.title,
                status=linked.status.value,
                sequence_number=linked.sequence_number,
                project_key=linked.project_key,
            ) if linked else LinkedTaskInfo(id=linked_task_id, title="[deleted]", status="todo"),
            created_at=link.created_at,
        )

    async def list_links(self, task_id: uuid.UUID) -> list[TaskLinkResponse]:
        links = await self.repo.get_for_task(task_id)
        return [await self._build_response(lnk, task_id) for lnk in links]

    async def add_link(
        self,
        source_id: uuid.UUID,
        target_id: uuid.UUID,
        link_type: LinkType,
        created_by: uuid.UUID,
    ) -> TaskLinkResponse:
        if source_id == target_id:
            raise ValueError("A task cannot link to itself.")

        if await self.repo.exists(source_id, target_id, link_type.value):
            raise ValueError("Link already exists.")

        if await self.repo.exists(target_id, source_id, link_type.value):
            raise ValueError(
                f"Inverse link already exists: the target already '{link_type.value}' this task."
            )

        link = await self.repo.create({
            "source_id": source_id,
            "target_id": target_id,
            "link_type": link_type.value,
            "created_by": created_by,
        })
        return await self._build_response(link, source_id)

    async def remove_link(self, link_id: uuid.UUID) -> bool:
        link = await self.repo.get(link_id)
        if not link:
            return False
        await self.repo.delete(link)
        return True
