import uuid

from fastapi import APIRouter, Depends, status

from app.api.dependencies import (
    get_current_user,
    get_viewer_project,
    get_member_project,
    get_viewer_project_task,
    get_member_project_task,
    get_project_member_repository,
    get_tag_repository,
    get_tag_service,
    get_activity_service,
)
from app.core.errors import AppError
from app.models.user import User
from app.models.project import Project
from app.models.task import Task
from app.models.project_member import MemberRole
from app.repositories.project_member import ProjectMemberRepository
from app.repositories.tag import TagRepository
from app.schemas.tag import TagCreate, TagUpdate, TagResponse
from app.services.tag import TagService
from app.services.activity import ActivityService

router = APIRouter(prefix="/projects/{project_id}/tags", tags=["Tags"])
task_tag_router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/tags",
    tags=["Tags"],
)


def _is_admin(project: Project, current_user: User, membership) -> bool:
    return (
        project.owner_id == current_user.id
        or (membership is not None and MemberRole(membership.role) == MemberRole.admin)
    )


# --- Project tag CRUD ---

@router.get("", response_model=list[TagResponse])
async def list_tags(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    current_user: User = Depends(get_current_user),
    tag_svc: TagService = Depends(get_tag_service),
):
    return await tag_svc.list_tags(project_id, current_user.id)


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(
    project_id: uuid.UUID,
    body: TagCreate,
    _project: Project = Depends(get_member_project),
    current_user: User = Depends(get_current_user),
    tag_svc: TagService = Depends(get_tag_service),
):
    return await tag_svc.create_tag(
        project_id=project_id,
        owner_id=current_user.id,
        name=body.name,
        color=body.color,
        visibility=body.visibility,
    )


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(
    project_id: uuid.UUID,
    tag_id: uuid.UUID,
    body: TagUpdate,
    project: Project = Depends(get_member_project),
    current_user: User = Depends(get_current_user),
    tag_repo: TagRepository = Depends(get_tag_repository),
    tag_svc: TagService = Depends(get_tag_service),
    member_repo: ProjectMemberRepository = Depends(get_project_member_repository),
):
    tag = await tag_repo.get_by_id(tag_id)
    if not tag or tag.project_id != project_id:
        raise AppError(404, "NOT_FOUND", "Tag not found.")
    membership = await member_repo.get_membership(project_id, current_user.id)
    return await tag_svc.update_tag(
        tag=tag,
        requester_id=current_user.id,
        is_admin=_is_admin(project, current_user, membership),
        name=body.name,
        color=body.color,
        visibility=body.visibility,
    )


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    project_id: uuid.UUID,
    tag_id: uuid.UUID,
    project: Project = Depends(get_member_project),
    current_user: User = Depends(get_current_user),
    tag_repo: TagRepository = Depends(get_tag_repository),
    tag_svc: TagService = Depends(get_tag_service),
    member_repo: ProjectMemberRepository = Depends(get_project_member_repository),
):
    tag = await tag_repo.get_by_id(tag_id)
    if not tag or tag.project_id != project_id:
        raise AppError(404, "NOT_FOUND", "Tag not found.")
    membership = await member_repo.get_membership(project_id, current_user.id)
    await tag_svc.delete_tag(
        tag=tag,
        requester_id=current_user.id,
        is_admin=_is_admin(project, current_user, membership),
    )


# --- Task tag apply/remove ---

@task_tag_router.get("", response_model=list[TagResponse])
async def list_task_tags(
    task_id: uuid.UUID,
    _task: Task = Depends(get_viewer_project_task),
    tag_svc: TagService = Depends(get_tag_service),
):
    return await tag_svc.get_task_tags(task_id)


@task_tag_router.post("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apply_tag_to_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    tag_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    tag_repo: TagRepository = Depends(get_tag_repository),
    tag_svc: TagService = Depends(get_tag_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    tag = await tag_repo.get_by_id(tag_id)
    if not tag or tag.project_id != project_id:
        raise AppError(404, "NOT_FOUND", "Tag not found.")
    await tag_svc.apply_tag(task_id, tag_id, current_user.id)
    await activity_svc.log_tag_applied(
        task_id=task_id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=current_user.username or current_user.email,
        tag_name=tag.name,
        tag_color=tag.color,
    )


@task_tag_router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_tag_from_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    tag_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    tag_repo: TagRepository = Depends(get_tag_repository),
    tag_svc: TagService = Depends(get_tag_service),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    tag = await tag_repo.get_by_id(tag_id)
    if tag:
        await activity_svc.log_tag_removed(
            task_id=task_id,
            task_title=task.title,
            project_id=project_id,
            actor_id=current_user.id,
            actor_name=current_user.username or current_user.email,
            tag_name=tag.name,
            tag_color=tag.color,
        )
    await tag_svc.remove_tag(task_id, tag_id)
