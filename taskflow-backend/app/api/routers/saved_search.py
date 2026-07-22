import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_viewer_project, get_db_session
from app.models.user import User
from app.models.project import Project
from app.repositories.saved_search import SavedSearchRepository
from app.schemas.saved_search import SavedSearchCreate, SavedSearchUpdate, SavedSearchResponse
from app.services.saved_search import SavedSearchService

router = APIRouter(prefix="/projects/{project_id}/saved-searches", tags=["Saved Searches"])


def _svc(session: AsyncSession = Depends(get_db_session)) -> SavedSearchService:
    return SavedSearchService(SavedSearchRepository(session))


@router.get("", response_model=List[SavedSearchResponse])
async def list_saved_searches(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    project: Project = Depends(get_viewer_project),
    svc: SavedSearchService = Depends(_svc),
):
    return await svc.list(project_id, current_user.id)


@router.post("", response_model=SavedSearchResponse, status_code=status.HTTP_201_CREATED)
async def create_saved_search(
    project_id: uuid.UUID,
    payload: SavedSearchCreate,
    current_user: User = Depends(get_current_user),
    project: Project = Depends(get_viewer_project),
    svc: SavedSearchService = Depends(_svc),
):
    return await svc.create(project_id, current_user.id, payload)


@router.patch("/{search_id}", response_model=SavedSearchResponse)
async def update_saved_search(
    project_id: uuid.UUID,
    search_id: uuid.UUID,
    payload: SavedSearchUpdate,
    current_user: User = Depends(get_current_user),
    project: Project = Depends(get_viewer_project),
    svc: SavedSearchService = Depends(_svc),
):
    return await svc.update(project_id, search_id, current_user.id, payload)


@router.delete("/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_search(
    project_id: uuid.UUID,
    search_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    project: Project = Depends(get_viewer_project),
    svc: SavedSearchService = Depends(_svc),
):
    await svc.delete(project_id, search_id, current_user.id)
