import uuid
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session
from app.models.project import Project
from app.repositories.project_status import ProjectStatusRepository
from app.repositories.project import ProjectRepository
from app.schemas.project_status import (
    CreationPolicyUpdate,
    EstimationMethodUpdate,
    ProjectModeUpdate,
    ProjectStatusCreate,
    ProjectStatusResponse,
    ProjectStatusUpdate,
    StatusReorderRequest,
    TransitionRuleCreate,
    TransitionRuleResponse,
)
from app.services.project_status import ProjectStatusService

router = APIRouter(prefix="/projects/{project_id}", tags=["Project Settings"])


def _svc(session: AsyncSession = Depends(get_db_session)) -> ProjectStatusService:
    return ProjectStatusService(ProjectStatusRepository(session))


# ── Statuses ──────────────────────────────────────────────────────────────────

@router.get("/statuses", response_model=List[ProjectStatusResponse])
async def list_statuses(
    project_id: uuid.UUID,
    project: Project = Depends(get_viewer_project),
    svc: ProjectStatusService = Depends(_svc),
):
    return await svc.list_statuses(project_id)


@router.post("/statuses", response_model=ProjectStatusResponse, status_code=status.HTTP_201_CREATED)
async def create_status(
    project_id: uuid.UUID,
    payload: ProjectStatusCreate,
    project: Project = Depends(get_admin_project),
    svc: ProjectStatusService = Depends(_svc),
):
    return await svc.create_status(project_id, payload)


@router.patch("/statuses/{status_id}", response_model=ProjectStatusResponse)
async def update_status(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    payload: ProjectStatusUpdate,
    project: Project = Depends(get_admin_project),
    svc: ProjectStatusService = Depends(_svc),
):
    return await svc.update_status(project_id, status_id, payload)


@router.delete("/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_status(
    project_id: uuid.UUID,
    status_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    svc: ProjectStatusService = Depends(_svc),
):
    await svc.delete_status(project_id, status_id)


@router.post("/statuses/reorder", response_model=List[ProjectStatusResponse])
async def reorder_statuses(
    project_id: uuid.UUID,
    payload: StatusReorderRequest,
    project: Project = Depends(get_admin_project),
    svc: ProjectStatusService = Depends(_svc),
):
    return await svc.reorder_statuses(project_id, payload.ordered_ids)


# ── Transition rules ──────────────────────────────────────────────────────────

@router.get("/transitions", response_model=List[TransitionRuleResponse])
async def list_transitions(
    project_id: uuid.UUID,
    project: Project = Depends(get_viewer_project),
    svc: ProjectStatusService = Depends(_svc),
):
    return await svc.list_transitions(project_id)


@router.post("/transitions", response_model=TransitionRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_transition(
    project_id: uuid.UUID,
    payload: TransitionRuleCreate,
    project: Project = Depends(get_admin_project),
    svc: ProjectStatusService = Depends(_svc),
):
    return await svc.create_transition(
        project_id, payload.from_status_id, payload.to_status_id, payload.require_role, payload.issue_type
    )


@router.delete("/transitions/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transition(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    svc: ProjectStatusService = Depends(_svc),
):
    await svc.delete_transition(project_id, rule_id)


# ── Mode ──────────────────────────────────────────────────────────────────────

@router.patch("/mode")
async def update_mode(
    project_id: uuid.UUID,
    payload: ProjectModeUpdate,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
    svc: ProjectStatusService = Depends(_svc),
):
    ws_repo = ProjectRepository(session)
    update_data: dict = {"mode": payload.mode}
    # Mode sets the creation-policy default (Enforced → Jira-style forced
    # initial status); admins re-curate afterwards if they want.
    update_data["creation_status_policy"] = "initial" if payload.mode == "enforced" else "any"
    if payload.enforce_block_links is not None:
        update_data["enforce_block_links"] = payload.enforce_block_links
    # Vendor parity: Jira Scrum boards + YouTrack agile default estimation to Story
    # Points. When a project enters a structured mode and hasn't picked a method,
    # seed Story Points (only when still on the untouched 'none' default).
    if payload.mode in ("guided", "enforced") and project.estimation_method == "none":
        update_data["estimation_method"] = "story_points"
    await ws_repo.update(project, update_data)
    if payload.mode == "enforced":
        await svc.seed_enforced_transitions(project_id)
    statuses = await svc.list_statuses(project_id)
    return {
        "project_id": str(project_id),
        "mode": payload.mode,
        "status_count": len(statuses),
        "estimation_method": update_data.get("estimation_method", project.estimation_method),
    }


# ── Creation policy ───────────────────────────────────────────────────────────

@router.patch("/creation-policy")
async def update_creation_policy(
    project_id: uuid.UUID,
    payload: CreationPolicyUpdate,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    """Task-creation policy: any (Linear) / initial (Jira default) / curated
    (statuses flagged allow_on_create). Mode switches reset this to the
    mode's default."""
    await ProjectRepository(session).update(
        project, {"creation_status_policy": payload.creation_status_policy}
    )
    return {"project_id": str(project_id), "creation_status_policy": payload.creation_status_policy}


# ── Estimation method ─────────────────────────────────────────────────────────

@router.patch("/estimation-method")
async def update_estimation_method(
    project_id: uuid.UUID,
    payload: EstimationMethodUpdate,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    await ProjectRepository(session).update(project, {"estimation_method": payload.estimation_method})
    return {"project_id": str(project_id), "estimation_method": payload.estimation_method}
