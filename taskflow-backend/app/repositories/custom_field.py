import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_field import CustomField


class CustomFieldRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_project(self, project_id: uuid.UUID) -> list[CustomField]:
        result = await self.session.execute(
            select(CustomField)
            .where(CustomField.project_id == project_id)
            .order_by(CustomField.position.asc(), CustomField.name.asc())
        )
        return list(result.scalars().all())

    async def get(self, field_id: uuid.UUID) -> CustomField | None:
        result = await self.session.execute(select(CustomField).where(CustomField.id == field_id))
        return result.scalars().first()

    async def create(self, project_id: uuid.UUID, data: dict) -> CustomField:
        field = CustomField(project_id=project_id, **data)
        self.session.add(field)
        await self.session.commit()
        await self.session.refresh(field)
        return field

    async def update(self, field: CustomField, data: dict) -> CustomField:
        for k, v in data.items():
            setattr(field, k, v)
        await self.session.commit()
        await self.session.refresh(field)
        return field

    async def delete(self, field: CustomField) -> None:
        await self.session.delete(field)
        await self.session.commit()
