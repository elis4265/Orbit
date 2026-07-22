import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_viewer_project, get_db_session
from app.models.project import Project
from app.schemas.baseline import BaselinePredictionResponse
from app.services.baseline_service import BaselineService

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Baseline"])


@router.get("/{task_id}/prediction", response_model=BaselinePredictionResponse)
async def get_task_prediction(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await BaselineService(session).predict_for_task(project_id, task_id)
