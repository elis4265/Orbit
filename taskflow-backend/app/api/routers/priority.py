import uuid
from typing import Sequence

from fastapi import APIRouter, Depends

from app.api.dependencies import (
    get_admin_project,
    get_viewer_project,
    get_db_session,
)
from app.models.project import Project
from app.repositories.priority import PrioritySchemeRepository
from app.services.priority import PriorityService
from app.schemas.priority import (
    PriorityItemCreate,
    PriorityItemUpdate,
    PriorityItemReorderRequest,
    PriorityItemResponse,
    PrioritySchemeResponse,
    AssignSchemeRequest,
)

router = APIRouter(
    prefix="/projects/{project_id}/priorities",
    tags=["priorities"],
)
schemes_router = APIRouter(tags=["priorities"])


async def get_priority_service(session=Depends(get_db_session)) -> PriorityService:
    return PriorityService(PrioritySchemeRepository(session))


# ── Project priority items ─────────────────────────────────────────────────

@router.get("", response_model=list[PriorityItemResponse])
async def list_priorities(
    project: Project = Depends(get_viewer_project),
    svc: PriorityService = Depends(get_priority_service),
):
    return await svc.get_effective_items(project)


@router.post("", response_model=PriorityItemResponse, status_code=201)
async def create_priority_item(
    data: PriorityItemCreate,
    project: Project = Depends(get_admin_project),
    svc: PriorityService = Depends(get_priority_service),
):
    return await svc.create_item(project, data)


@router.patch("/{item_id}", response_model=PriorityItemResponse)
async def update_priority_item(
    item_id: uuid.UUID,
    data: PriorityItemUpdate,
    project: Project = Depends(get_admin_project),
    svc: PriorityService = Depends(get_priority_service),
):
    return await svc.update_item(project, item_id, data)


@router.delete("/{item_id}", status_code=204)
async def delete_priority_item(
    item_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    svc: PriorityService = Depends(get_priority_service),
):
    await svc.delete_item(project, item_id)


@router.post("/reorder", response_model=list[PriorityItemResponse])
async def reorder_priority_items(
    body: PriorityItemReorderRequest,
    project: Project = Depends(get_admin_project),
    svc: PriorityService = Depends(get_priority_service),
):
    return await svc.reorder_items(project, body.ordered_ids)


@router.put("/scheme", response_model=list[PriorityItemResponse])
async def assign_scheme(
    body: AssignSchemeRequest,
    project: Project = Depends(get_admin_project),
    svc: PriorityService = Depends(get_priority_service),
):
    return await svc.assign_scheme(project, body.scheme_id)


# ── Global schemes (read-only, any authenticated user) ─────────────────────

@schemes_router.get("/priority-schemes", response_model=list[PrioritySchemeResponse])
async def list_global_schemes(
    svc: PriorityService = Depends(get_priority_service),
):
    return await svc.list_global_schemes()
