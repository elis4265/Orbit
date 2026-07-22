import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_viewer_project, get_db_session
from app.models.project import Project
from app.repositories.sprint import SprintRepository
from app.repositories.task import TaskRepository
from app.repositories.project_status import ProjectStatusRepository
from app.schemas.story_points import SprintReportResponse, VelocityResponse
from app.services.story_points_service import StoryPointsService

router = APIRouter(prefix="/projects/{project_id}/stats", tags=["Story Points"])


def _svc(session: AsyncSession) -> StoryPointsService:
    return StoryPointsService(SprintRepository(session), TaskRepository(session), ProjectStatusRepository(session))


@router.get("/velocity", response_model=VelocityResponse)
async def get_velocity(
    project_id: uuid.UUID,
    window: int = Query(3, ge=1, le=12),
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await _svc(session).velocity(project_id, window)


@router.get("/sprint-report/{sprint_id}", response_model=SprintReportResponse)
async def get_sprint_report(
    project_id: uuid.UUID,
    sprint_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await _svc(session).sprint_report(project_id, sprint_id)
