import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_admin_project,
    get_current_user,
    get_db_session,
    get_sprint_service,
    get_viewer_project,
)
from app.models.user import User
from app.models.project import Project
from app.schemas.sprint import SprintCompleteRequest, SprintCreate, SprintResponse, SprintUpdate
from app.services.sprint import SprintService
from app.services.webhook import dispatch as webhook_dispatch

router = APIRouter(
    prefix="/projects/{project_id}/boards/{board_id}/sprints",
    tags=["Sprints"],
)


@router.get("", response_model=list[SprintResponse])
async def list_sprints(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
) -> list[SprintResponse]:
    return await svc.list_sprints(project_id, board_id)


@router.post("", response_model=SprintResponse, status_code=status.HTTP_201_CREATED)
async def create_sprint(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    body: SprintCreate,
    _project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    return await svc.create_sprint(project_id, board_id, body)


@router.patch("/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    sprint_id: uuid.UUID,
    body: SprintUpdate,
    _project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    return await svc.update_sprint(sprint_id, project_id, body)


@router.post("/{sprint_id}/activate", response_model=SprintResponse)
async def activate_sprint(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    sprint_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
) -> SprintResponse:
    return await svc.activate_sprint(sprint_id, project_id)


@router.post("/{sprint_id}/close", response_model=SprintResponse)
async def close_sprint(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    sprint_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
    session: AsyncSession = Depends(get_db_session),
) -> SprintResponse:
    closed = await svc.close_sprint(sprint_id, project_id)
    await webhook_dispatch(session, project_id, "sprint.closed", closed.model_dump(mode="json"))
    return closed


@router.post("/{sprint_id}/complete", response_model=SprintResponse)
async def complete_sprint(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    sprint_id: uuid.UUID,
    body: SprintCompleteRequest,
    _project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
    session: AsyncSession = Depends(get_db_session),
) -> SprintResponse:
    """Jira-style completion: move incomplete tasks to backlog or a target
    sprint, then close. Both actions are offered in Guided/Enforced (REQ-141)."""
    completed = await svc.complete_sprint(
        sprint_id, project_id, body.incomplete_action, body.target_sprint_id, body.new_sprint_name
    )
    await webhook_dispatch(session, project_id, "sprint.closed", completed.model_dump(mode="json"))
    return completed


@router.delete("/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sprint(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    sprint_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    svc: SprintService = Depends(get_sprint_service),
) -> None:
    await svc.delete_sprint(sprint_id, project_id)
