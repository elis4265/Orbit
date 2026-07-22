"""Work logs (REQ-147). Member logs time; viewer reads; author deletes own entries."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_current_user,
    get_db_session,
    get_member_project_task,
    get_viewer_project,
    get_viewer_project_task,
)
from app.core.errors import AppError
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.models.work_log import WorkLog
from app.schemas.work_log import (
    TimeReportResponse,
    TimeReportRow,
    WorkLogCreate,
    WorkLogListResponse,
    WorkLogResponse,
)

router = APIRouter(prefix="/projects/{project_id}/tasks/{task_id}/worklogs", tags=["Work Logs"])
report_router = APIRouter(prefix="/projects/{project_id}/stats", tags=["Work Logs"])


@router.post("", response_model=WorkLogResponse, status_code=status.HTTP_201_CREATED)
async def log_work(
    payload: WorkLogCreate,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    row = WorkLog(
        task_id=task.id,
        user_id=current_user.id,
        minutes=payload.minutes,
        note=payload.note,
        spent_on=payload.spent_on or date.today(),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("", response_model=WorkLogListResponse)
async def list_work(
    task: Task = Depends(get_viewer_project_task),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(WorkLog).where(WorkLog.task_id == task.id).order_by(WorkLog.spent_on.desc(), WorkLog.created_at.desc())
    )
    entries = result.scalars().all()
    return WorkLogListResponse(
        entries=[WorkLogResponse.model_validate(e) for e in entries],
        total_minutes=sum(e.minutes for e in entries),
    )


@router.delete("/{worklog_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_work(
    worklog_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(WorkLog).where(WorkLog.id == worklog_id, WorkLog.task_id == task.id)
    )
    row = result.scalars().first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Work log not found.")
    if row.user_id != current_user.id:
        raise AppError(403, "FORBIDDEN", "Only the author can delete a work log.")
    await session.delete(row)
    await session.commit()


@report_router.get("/time-report", response_model=TimeReportResponse)
async def time_report(
    project_id: uuid.UUID,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    q = (
        select(WorkLog.user_id, func.sum(WorkLog.minutes))
        .join(Task, Task.id == WorkLog.task_id)
        .where(Task.project_id == project_id)
        .group_by(WorkLog.user_id)
    )
    if date_from:
        q = q.where(WorkLog.spent_on >= date_from)
    if date_to:
        q = q.where(WorkLog.spent_on <= date_to)
    rows = (await session.execute(q)).all()
    report = [TimeReportRow(user_id=uid, total_minutes=total) for uid, total in rows]
    return TimeReportResponse(rows=report, total_minutes=sum(r.total_minutes for r in report))
