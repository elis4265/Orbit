import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session
from app.core.errors import AppError
from app.models.project import Project
from app.repositories.automation_rule import AutomationRuleRepository
from app.schemas.automation_rule import (
    AutomationRuleCreate,
    AutomationRuleResponse,
    AutomationRuleUpdate,
)

router = APIRouter(prefix="/projects/{project_id}/automation-rules", tags=["Automation"])


async def _rule_or_404(repo, rule_id, project_id):
    rule = await repo.get(rule_id)
    if not rule or rule.project_id != project_id:
        raise AppError(404, code="NOT_FOUND", message="Automation rule not found")
    return rule


@router.get("", response_model=list[AutomationRuleResponse])
async def list_rules(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await AutomationRuleRepository(session).list_for_project(project_id)


@router.post("", response_model=AutomationRuleResponse, status_code=201)
async def create_rule(
    project_id: uuid.UUID,
    body: AutomationRuleCreate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    return await AutomationRuleRepository(session).create(project_id, body.model_dump())


@router.patch("/{rule_id}", response_model=AutomationRuleResponse)
async def update_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    body: AutomationRuleUpdate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = AutomationRuleRepository(session)
    rule = await _rule_or_404(repo, rule_id, project_id)
    return await repo.update(rule, body.model_dump(exclude_none=True))


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    project_id: uuid.UUID,
    rule_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = AutomationRuleRepository(session)
    rule = await _rule_or_404(repo, rule_id, project_id)
    await repo.delete(rule)
