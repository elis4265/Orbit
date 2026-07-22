import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.release import Release
from app.models.task import Task
from app.models.project_status import ProjectStatus, StatusCategory


class ReleaseRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_project(self, project_id: uuid.UUID) -> list[Release]:
        result = await self.session.execute(
            select(Release)
            .where(Release.project_id == project_id)
            .order_by(Release.position.asc(), Release.created_at.asc())
        )
        return list(result.scalars().all())

    async def get(self, release_id: uuid.UUID) -> Release | None:
        result = await self.session.execute(select(Release).where(Release.id == release_id))
        return result.scalars().first()

    async def create(self, project_id: uuid.UUID, data: dict) -> Release:
        release = Release(project_id=project_id, **data)
        self.session.add(release)
        await self.session.commit()
        await self.session.refresh(release)
        return release

    async def update(self, release: Release, data: dict) -> Release:
        for k, v in data.items():
            setattr(release, k, v)
        await self.session.commit()
        await self.session.refresh(release)
        return release

    async def delete(self, release: Release) -> None:
        await self.session.delete(release)
        await self.session.commit()

    async def reassign_tasks(self, task_ids: list[uuid.UUID], new_release_id: uuid.UUID | None) -> None:
        """Bulk move tasks to another release (or backlog when new_release_id is None)."""
        if not task_ids:
            return
        await self.session.execute(
            update(Task).where(Task.id.in_(task_ids)).values(release_id=new_release_id)
        )
        await self.session.commit()

    async def tasks_for_release(self, release_id: uuid.UUID) -> list[Task]:
        result = await self.session.execute(select(Task).where(Task.release_id == release_id))
        return list(result.scalars().all())

    async def task_rows_by_release(self, project_id: uuid.UUID) -> dict[uuid.UUID, list[Task]]:
        """All release-linked tasks of a project, grouped by release_id (one query)."""
        result = await self.session.execute(
            select(Task).where(Task.project_id == project_id, Task.release_id.isnot(None))
        )
        grouped: dict[uuid.UUID, list[Task]] = {}
        for task in result.scalars().all():
            grouped.setdefault(task.release_id, []).append(task)
        return grouped

    async def completed_status_ids(self, project_id: uuid.UUID) -> set[str]:
        """Custom-status ids in the 'completed' category (for done-detection in custom modes)."""
        result = await self.session.execute(
            select(ProjectStatus.id).where(
                ProjectStatus.project_id == project_id,
                ProjectStatus.category == StatusCategory.completed.value,
            )
        )
        return {str(r) for r in result.scalars().all()}
