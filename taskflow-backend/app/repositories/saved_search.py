import uuid
from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.saved_search import SavedSearch


class SavedSearchRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_user(self, project_id: uuid.UUID, user_id: uuid.UUID) -> Sequence[SavedSearch]:
        result = await self.session.execute(
            select(SavedSearch)
            .where(SavedSearch.project_id == project_id)
            .where(SavedSearch.user_id == user_id)
            .order_by(SavedSearch.created_at)
        )
        return result.scalars().all()

    async def get(self, search_id: uuid.UUID) -> Optional[SavedSearch]:
        return await self.session.get(SavedSearch, search_id)

    async def create(self, data: dict) -> SavedSearch:
        obj = SavedSearch(**data)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update(self, obj: SavedSearch, data: dict) -> SavedSearch:
        for k, v in data.items():
            setattr(obj, k, v)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete(self, search_id: uuid.UUID) -> None:
        obj = await self.get(search_id)
        if obj:
            await self.session.delete(obj)
            await self.session.flush()
