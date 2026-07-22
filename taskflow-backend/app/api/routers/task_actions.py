"""REQ-156 — clone and move endpoints (DD-049). Project-level, not board-scoped."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_activity_service,
    get_current_user,
    get_db_session,
    get_member_project_task,
    get_project_member_repository,
)
from app.core.logging import get_logger
from app.core.ws_manager import manager
from app.models.project import Project
from app.models.project_member import MemberRole
from app.models.task import Task
from app.models.user import User
from app.repositories.project_member import ProjectMemberRepository
from app.schemas.task import TaskMoveRequest, TaskResponse
from app.services.activity import ActivityService
from app.services.task_actions import clone_task, move_task
from app.services.webhook import dispatch as webhook_dispatch

router = APIRouter(prefix="/projects/{project_id}/tasks/{task_id}", tags=["Task Actions"])
logger = get_logger("task_actions")


def _serialize(task: Task) -> dict:
    return TaskResponse.model_validate(task).model_dump(mode="json")


def _actor_name(user: User) -> str:
    return user.username or user.email


@router.post("/archive", response_model=TaskResponse)
async def archive(
    project_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """REQ-161: archive a completed task — reversible, drops out of default views."""
    from datetime import datetime, timezone

    from app.models.task import TaskStatus

    if task.status != TaskStatus.done:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only completed tasks can be archived.")
    task.archived_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(task)
    await manager.broadcast(str(project_id), {"type": "task.deleted", "payload": {"task_id": str(task.id)}})
    logger.info("task_archived", task=str(task.id), actor=str(current_user.id))
    return task


@router.post("/unarchive", response_model=TaskResponse)
async def unarchive(
    project_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    task.archived_at = None
    await session.commit()
    await session.refresh(task)
    await manager.broadcast(str(project_id), {"type": "task.created", "payload": _serialize(task)})
    logger.info("task_restored", task=str(task.id), actor=str(current_user.id))
    return task


@router.post("/clone", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def clone(
    project_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    new_task = await clone_task(session, task, current_user.id)
    await activity_svc.log_task_created(
        task_id=new_task.id, task_title=new_task.title, project_id=project_id,
        actor_id=current_user.id, actor_name=_actor_name(current_user),
    )
    payload = _serialize(new_task)
    await manager.broadcast(str(project_id), {"type": "task.created", "payload": payload})
    await webhook_dispatch(session, project_id, "task.created", payload)
    logger.info("task_cloned", source=str(task.id), clone=str(new_task.id), actor=str(current_user.id))
    return new_task


@router.post("/move", response_model=TaskResponse)
async def move(
    project_id: uuid.UUID,
    payload: TaskMoveRequest,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
    member_repo: ProjectMemberRepository = Depends(get_project_member_repository),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    if payload.target_project_id == project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task is already in this project.")

    target = await session.get(Project, payload.target_project_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target project not found.")
    if target.owner_id != current_user.id:
        membership = await member_repo.get_membership(target.id, current_user.id)
        if membership is None or membership.role == MemberRole.viewer:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You need member access in the target project to move tasks into it.",
            )

    title = task.title
    old_task_payload = {"task_id": str(task.id), "title": title}

    moved = await move_task(session, task, target, current_user.id)

    # Ledger + live updates on both sides: gone from source, arrived in target.
    await activity_svc.log_task_deleted(
        task_id=moved.id, task_title=title, project_id=project_id,
        actor_id=current_user.id, actor_name=_actor_name(current_user),
    )
    await activity_svc.log_task_created(
        task_id=moved.id, task_title=moved.title, project_id=target.id,
        actor_id=current_user.id, actor_name=_actor_name(current_user),
    )
    moved_payload = _serialize(moved)
    await manager.broadcast(str(project_id), {"type": "task.deleted", "payload": old_task_payload})
    await manager.broadcast(str(target.id), {"type": "task.created", "payload": moved_payload})
    await webhook_dispatch(session, project_id, "task.deleted", old_task_payload)
    await webhook_dispatch(session, target.id, "task.created", moved_payload)
    logger.info("task_moved", task=str(moved.id), source=str(project_id), target=str(target.id), actor=str(current_user.id))
    return moved
