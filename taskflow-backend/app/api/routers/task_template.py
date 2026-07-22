import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session
from app.core.errors import AppError
from app.models.project import Project
from app.repositories.task_template import TaskTemplateRepository
from app.schemas.task_template import (
    TaskTemplateCreate,
    TaskTemplateResponse,
    TaskTemplateUpdate,
)

router = APIRouter(prefix="/projects/{project_id}/task-templates", tags=["Templates"])


async def _template_or_404(repo, template_id, project_id):
    template = await repo.get(template_id)
    if not template or template.project_id != project_id:
        raise AppError(404, code="NOT_FOUND", message="Template not found")
    return template


def _serialize_tag_ids(data: dict) -> dict:
    """JSONB needs plain strings, not UUID objects."""
    if "tag_ids" in data and data["tag_ids"] is not None:
        data["tag_ids"] = [str(t) for t in data["tag_ids"]]
    return data


@router.get("", response_model=list[TaskTemplateResponse])
async def list_templates(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await TaskTemplateRepository(session).list_for_project(project_id)


@router.post("", response_model=TaskTemplateResponse, status_code=201)
async def create_template(
    project_id: uuid.UUID,
    body: TaskTemplateCreate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await TaskTemplateRepository(session).create(project_id, _serialize_tag_ids(body.model_dump()))


@router.patch("/{template_id}", response_model=TaskTemplateResponse)
async def update_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    body: TaskTemplateUpdate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = TaskTemplateRepository(session)
    template = await _template_or_404(repo, template_id, project_id)
    return await repo.update(template, _serialize_tag_ids(body.model_dump(exclude_unset=True)))


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    project_id: uuid.UUID,
    template_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = TaskTemplateRepository(session)
    template = await _template_or_404(repo, template_id, project_id)
    await repo.delete(template)
