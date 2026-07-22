import uuid
from typing import Sequence

from app.core.errors import AppError
from app.models.saved_search import SavedSearch
from app.repositories.saved_search import SavedSearchRepository
from app.schemas.saved_search import SavedSearchCreate, SavedSearchUpdate


class SavedSearchService:
    def __init__(self, repo: SavedSearchRepository):
        self.repo = repo

    async def list(self, project_id: uuid.UUID, user_id: uuid.UUID) -> Sequence[SavedSearch]:
        return await self.repo.list_for_user(project_id, user_id)

    async def create(self, project_id: uuid.UUID, user_id: uuid.UUID, payload: SavedSearchCreate) -> SavedSearch:
        return await self.repo.create({
            "project_id": project_id,
            "user_id": user_id,
            "name": payload.name,
            "filters": payload.filters,
        })

    async def update(
        self,
        project_id: uuid.UUID,
        search_id: uuid.UUID,
        user_id: uuid.UUID,
        payload: SavedSearchUpdate,
    ) -> SavedSearch:
        obj = await self.repo.get(search_id)
        if not obj:
            raise AppError(404, "NOT_FOUND", "Saved search not found")
        if obj.user_id != user_id:
            raise AppError(403, "FORBIDDEN", "Not your saved search")
        data = payload.model_dump(exclude_none=True)
        return await self.repo.update(obj, data)

    async def delete(self, project_id: uuid.UUID, search_id: uuid.UUID, user_id: uuid.UUID) -> None:
        obj = await self.repo.get(search_id)
        if not obj:
            raise AppError(404, "NOT_FOUND", "Saved search not found")
        if obj.user_id != user_id:
            raise AppError(403, "FORBIDDEN", "Not your saved search")
        await self.repo.delete(search_id)
