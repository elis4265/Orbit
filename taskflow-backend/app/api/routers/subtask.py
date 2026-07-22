import uuid
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.task import SubTaskCreate, SubTaskResponse, TaskResponse
from app.core.ws_manager import manager
from app.services.subtask import SubtaskService
from app.services.activity import ActivityService
from app.api.dependencies import (
    get_subtask_service,
    get_member_project_task,
    get_current_user,
    get_activity_service,
    get_task_repository,
)
from app.models.task import Task
from app.models.user import User
from app.repositories.task import TaskRepository

router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/subtasks",
    tags=["Subtasks"],
)


@router.post("", response_model=SubTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_subtask(
    project_id: uuid.UUID,
    payload: SubTaskCreate,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    subtask_service: SubtaskService = Depends(get_subtask_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    subtask = await subtask_service.create_subtask(
        task_id=task.id,
        project_id=project_id,
        title=payload.title,
        created_by=current_user.id,
    )
    await activity_svc.log_subtask_added(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=current_user.username or current_user.email,
        subtask_title=subtask.title,
    )
    return subtask


@router.patch("/{subtask_id}", response_model=SubTaskResponse)
async def toggle_subtask(
    project_id: uuid.UUID,
    subtask_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    subtask_service: SubtaskService = Depends(get_subtask_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    subtask = await subtask_service.toggle_complete(subtask_id)
    if subtask is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found.")
    await activity_svc.log_subtask_toggled(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=current_user.username or current_user.email,
        subtask_title=subtask.title,
        is_completed=subtask.is_completed,
    )
    return subtask


@router.post("/{subtask_id}/promote", response_model=TaskResponse)
async def promote_subtask(
    project_id: uuid.UUID,
    subtask_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    subtask_service: SubtaskService = Depends(get_subtask_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    """REQ-164: detach the child into a standalone task (relates_to link kept)."""
    promoted = await subtask_service.promote_subtask(subtask_id, task.id, current_user.id)
    if promoted is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found.")

    actor = current_user.username or current_user.email
    await activity_svc.log_subtask_promoted(
        task_id=task.id, task_title=task.title, project_id=project_id,
        actor_id=current_user.id, actor_name=actor, subtask_title=promoted.title,
    )
    await activity_svc.log_task_promoted(
        task_id=promoted.id, task_title=promoted.title, project_id=project_id,
        actor_id=current_user.id, actor_name=actor, parent_title=task.title,
    )
    await manager.broadcast(str(project_id), {
        "type": "task.updated",
        "payload": TaskResponse.model_validate(promoted).model_dump(mode="json"),
    })
    return promoted


@router.delete("/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtask(
    project_id: uuid.UUID,
    subtask_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    subtask_service: SubtaskService = Depends(get_subtask_service),
    task_repo: TaskRepository = Depends(get_task_repository),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    # Snapshot title before deletion
    existing = await task_repo.get(subtask_id)
    deleted = await subtask_service.delete_subtask(subtask_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found.")
    if existing:
        await activity_svc.log_subtask_deleted(
            task_id=task.id,
            task_title=task.title,
            project_id=project_id,
            actor_id=current_user.id,
            actor_name=current_user.username or current_user.email,
            subtask_title=existing.title,
        )
