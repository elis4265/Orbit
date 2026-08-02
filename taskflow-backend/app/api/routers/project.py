import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.task import TaskResponse
from app.schemas.task_link import TaskSearchResult
from app.services.project import ProjectService, ProjectLimitReachedException
from app.services.audit_log import AuditLogService
from app.api.dependencies import (
    get_project_service,
    get_current_user,
    get_admin_project,
    get_audit_log_service,
    get_superuser,
    get_viewer_project,
    get_db_session,
    get_task_repository,
)
from app.models.user import User
from app.models.project import Project
from app.repositories.task import TaskRepository
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/projects", tags=["Projects"])


def _actor_name(user: User) -> str:
    return user.username or user.email


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    project_service: ProjectService = Depends(get_project_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    # HW-37: creation is instance-admin territory — per-project roles can't gate an
    # action that precedes the project. The 5-per-user cap stays as a backstop.
    current_user: User = Depends(get_superuser),
):
    try:
        project = await project_service.create_project(name=payload.name, owner_id=current_user.id, mode=payload.mode)
    except ProjectLimitReachedException as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    await audit_svc.log_workspace_created(project.id, current_user.id, _actor_name(current_user), project.name)
    return project


@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    project_service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_user),
):
    return await project_service.get_user_projects(user_id=current_user.id)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    payload: ProjectUpdate,
    project: Project = Depends(get_admin_project),
    project_service: ProjectService = Depends(get_project_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    current_user: User = Depends(get_current_user),
):
    if payload.name is not None:
        old_name = project.name
        project = await project_service.rename_project(project, payload.name)
        await audit_svc.log_workspace_renamed(project.id, current_user.id, _actor_name(current_user), old_name, payload.name)
    # Explicit null clears the setting; absent field leaves it untouched (REQ-138).
    if "hide_done_after_days" in payload.model_fields_set:
        project = await project_service.update_hide_done_after_days(project, payload.hide_done_after_days)
    # REQ-161: same null-clears semantics for auto-archive
    if "auto_archive_after_days" in payload.model_fields_set:
        project.auto_archive_after_days = payload.auto_archive_after_days
        await project_service.project_repo.session.commit()
        await project_service.project_repo.session.refresh(project)
    # HW-18: default assignee for new tasks. Either field alone is enough to trigger
    # the update — the service normalises/validates the resulting combination.
    fields_set = payload.model_fields_set
    if "default_assignee_mode" in fields_set or "default_assignee_id" in fields_set:
        project = await project_service.set_default_assignee(
            project,
            payload.default_assignee_mode,
            payload.default_assignee_id,
            assignee_id_provided="default_assignee_id" in fields_set,
        )
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project: Project = Depends(get_admin_project),
    project_service: ProjectService = Depends(get_project_service),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
    current_user: User = Depends(get_current_user),
):
    await audit_svc.log_workspace_deleted(project.id, current_user.id, _actor_name(current_user), project.name)
    await project_service.delete_project(project)


@router.get("/{project_id}/tasks", response_model=list[TaskResponse])
async def list_project_tasks(
    project_id: uuid.UUID,
    sprint_id: str | None = Query(None, description="'none' for backlog, a UUID for a specific sprint"),
    include_archived: bool = Query(False, description="REQ-161: include archived tasks"),
    project: Project = Depends(get_viewer_project),
    task_repo: TaskRepository = Depends(get_task_repository),
):
    """Return all tasks in the project, optionally filtered by sprint.

    - No sprint_id → all tasks across all boards
    - sprint_id=none → Backlog: tasks with no sprint assigned
    - sprint_id=<uuid> → tasks assigned to that sprint
    """
    if include_archived:
        # REQ-161: the archived view — full list including archived rows
        return await task_repo.get_project_tasks(project_id, include_archived=True)
    sprint_filter: str | uuid.UUID | None = None
    if sprint_id == "none":
        sprint_filter = "none"
    elif sprint_id is not None:
        try:
            sprint_filter = uuid.UUID(sprint_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid sprint_id")

    return await task_repo.get_project_tasks_filtered(project_id, sprint_filter)


@router.get("/{project_id}/tasks/search", response_model=list[TaskSearchResult])
async def search_tasks(
    project_id: uuid.UUID,
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=50),
    project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    import re
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.models.task import Task
    from app.services.search import search_tasks as fts_search

    if not q or len(q) < 2:
        return []

    # Ticket number lookup: KEY-42 or just a plain integer
    ticket_match = re.match(r'^[A-Za-z]{2,10}-(\d+)$', q.strip())
    plain_number = re.match(r'^(\d+)$', q.strip())
    seq_number: int | None = None
    if ticket_match:
        seq_number = int(ticket_match.group(1))
    elif plain_number:
        seq_number = int(plain_number.group(1))

    if seq_number is not None:
        result = await session.execute(
            select(Task)
            .where(Task.project_id == project_id, Task.sequence_number == seq_number)
            .options(selectinload(Task.project))
            .limit(limit)
        )
        return result.scalars().all()

    return await fts_search(session, q, project_id, limit)
