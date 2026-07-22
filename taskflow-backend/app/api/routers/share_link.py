"""REQ-163 — public read-only share links.

Admin mints/revokes links under the task; GET /share/{token} is the only
unauthenticated read surface in the app: rate-limited, 404 for unknown and
revoked tokens alike, and the payload is a strict allowlist — never worklogs,
watchers, attachments, or member emails.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_admin_project, get_current_user, get_db_session, get_task_repository
from app.core.limiter import limiter
from app.core.logging import get_logger
from app.models.comment import Comment
from app.models.project import Project
from app.models.share_link import ShareLink
from app.models.task import Task
from app.models.user import User
from app.repositories.task import TaskRepository

admin_router = APIRouter(prefix="/projects/{project_id}/tasks/{task_id}/share-links", tags=["Share Links"])
public_router = APIRouter(prefix="/share", tags=["Public Share"])
logger = get_logger("share_links")


class ShareLinkResponse(BaseModel):
    id: uuid.UUID
    token: str  # the URL is the capability; revocation kills it — listing is fine
    revoked: bool
    created_at: datetime

    model_config = {"from_attributes": True}


async def _task_in_project(task_id: uuid.UUID, project: Project, task_repo: TaskRepository) -> Task:
    task = await task_repo.get(task_id)
    if task is None or task.project_id != project.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found.")
    return task


@admin_router.post("", response_model=ShareLinkResponse, status_code=status.HTTP_201_CREATED)
async def create_share_link(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repository),
    session: AsyncSession = Depends(get_db_session),
):
    task = await _task_in_project(task_id, project, task_repo)
    link = ShareLink(task_id=task.id, token=ShareLink.generate_token(), created_by=current_user.id)
    session.add(link)
    await session.commit()
    await session.refresh(link)
    logger.info("share_link_created", task=str(task.id), actor=str(current_user.id))
    return link


@admin_router.get("", response_model=list[ShareLinkResponse])
async def list_share_links(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    task_repo: TaskRepository = Depends(get_task_repository),
    session: AsyncSession = Depends(get_db_session),
):
    task = await _task_in_project(task_id, project, task_repo)
    rows = (await session.execute(
        select(ShareLink).where(ShareLink.task_id == task.id).order_by(ShareLink.created_at)
    )).scalars().all()
    return rows


@admin_router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share_link(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    link_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repository),
    session: AsyncSession = Depends(get_db_session),
):
    task = await _task_in_project(task_id, project, task_repo)
    link = await session.get(ShareLink, link_id)
    if link is None or link.task_id != task.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found.")
    link.revoked = True
    await session.commit()
    logger.info("share_link_revoked", link=str(link_id), actor=str(current_user.id))


# ── Public surface ────────────────────────────────────────────────────────────

class PublicSubtask(BaseModel):
    title: str
    is_completed: bool


class PublicComment(BaseModel):
    content: str
    created_at: datetime


class PublicTaskResponse(BaseModel):
    """Strict allowlist — no ids, no emails, no worklogs, no attachments."""
    key: str
    title: str
    description: str | None
    status: str
    issue_type: str
    tags: list[dict]
    subtasks: list[PublicSubtask]
    comments: list[PublicComment]


@public_router.get("/{token}", response_model=PublicTaskResponse)
@limiter.limit("30/minute")
async def public_task(
    request: Request,
    token: str,
    session: AsyncSession = Depends(get_db_session),
):
    link = (await session.execute(
        select(ShareLink).where(ShareLink.token == token)
    )).scalars().first()
    # Revoked and unknown are indistinguishable — no oracle for token probing
    if link is None or link.revoked:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")

    task = (await session.execute(
        select(Task)
        .where(Task.id == link.task_id)
        .options(selectinload(Task.tags), selectinload(Task.sub_tasks), selectinload(Task.project))
    )).scalars().first()
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")

    comments = (await session.execute(
        select(Comment).where(Comment.task_id == task.id).order_by(Comment.created_at)
    )).scalars().all()

    return PublicTaskResponse(
        key=f"{task.project.key}-{task.sequence_number}" if task.project else str(task.sequence_number),
        title=task.title,
        description=task.description,
        status=task.status.value if task.status else "",
        issue_type=task.issue_type.value if task.issue_type else "task",
        tags=[{"name": t.name, "color": t.color} for t in (task.tags or [])],
        subtasks=[PublicSubtask(title=s.title, is_completed=s.is_completed) for s in (task.sub_tasks or [])],
        comments=[PublicComment(content=c.content, created_at=c.created_at) for c in comments],
    )
