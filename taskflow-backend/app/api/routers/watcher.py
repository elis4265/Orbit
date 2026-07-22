import uuid

from fastapi import APIRouter, Depends, status

from app.api.dependencies import (
    get_current_user,
    get_task_watcher_repository,
    get_watcher_service,
    get_viewer_project_task,
    get_member_project_task,
)
from app.models.user import User
from app.models.task import Task
from app.repositories.task_watcher import TaskWatcherRepository
from app.schemas.notification import WatcherResponse
from app.services.watcher import WatcherService

router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}",
    tags=["Watchers"],
)


@router.get("/watchers", response_model=list[WatcherResponse])
async def list_watchers(
    task_id: uuid.UUID,
    _task: Task = Depends(get_viewer_project_task),
    watcher_repo: TaskWatcherRepository = Depends(get_task_watcher_repository),
):
    return await watcher_repo.get_watchers(task_id)


@router.post("/watch", status_code=status.HTTP_204_NO_CONTENT)
async def watch_task(
    task_id: uuid.UUID,
    _task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    watcher_service: WatcherService = Depends(get_watcher_service),
):
    await watcher_service.watch(task_id, current_user.id)


@router.delete("/watch", status_code=status.HTTP_204_NO_CONTENT)
async def unwatch_task(
    task_id: uuid.UUID,
    _task: Task = Depends(get_member_project_task),
    current_user: User = Depends(get_current_user),
    watcher_service: WatcherService = Depends(get_watcher_service),
):
    await watcher_service.unwatch(task_id, current_user.id)


@router.get("/watch/me")
async def get_watch_status(
    task_id: uuid.UUID,
    _task: Task = Depends(get_viewer_project_task),
    current_user: User = Depends(get_current_user),
    watcher_repo: TaskWatcherRepository = Depends(get_task_watcher_repository),
):
    watching = await watcher_repo.is_watching(task_id, current_user.id)
    return {"watching": watching}
