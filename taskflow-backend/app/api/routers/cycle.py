import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session
from app.models.project import Project
from app.repositories.cycle_config import CycleConfigRepository
from app.repositories.sprint import SprintRepository
from app.repositories.task import TaskRepository
from app.schemas.cycle_config import CycleConfigResponse, CycleConfigUpdate
from app.schemas.sprint import SprintResponse
from app.services.cycle_runner import reconcile_project_cycles, disable_project_cycles

router = APIRouter(prefix="/projects/{project_id}/cycle-config", tags=["Cycles"])
cycles_router = APIRouter(prefix="/projects/{project_id}/cycles", tags=["Cycles"])


@router.get("", response_model=CycleConfigResponse | None)
async def get_cycle_config(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await CycleConfigRepository(session).get(project_id)


@router.put("", response_model=CycleConfigResponse)
async def put_cycle_config(
    project_id: uuid.UUID,
    body: CycleConfigUpdate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    cfg = await CycleConfigRepository(session).upsert(project_id, body.model_dump())
    if cfg.enabled:
        # Materialize cycles immediately so the board reflects the new config.
        today = datetime.now(timezone.utc).date()
        await reconcile_project_cycles(cfg, today, SprintRepository(session), TaskRepository(session))
    else:
        # Disabling: close the active cycle and drop upcoming ones.
        await disable_project_cycles(project_id, SprintRepository(session))
    return cfg


@cycles_router.get("", response_model=list[SprintResponse])
async def list_cycles(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await SprintRepository(session).list_auto_cycles(project_id)
