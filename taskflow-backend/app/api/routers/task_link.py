import uuid
from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import (
    get_current_user,
    get_member_project_task,
    get_viewer_project_task,
    get_task_link_repository,
    get_task_link_service,
    get_activity_service,
)
from app.models.task import Task
from app.models.user import User
from app.schemas.task_link import TaskLinkCreate, TaskLinkResponse
from app.services.task_link import TaskLinkService
from app.services.activity import ActivityService

router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/links",
    tags=["task-links"],
)


@router.get("", response_model=list[TaskLinkResponse])
async def list_links(
    task_id: uuid.UUID,
    task: Task = Depends(get_viewer_project_task),
    svc: TaskLinkService = Depends(get_task_link_service),
):
    return await svc.list_links(task_id)


@router.post("", response_model=TaskLinkResponse, status_code=201)
async def add_link(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskLinkCreate,
    task: Task = Depends(get_member_project_task),
    svc: TaskLinkService = Depends(get_task_link_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    current_user: User = Depends(get_current_user),
):
    try:
        result = await svc.add_link(task_id, body.target_id, body.link_type, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    actor_name = current_user.username or current_user.email
    await activity_svc.log_link_added(
        task_id, task.title, project_id, current_user.id, actor_name,
        result.display_type, result.linked_task.title,
    )
    return result


@router.delete("/{link_id}", status_code=204)
async def remove_link(
    project_id: uuid.UUID,
    link_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    svc: TaskLinkService = Depends(get_task_link_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    current_user: User = Depends(get_current_user),
):
    link = await svc.repo.get(link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found.")
    link_response = await svc._build_response(link, task.id)
    await svc.remove_link(link_id)
    actor_name = current_user.username or current_user.email
    await activity_svc.log_link_removed(
        task.id, task.title, project_id, current_user.id, actor_name,
        link_response.display_type, link_response.linked_task.title,
    )
