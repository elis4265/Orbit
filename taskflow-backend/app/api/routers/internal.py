"""Internal endpoints — called only by Hocuspocus, not exposed to users."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.core.config import settings
from app.core.security import hash_password, create_access_token
from app.database import get_db_session
from app.models.task import Task
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.api.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/internal", tags=["Internal"])


class TestUserRequest(BaseModel):
    email: str
    password: str
    username: str


@router.post("/test/create-user", status_code=201)
async def create_test_user(
    body: TestUserRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Dev-only: create a verified user and return an access token. Returns 404 in production."""
    if settings.environment != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    user = User(
        email=body.email,
        username=body.username,
        hashed_password=hash_password(body.password),
        is_verified=True,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user_id": str(user.id), "email": user.email}


async def _require_internal_key(x_internal_key: str = Header(..., alias="X-Internal-Key")) -> None:
    if x_internal_key != settings.hocuspocus_internal_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal key.")


class DescriptionSyncRequest(BaseModel):
    description: Optional[str] = None


@router.get("/tasks/{task_id}/access")
async def check_task_access(
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Hocuspocus calls this during WS handshake to verify the user may edit the task."""
    result = await session.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")

    result = await session.execute(select(Project).where(Project.id == task.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    # Owner always has access
    if project.owner_id == current_user.id:
        return {"allowed": True}

    # Check membership — member or admin only (not viewer)
    result = await session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == task.project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    membership = result.scalar_one_or_none()
    if not membership or MemberRole(membership.role) == MemberRole.viewer:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    return {"allowed": True}


@router.patch(
    "/tasks/{task_id}/description",
    dependencies=[Depends(_require_internal_key)],
)
async def sync_description(
    task_id: uuid.UUID,
    body: DescriptionSyncRequest,
    session: AsyncSession = Depends(get_db_session),
):
    """Hocuspocus calls this when a document is stored to keep tasks.description current.
    Does NOT increment version — description is now Hocuspocus-owned."""
    await session.execute(
        update(Task)
        .where(Task.id == task_id)
        .values(description=body.description, updated_at=datetime.now(timezone.utc))
    )
    await session.commit()
    return {"ok": True}
