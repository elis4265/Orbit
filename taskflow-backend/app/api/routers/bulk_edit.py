"""REQ-157 — bulk edit with per-row report (DD-050). Also hosts the REQ-159
CSV export route (early registration keeps /export ahead of /{task_id}).

Replays the normal single-update pipeline per task — validation, completed_at
stamping, activity, notifications, WS, webhooks — and collects failures per row.
No client-supplied OCC versions: the server re-reads each task and bumps its
version, so stale single-task modals still 409 on their next save.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    get_activity_service,
    get_current_user,
    get_db_session,
    get_member_project,
    get_notification_service,
    get_project_status_service,
    get_tag_service,
    get_task_link_repository,
    get_task_repository,
    get_task_service,
    get_user_repository,
    get_viewer_project,
    get_watcher_service,
)
from app.api.routers.task import (
    _actor_name,
    _fire_update_events,
    _resolve_status_extra_fields,
    _serialize,
)
from app.core.logging import get_logger
from app.core.ws_manager import manager
from app.models.project import Project
from app.models.task import TaskStatus, IssueType
from app.models.user import User
from app.repositories.task import TaskRepository
from app.repositories.task_link import TaskLinkRepository
from app.repositories.user import UserRepository
from app.schemas.task import TaskUpdate
from app.services.activity import ActivityService
from app.services.notification import NotificationService
from app.services.project_status import ProjectStatusService
from app.services.tag import TagService
from app.services.task import TaskService
from app.services.watcher import WatcherService
from app.services.webhook import dispatch as webhook_dispatch

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Bulk Edit"])
logger = get_logger("bulk_edit")


# ── REQ-159: CSV export (DD-051) ─────────────────────────────────────────────
# Lives on this early-registered router so the static /export segment wins
# over task.py's dynamic GET /{task_id}.

def _export_response(session: AsyncSession, project: "Project", fields: Optional[str],
                     task_ids: Optional[List[uuid.UUID]] = None):
    from fastapi.responses import StreamingResponse

    from app.services.task_export import export_tasks_csv, validate_fields

    try:
        field_list = validate_fields(fields)
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    filename = f"{project.key or 'tasks'}-export.csv"
    return StreamingResponse(
        export_tasks_csv(session, project, field_list, task_ids),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export")
async def export_tasks(
    project_id: uuid.UUID,
    fields: Optional[str] = None,
    project: "Project" = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return _export_response(session, project, fields)


class ExportRequest(BaseModel):
    fields: Optional[str] = None
    # REQ-166: client-filtered subset (the filter language is client-side, DD-050);
    # POST because hundreds of UUIDs don't fit in a query string
    task_ids: Optional[List[uuid.UUID]] = None


@router.post("/export")
async def export_tasks_filtered(
    project_id: uuid.UUID,
    payload: ExportRequest,
    project: "Project" = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    return _export_response(session, project, payload.fields, payload.task_ids)

BULK_CAP = 100


class BulkChanges(BaseModel):
    status: Optional[TaskStatus] = None
    custom_status_id: Optional[uuid.UUID] = None
    assignee_id: Optional[uuid.UUID] = None
    sprint_id: Optional[uuid.UUID] = None
    priority_id: Optional[uuid.UUID] = None
    add_tag_ids: Optional[List[uuid.UUID]] = None
    remove_tag_ids: Optional[List[uuid.UUID]] = None


class BulkEditRequest(BaseModel):
    task_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=BULK_CAP)
    changes: BulkChanges


class BulkRowError(BaseModel):
    task_id: str
    error: str


class BulkEditResponse(BaseModel):
    updated: List[str]
    errors: List[BulkRowError]


@router.patch("/bulk", response_model=BulkEditResponse)
async def bulk_edit(
    project_id: uuid.UUID,
    payload: BulkEditRequest,
    project: Project = Depends(get_member_project),
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    task_repo: TaskRepository = Depends(get_task_repository),
    task_link_repo: TaskLinkRepository = Depends(get_task_link_repository),
    status_svc: ProjectStatusService = Depends(get_project_status_service),
    tag_svc: TagService = Depends(get_tag_service),
    user_repo: UserRepository = Depends(get_user_repository),
    notif_service: NotificationService = Depends(get_notification_service),
    watcher_service: WatcherService = Depends(get_watcher_service),
    activity_svc: ActivityService = Depends(get_activity_service),
    session: AsyncSession = Depends(get_db_session),
):
    field_changes = payload.changes.model_dump(
        exclude_unset=True, exclude={"add_tag_ids", "remove_tag_ids"}
    )
    add_tags = payload.changes.add_tag_ids or []
    remove_tags = payload.changes.remove_tag_ids or []
    if not field_changes and not add_tags and not remove_tags:
        raise HTTPException(422, "No changes given.")

    # Tag lookups once per request, not per task
    tag_map = {}
    for tag_id in (*add_tags, *remove_tags):
        tag = await tag_svc.tag_repo.get_by_id(tag_id)
        if not tag or tag.project_id != project_id:
            raise HTTPException(404, f"Tag {tag_id} not found in this project.")
        tag_map[tag_id] = tag

    updated: list[str] = []
    errors: list[BulkRowError] = []

    for task_id in payload.task_ids:
        try:
            task = await task_repo.get(task_id)
            if task is None or task.project_id != project_id:
                raise HTTPException(404, "Task not found in this project.")

            if field_changes:
                update = TaskUpdate(**field_changes, version=task.version)
                old_status = task.status
                old_assignee = task.assignee_id
                old_priority = task.priority_id
                old_due_date = task.due_date
                old_title = task.title
                old_custom = task.custom_status_id

                extra_fields = await _resolve_status_extra_fields(
                    project_id, project, task, update, old_status, old_custom, status_svc
                )
                await task_service.enforce_type_gates(task, update, extra_fields, project.mode)
                await task_service.enforce_block_gate(
                    task, update, extra_fields, project.mode, project.enforce_block_links, task_link_repo
                )

                result = await task_service.update_task(task_id, update, extra_fields=extra_fields or None)
                if result is None:
                    raise HTTPException(409, "Task was modified concurrently.")

                effective = update
                if extra_fields.get("status") and update.status is None:
                    effective = update.model_copy(update={"status": extra_fields["status"]})
                await _fire_update_events(
                    result, effective,
                    old_status, old_assignee, old_priority, old_due_date, old_title,
                    project_id, current_user,
                    user_repo, notif_service, watcher_service, activity_svc,
                )
                await manager.broadcast(str(project_id), {"type": "task.updated", "payload": _serialize(result)})
                await webhook_dispatch(session, project_id, "task.updated", _serialize(result))
                if result.status == TaskStatus.done and old_status != TaskStatus.done:
                    await webhook_dispatch(session, project_id, "task.completed", _serialize(result))
                task = result

            for tag_id in add_tags:
                await tag_svc.apply_tag(task_id, tag_id, current_user.id)
                await activity_svc.log_tag_applied(
                    task_id=task_id, task_title=task.title, project_id=project_id,
                    actor_id=current_user.id, actor_name=_actor_name(current_user),
                    tag_name=tag_map[tag_id].name, tag_color=tag_map[tag_id].color,
                )
            for tag_id in remove_tags:
                await tag_svc.remove_tag(task_id, tag_id)
                await activity_svc.log_tag_removed(
                    task_id=task_id, task_title=task.title, project_id=project_id,
                    actor_id=current_user.id, actor_name=_actor_name(current_user),
                    tag_name=tag_map[tag_id].name, tag_color=tag_map[tag_id].color,
                )
            if not field_changes and (add_tags or remove_tags):
                await manager.broadcast(str(project_id), {"type": "task.updated", "payload": _serialize(task)})

            updated.append(str(task_id))
        except HTTPException as exc:
            errors.append(BulkRowError(task_id=str(task_id), error=str(exc.detail)))

    logger.info("bulk_edit", project_id=str(project_id), actor=str(current_user.id),
                requested=len(payload.task_ids), updated=len(updated), failed=len(errors))
    return BulkEditResponse(updated=updated, errors=errors)
