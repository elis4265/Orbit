"""Identity lookups for user-composed filters (REQ-152, DD-045).

Returns the caller's "related to me" task-id sets for one project; the
frontend filter engine intersects them with the loaded board client-side.
Own prefix (not /tasks/…) so it can never shadow the /{task_id} routes.
"""
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db_session, get_viewer_project
from app.models.comment import Comment
from app.models.notification import Notification, NotificationType
from app.models.project import Project
from app.models.task import Task
from app.models.user import User

router = APIRouter(prefix="/projects/{project_id}/related-to-me", tags=["Filters"])


class RelatedToMeResponse(BaseModel):
    commented: list[uuid.UUID]
    mentioned: list[uuid.UUID]


@router.get("", response_model=RelatedToMeResponse)
async def related_to_me(
    project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    commented = (await session.execute(
        select(Comment.task_id)
        .join(Task, Task.id == Comment.task_id)
        .where(Task.project_id == project.id, Comment.author_id == current_user.id)
        .distinct()
    )).scalars().all()

    mentioned = (await session.execute(
        select(Notification.task_id)
        .join(Task, Task.id == Notification.task_id)
        .where(
            Task.project_id == project.id,
            Notification.user_id == current_user.id,
            Notification.type == NotificationType.mentioned,
        )
        .distinct()
    )).scalars().all()

    return RelatedToMeResponse(commented=list(commented), mentioned=list(mentioned))
