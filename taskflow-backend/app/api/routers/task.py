import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder

from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, TaskReorderRequest
from app.services.task import TaskService
from app.services.subtask import SubtaskService
from app.services.ai import AIService
from app.services.notification import NotificationService
from app.services.watcher import WatcherService
from app.services.activity import ActivityService
from app.api.dependencies import (
    get_task_service,
    get_subtask_service,
    get_ai_service,
    get_member_board,
    get_member_project,
    get_member_project_task,
    get_viewer_board,
    get_viewer_project,
    get_redis,
    get_current_user,
    get_task_repository,
    get_notification_service,
    get_watcher_service,
    get_task_watcher_repository,
    get_user_repository,
    get_activity_service,
    get_project_status_service,
    get_task_link_repository,
    get_db_session,
)
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.automation_service import AutomationService
from app.services.webhook import dispatch as webhook_dispatch
from app.core.errors import AppError
from app.core.ws_manager import manager
from app.models.project import Project
from app.models.board import Board
from app.models.task import Task, TaskStatus, IssueType
from app.models.user import User
from app.services.project_status import ProjectStatusService

_STATUS_TO_CATEGORY = {
    TaskStatus.todo: "unstarted",
    TaskStatus.in_progress: "started",
    TaskStatus.done: "completed",
}

_CATEGORY_TO_TASK_STATUS = {
    "unstarted": TaskStatus.todo,
    "started": TaskStatus.in_progress,
    "completed": TaskStatus.done,
    "cancelled": TaskStatus.done,
}
from app.repositories.task import TaskRepository
from app.repositories.task_watcher import TaskWatcherRepository
from app.repositories.user import UserRepository

# Board-scoped: list, create, reorder
board_router = APIRouter(prefix="/projects/{project_id}/boards/{board_id}/tasks", tags=["Tasks"])

# Project-scoped (flat): update, delete, ai-breakdown
router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Tasks"])

_AI_RATE_LIMIT = 10
_AI_RATE_WINDOW = 3600


def _serialize(task: Task) -> dict:
    return jsonable_encoder(TaskResponse.model_validate(task))

def _actor_name(user: User) -> str:
    return user.username or user.email


@board_router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    watcher_service: WatcherService = Depends(get_watcher_service),
    notif_service: NotificationService = Depends(get_notification_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    board: Board = Depends(get_member_board),
    status_svc: ProjectStatusService = Depends(get_project_status_service),
    session: AsyncSession = Depends(get_db_session),
):
    # Creation policy (Jira Create-transition model): 'initial'/'curated'
    # projects coerce or restrict the birth status. Admin bulk paths
    # (tracker import) intentionally bypass — historical Done stays Done.
    project = await session.get(Project, project_id)
    await status_svc.apply_creation_policy(project, payload)
    task = await task_service.create_task(project_id, payload, created_by=current_user.id)
    await AutomationService(session).run(project_id, "task_created", task, current_user.id)
    await watcher_service.auto_watch_creator(task.id, current_user.id)
    if task.assignee_id and task.assignee_id != current_user.id:
        await watcher_service.auto_watch_assignee(task.id, task.assignee_id)
        await notif_service.on_assignee_changed(
            task_id=task.id, project_id=project_id, task_title=task.title,
            actor_id=current_user.id, actor_name=_actor_name(current_user),
            new_assignee_id=task.assignee_id, old_assignee_id=None,
        )
    await activity_svc.log_task_created(
        task_id=task.id,
        task_title=task.title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=_actor_name(current_user),
    )
    await manager.broadcast(str(project_id), {"type": "task.created", "payload": _serialize(task)})
    await webhook_dispatch(session, project_id, "task.created", _serialize(task))
    return task


@board_router.get("", response_model=List[TaskResponse])
async def list_tasks(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    status: Optional[TaskStatus] = Query(default=None),
    issue_type: Optional[IssueType] = Query(default=None),
    include_old_done: bool = Query(default=False),
    task_service: TaskService = Depends(get_task_service),
    board: Board = Depends(get_viewer_board),
    project: Project = Depends(get_viewer_project),
):
    # REQ-138: default board view drops tasks completed before the project cutoff.
    hide_done_before = None
    if project.hide_done_after_days is not None and not include_old_done:
        hide_done_before = datetime.now(timezone.utc) - timedelta(days=project.hide_done_after_days)
    return await task_service.get_project_tasks(project_id, status, issue_type, hide_done_before)


# /reorder must be declared before /{task_id} — static segments take priority in FastAPI
@board_router.patch("/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_tasks(
    project_id: uuid.UUID,
    board_id: uuid.UUID,
    payload: TaskReorderRequest,
    task_service: TaskService = Depends(get_task_service),
    board: Board = Depends(get_member_board),
):
    await task_service.reorder_tasks(payload.tasks)
    await manager.broadcast(
        str(project_id),
        {
            "type": "tasks.reordered",
            "payload": {"tasks": [{"id": str(item.id), "position": item.position} for item in payload.tasks]},
        },
    )


async def _fire_status_event(task, payload, old_status, project_id, actor_id, name, notif_svc, activity_svc) -> None:
    if payload.status is None or payload.status == old_status:
        return
    await notif_svc.on_status_changed(
        task_id=task.id, project_id=project_id, task_title=task.title,
        actor_id=actor_id, actor_name=name,
        assignee_id=task.assignee_id, new_status=payload.status.value,
    )
    await activity_svc.log_status_changed(
        task_id=task.id, task_title=task.title, project_id=project_id,
        actor_id=actor_id, actor_name=name,
        old_status=old_status.value if old_status else "",
        new_status=payload.status.value,
    )


async def _fire_assignee_event(task, payload, old_assignee, project_id, actor_id, name, user_repo, notif_svc, watcher_svc, activity_svc) -> None:
    if payload.assignee_id is None or payload.assignee_id == old_assignee:
        return
    await watcher_svc.auto_watch_assignee(task.id, payload.assignee_id)
    await notif_svc.on_assignee_changed(
        task_id=task.id, project_id=project_id, task_title=task.title,
        actor_id=actor_id, actor_name=name,
        new_assignee_id=payload.assignee_id, old_assignee_id=old_assignee,
    )
    old_user = await user_repo.get(old_assignee) if old_assignee else None
    new_user = await user_repo.get(payload.assignee_id)
    await activity_svc.log_assignee_changed(
        task_id=task.id, task_title=task.title, project_id=project_id,
        actor_id=actor_id, actor_name=name,
        old_assignee_name=_actor_name(old_user) if old_user else None,
        new_assignee_name=_actor_name(new_user) if new_user else None,
    )


async def _fire_priority_event(task, payload, old_priority, project_id, actor_id, name, notif_svc, activity_svc) -> None:
    if payload.priority_id is None or payload.priority_id == old_priority:
        return
    await notif_svc.on_priority_changed(
        task_id=task.id, project_id=project_id, task_title=task.title,
        actor_id=actor_id, actor_name=name,
        assignee_id=task.assignee_id, new_priority=payload.priority_id,
    )
    await activity_svc.log_priority_changed(
        task_id=task.id, task_title=task.title, project_id=project_id,
        actor_id=actor_id, actor_name=name,
        old_priority=old_priority,
        new_priority=payload.priority_id,
    )


async def _fire_due_date_event(task, payload, old_due_date, project_id, actor_id, name, activity_svc) -> None:
    if payload.due_date is None or payload.due_date == old_due_date:
        return
    await activity_svc.log_due_date_changed(
        task_id=task.id, task_title=task.title, project_id=project_id,
        actor_id=actor_id, actor_name=name,
        old_due_date=old_due_date.isoformat() if old_due_date else None,
        new_due_date=payload.due_date.isoformat() if payload.due_date else None,
    )


async def _fire_title_event(task, payload, old_title, project_id, actor_id, name, activity_svc) -> None:
    if payload.title is None or payload.title == old_title:
        return
    await activity_svc.log_title_changed(
        task_id=task.id, task_title=task.title, project_id=project_id,
        actor_id=actor_id, actor_name=name,
        old_title=old_title or "",
        new_title=payload.title,
    )


async def _fire_update_events(
    task: Task,
    payload: TaskUpdate,
    old_status,
    old_assignee,
    old_priority,
    old_due_date,
    old_title,
    project_id: uuid.UUID,
    current_user: User,
    user_repo: UserRepository,
    notif_service: NotificationService,
    watcher_service: WatcherService,
    activity_svc: ActivityService,
) -> None:
    name = _actor_name(current_user)
    uid = current_user.id
    await _fire_status_event(task, payload, old_status, project_id, uid, name, notif_service, activity_svc)
    await _fire_assignee_event(task, payload, old_assignee, project_id, uid, name, user_repo, notif_service, watcher_service, activity_svc)
    await _fire_priority_event(task, payload, old_priority, project_id, uid, name, notif_service, activity_svc)
    await _fire_due_date_event(task, payload, old_due_date, project_id, uid, name, activity_svc)
    await _fire_title_event(task, payload, old_title, project_id, uid, name, activity_svc)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    project: Project = Depends(get_viewer_project),
    task_repo: TaskRepository = Depends(get_task_repository),
):
    task = await task_repo.get_full(task_id)
    if not task or task.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


# REQ-157: the old repo-level PATCH /bulk endpoint (silent path — no validation,
# no activity/webhooks) was superseded by routers/bulk_edit.py (DD-050).


async def _resolve_status_extra_fields(
    project_id: uuid.UUID,
    project: Project,
    task: Task,
    payload: TaskUpdate,
    old_status,
    old_custom,
    status_svc: ProjectStatusService,
) -> dict:
    extra_fields: dict = {}

    if payload.custom_status_id is not None:
        target_ps = await status_svc.repo.get(payload.custom_status_id)
        if not target_ps or target_ps.project_id != project_id:
            raise AppError(404, "STATUS_NOT_FOUND", "Custom status not found in this project.")
        await status_svc.validate_transition(project_id, project.mode, old_custom, payload.custom_status_id, task.issue_type)
        extra_fields["status"] = _CATEGORY_TO_TASK_STATUS.get(target_ps.category, TaskStatus.todo)

    elif payload.status is not None and payload.status != old_status and project.mode == "enforced":
        statuses = await status_svc.list_statuses(project_id)
        cat_to_id: dict = {}
        for s in statuses:
            if s.category not in cat_to_id:
                cat_to_id[s.category] = s.id
        from_cat = _STATUS_TO_CATEGORY.get(old_status) if old_status else None
        to_cat   = _STATUS_TO_CATEGORY.get(payload.status)
        to_id    = cat_to_id.get(to_cat) if to_cat else None
        if to_id is None:
            # Target category has no mapped status — previously this skipped
            # validation entirely and the change sailed through (P0 bypass).
            raise AppError(
                409, "TRANSITION_NOT_ALLOWED",
                "No status in this project maps to that state — transition not permitted in Enforced mode.",
            )
        from_id = cat_to_id.get(from_cat) if from_cat else None
        await status_svc.validate_transition(project_id, "enforced", from_id, to_id, task.issue_type)

    return extra_fields


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    task_repo: TaskRepository = Depends(get_task_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    notif_service: NotificationService = Depends(get_notification_service),
    watcher_service: WatcherService = Depends(get_watcher_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    status_svc: ProjectStatusService = Depends(get_project_status_service),
    project: Project = Depends(get_member_project),
    task: Task = Depends(get_member_project_task),
    task_link_repo=Depends(get_task_link_repository),
):
    # Custom fields: merge over existing, validate types + required (Enforced).
    if payload.custom_fields is not None:
        from app.repositories.custom_field import CustomFieldRepository
        from app.services.custom_fields import validate_custom_fields
        defs = await CustomFieldRepository(task_repo.session).list_for_project(project_id)
        merged = {**(task.custom_fields or {}), **payload.custom_fields}
        payload.custom_fields = validate_custom_fields(merged, defs, project.mode)

    old = await task_repo.get(task_id)
    old_status   = old.status           if old else None
    old_assignee = old.assignee_id      if old else None
    old_priority = old.priority_id      if old else None
    old_due_date = old.due_date         if old else None
    old_title    = old.title            if old else None
    old_custom   = old.custom_status_id if old else None

    extra_fields = await _resolve_status_extra_fields(
        project_id, project, task, payload, old_status, old_custom, status_svc
    )

    await task_service.enforce_type_gates(task, payload, extra_fields, project.mode)
    await task_service.enforce_block_gate(task, payload, extra_fields, project.mode, project.enforce_block_links, task_link_repo)

    updated = await task_service.update_task(task_id, payload, extra_fields=extra_fields or None)
    if updated is None:
        raise AppError(409, "CONFLICT_VERSION", "Task was modified by another session.")

    # When custom_status_id drove a status change, synthesize status on the payload
    # so notification/activity events fire correctly.
    effective_payload = payload
    if extra_fields.get("status") and payload.status is None:
        effective_payload = payload.model_copy(update={"status": extra_fields["status"]})

    await _fire_update_events(
        updated, effective_payload,
        old_status, old_assignee, old_priority, old_due_date, old_title,
        project_id, current_user,
        user_repo, notif_service, watcher_service, activity_svc,
    )
    await manager.broadcast(str(project_id), {"type": "task.updated", "payload": _serialize(updated)})
    await webhook_dispatch(task_repo.session, project_id, "task.updated", _serialize(updated))
    if updated.status == TaskStatus.done and old_status != TaskStatus.done:
        await webhook_dispatch(task_repo.session, project_id, "task.completed", _serialize(updated))

    # Automation: fire status_changed rules when the status actually changed.
    status_did_change = (
        (payload.status is not None and payload.status != old_status)
        or extra_fields.get("status") is not None
        or updated.custom_status_id != old_custom
    )
    if status_did_change:
        await AutomationService(task_repo.session).run(project_id, "status_changed", updated, current_user.id)

    new_effective_status = extra_fields.get("status") or (payload.status if payload.status is not None else old_status)
    rolled_up_epic = await task_service.maybe_rollup_epic(updated, new_effective_status, project.mode)
    if rolled_up_epic:
        await manager.broadcast(str(project_id), {"type": "task.updated", "payload": _serialize(rolled_up_epic)})

    return updated


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    task_repo: TaskRepository = Depends(get_task_repository),
    watcher_repo: TaskWatcherRepository = Depends(get_task_watcher_repository),
    notif_service: NotificationService = Depends(get_notification_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    task: Task = Depends(get_member_project_task),
):
    # Collect watchers + assignee before CASCADE deletes them
    watcher_ids = await watcher_repo.get_watcher_ids(task_id)
    title = task.title
    assignee_id = task.assignee_id

    # Log before delete so task_id FK is still valid at flush time
    await activity_svc.log_task_deleted(
        task_id=task_id,
        task_title=title,
        project_id=project_id,
        actor_id=current_user.id,
        actor_name=_actor_name(current_user),
    )

    deleted = await task_service.delete_task(task_id)
    if not deleted:
        raise AppError(404, "TASK_NOT_FOUND", "Task not found.")

    await notif_service.on_task_deleted(
        task_id=task_id, project_id=project_id, task_title=title,
        actor_id=current_user.id, actor_name=_actor_name(current_user),
        assignee_id=assignee_id, watcher_ids=watcher_ids,
    )
    await manager.broadcast(str(project_id), {"type": "task.deleted", "payload": {"task_id": str(task_id)}})
    await webhook_dispatch(task_repo.session, project_id, "task.deleted", {"task_id": str(task_id), "title": title})


@router.post("/{task_id}/ai-breakdown", response_model=TaskResponse)
async def ai_breakdown(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    task: Task = Depends(get_member_project_task),
    task_service: TaskService = Depends(get_task_service),
    subtask_service: SubtaskService = Depends(get_subtask_service),
    ai_service: AIService = Depends(get_ai_service),
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    rate_key = f"ai_rate:{current_user.id}"
    count = await redis.incr(rate_key)
    if count == 1:
        await redis.expire(rate_key, _AI_RATE_WINDOW)
    if count > _AI_RATE_LIMIT:
        raise AppError(429, "RATE_LIMIT_EXCEEDED", "AI breakdown limit: 10 per hour. Try again later.")

    try:
        breakdown = await ai_service.generate_subtasks(task.title, task.description)
    except Exception:
        raise AppError(502, "AI_SERVICE_UNAVAILABLE", "AI service failed. No sub-tasks were created.")

    for sub in breakdown.sub_tasks:
        await subtask_service.create_subtask(task.id, project_id, sub.title, created_by=current_user.id)

    result = await task_service.get_task_with_subtasks(task_id)
    if result is None:
        raise AppError(404, "TASK_NOT_FOUND", "Task not found.")

    await manager.broadcast(str(project_id), {"type": "subtasks.generated", "payload": _serialize(result)})
    return result
