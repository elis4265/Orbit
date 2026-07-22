import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session
from app.core.errors import AppError
from app.models.project import Project
from app.repositories.custom_field import CustomFieldRepository
from app.schemas.custom_field import CustomFieldCreate, CustomFieldResponse, CustomFieldUpdate

router = APIRouter(prefix="/projects/{project_id}/custom-fields", tags=["Custom Fields"])


async def _field_or_404(repo: CustomFieldRepository, field_id: uuid.UUID, project_id: uuid.UUID):
    field = await repo.get(field_id)
    if not field or field.project_id != project_id:
        raise AppError(404, code="NOT_FOUND", message="Custom field not found")
    return field


@router.get("", response_model=list[CustomFieldResponse])
async def list_custom_fields(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await CustomFieldRepository(session).list_for_project(project_id)


@router.post("", response_model=CustomFieldResponse, status_code=201)
async def create_custom_field(
    project_id: uuid.UUID,
    body: CustomFieldCreate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    if body.field_type == "select" and not body.options:
        raise AppError(422, code="INVALID_PAYLOAD", message="A select field needs at least one option")
    return await CustomFieldRepository(session).create(project_id, body.model_dump())


@router.patch("/{field_id}", response_model=CustomFieldResponse)
async def update_custom_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    body: CustomFieldUpdate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = CustomFieldRepository(session)
    field = await _field_or_404(repo, field_id, project_id)
    return await repo.update(field, body.model_dump(exclude_none=True))


@router.delete("/{field_id}", status_code=204)
async def delete_custom_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = CustomFieldRepository(session)
    field = await _field_or_404(repo, field_id, project_id)
    await repo.delete(field)
