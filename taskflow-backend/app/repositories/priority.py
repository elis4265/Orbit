import uuid
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.priority import PriorityScheme, PrioritySchemeItem


class PrioritySchemeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Schemes ──────────────────────────────────────────────────────────────

    async def get_scheme(self, scheme_id: uuid.UUID) -> Optional[PriorityScheme]:
        return await self.session.get(PriorityScheme, scheme_id)

    async def get_default_scheme(self) -> Optional[PriorityScheme]:
        result = await self.session.execute(
            select(PriorityScheme)
            .where(PriorityScheme.is_default == True)  # noqa: E712
            .where(PriorityScheme.project_id.is_(None))
        )
        return result.scalars().first()

    async def get_global_scheme(self, scheme_id: uuid.UUID) -> Optional[PriorityScheme]:
        result = await self.session.execute(
            select(PriorityScheme)
            .where(PriorityScheme.id == scheme_id)
            .where(PriorityScheme.project_id.is_(None))
        )
        return result.scalars().first()

    async def list_global_schemes(self) -> Sequence[PriorityScheme]:
        result = await self.session.execute(
            select(PriorityScheme)
            .where(PriorityScheme.project_id.is_(None))
            .order_by(PriorityScheme.is_default.desc(), PriorityScheme.name)
        )
        return result.scalars().all()

    async def create_scheme(self, data: dict) -> PriorityScheme:
        obj = PriorityScheme(**data)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update_project_scheme(self, project, scheme_id: uuid.UUID) -> None:
        project.priority_scheme_id = scheme_id
        self.session.add(project)
        await self.session.flush()

    # ── Items ─────────────────────────────────────────────────────────────────

    async def list_items(self, scheme_id: uuid.UUID) -> Sequence[PrioritySchemeItem]:
        result = await self.session.execute(
            select(PrioritySchemeItem)
            .where(PrioritySchemeItem.scheme_id == scheme_id)
            .order_by(PrioritySchemeItem.position)
        )
        return result.scalars().all()

    async def get_item(self, item_id: uuid.UUID) -> Optional[PrioritySchemeItem]:
        return await self.session.get(PrioritySchemeItem, item_id)

    async def create_item(self, data: dict) -> PrioritySchemeItem:
        obj = PrioritySchemeItem(**data)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update_item(self, obj: PrioritySchemeItem, data: dict) -> PrioritySchemeItem:
        for k, v in data.items():
            setattr(obj, k, v)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete_item(self, obj: PrioritySchemeItem) -> None:
        await self.session.delete(obj)
        await self.session.flush()
