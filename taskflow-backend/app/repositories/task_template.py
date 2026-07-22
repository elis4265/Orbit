import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task_template import TaskTemplate


class TaskTemplateRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_project(self, project_id: uuid.UUID) -> list[TaskTemplate]:
        result = await self.session.execute(
            select(TaskTemplate)
            .where(TaskTemplate.project_id == project_id)
            .order_by(TaskTemplate.position.asc(), TaskTemplate.name.asc())
        )
        return list(result.scalars().all())

    async def get(self, template_id: uuid.UUID) -> TaskTemplate | None:
        result = await self.session.execute(
            select(TaskTemplate).where(TaskTemplate.id == template_id)
        )
        return result.scalars().first()

    async def create(self, project_id: uuid.UUID, data: dict) -> TaskTemplate:
        template = TaskTemplate(project_id=project_id, **data)
        self.session.add(template)
        await self.session.commit()
        await self.session.refresh(template)
        return template

    async def update(self, template: TaskTemplate, data: dict) -> TaskTemplate:
        for k, v in data.items():
            setattr(template, k, v)
        await self.session.commit()
        await self.session.refresh(template)
        return template

    async def delete(self, template: TaskTemplate) -> None:
        await self.session.delete(template)
        await self.session.commit()
