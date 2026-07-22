"""Recurring tasks CRUD (REQ-148). Admin-managed, like automation rules."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_current_user, get_db_session, get_viewer_project
from app.core.errors import AppError
from app.models.project import Project
from app.models.recurring_task import RecurringTask
from app.models.task_template import TaskTemplate
from app.models.user import User
from app.schemas.recurring_task import RecurringTaskCreate, RecurringTaskResponse, RecurringTaskUpdate
from app.services.recurrence import next_occurrence

router = APIRouter(prefix="/projects/{project_id}/recurring-tasks", tags=["Recurring Tasks"])


@router.post("", response_model=RecurringTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: RecurringTaskCreate,
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    template = await session.get(TaskTemplate, payload.template_id)
    if template is None or template.project_id != project.id:
        raise AppError(404, "NOT_FOUND", "Template not found in this project.")
    row = RecurringTask(
        project_id=project.id,
        template_id=payload.template_id,
        cadence=payload.cadence,
        weekday=payload.weekday,
        day_of_month=payload.day_of_month,
        next_run_at=next_occurrence(payload.cadence, date.today(), payload.weekday, payload.day_of_month),
        created_by=current_user.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("", response_model=list[RecurringTaskResponse])
async def list_rules(
    project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(RecurringTask).where(RecurringTask.project_id == project.id).order_by(RecurringTask.created_at)
    )
    return result.scalars().all()


@router.patch("/{rule_id}", response_model=RecurringTaskResponse)
async def update_rule(
    rule_id: uuid.UUID,
    payload: RecurringTaskUpdate,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(RecurringTask).where(RecurringTask.id == rule_id, RecurringTask.project_id == project.id)
    )
    row = result.scalars().first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Recurring task not found.")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)
    if {"cadence", "weekday", "day_of_month"} & data.keys():
        row.next_run_at = next_occurrence(row.cadence, date.today(), row.weekday, row.day_of_month)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(RecurringTask).where(RecurringTask.id == rule_id, RecurringTask.project_id == project.id)
    )
    row = result.scalars().first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Recurring task not found.")
    await session.delete(row)
    await session.commit()
