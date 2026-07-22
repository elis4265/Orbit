import csv
import io
import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.dependencies import (
    get_activity_service,
    get_viewer_project_task,
    get_viewer_project,
)
from app.models.task import Task
from app.models.project import Project
from app.schemas.activity import ActivityResponse, PaginatedActivityResponse
from app.services.activity import ActivityService

_ACTIVITY_CSV_HEADERS = ["id", "entity_type", "entity_name", "actor_name", "action", "field", "old_value", "new_value", "created_at"]


def _stream_activity_csv(entries: list, filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(_ACTIVITY_CSV_HEADERS)
    for e in entries:
        writer.writerow([
            e.id, e.entity_type, e.entity_name or "",
            e.actor_name or "", e.action, e.field or "",
            e.old_value or "", e.new_value or "",
            e.created_at.isoformat(),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _stream_activity_json(entries: list, filename: str) -> StreamingResponse:
    data = [ActivityResponse.model_validate(e).model_dump(mode="json") for e in entries]
    return StreamingResponse(
        iter([json.dumps(data, indent=2, default=str)]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

task_activity_router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/activity",
    tags=["Activity"],
)

project_activity_router = APIRouter(
    prefix="/projects/{project_id}/activity",
    tags=["Activity"],
)


@task_activity_router.get("", response_model=list[ActivityResponse])
async def get_task_activity(
    task_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    actions: list[str] = Query(default=[]),
    _task: Task = Depends(get_viewer_project_task),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    return await activity_svc.get_for_entity(
        "task", task_id, limit=limit, offset=offset, actions=actions or None
    )


@task_activity_router.get("/export")
async def export_task_activity(
    task_id: uuid.UUID,
    format: str = Query(default="json", pattern="^(csv|json)$"),
    _task: Task = Depends(get_viewer_project_task),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    entries = await activity_svc.get_for_entity("task", task_id, limit=500)
    if format == "csv":
        return _stream_activity_csv(entries, f"task-{task_id}-activity.csv")
    return _stream_activity_json(entries, f"task-{task_id}-activity.json")


@project_activity_router.get("", response_model=PaginatedActivityResponse)
async def get_workspace_activity(
    project_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    actor_ids: list[uuid.UUID] = Query(default=[]),
    exclude_actor_ids: list[uuid.UUID] = Query(default=[]),
    actions: list[str] = Query(default=[]),
    exclude_actions: list[str] = Query(default=[]),
    entity_types: list[str] = Query(default=[]),
    entity_name_search: str | None = Query(default=None, max_length=200),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    after_id: int | None = Query(default=None),
    before_id: int | None = Query(default=None),
    _project: Project = Depends(get_viewer_project),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    items, total, next_cursor = await activity_svc.get_workspace_activity(
        project_id,
        limit=limit,
        offset=offset,
        actor_ids=actor_ids or None,
        exclude_actor_ids=exclude_actor_ids or None,
        actions=actions or None,
        exclude_actions=exclude_actions or None,
        entity_types=entity_types or None,
        entity_name_search=entity_name_search or None,
        date_from=date_from,
        date_to=date_to,
        after_id=after_id,
        before_id=before_id,
    )
    return PaginatedActivityResponse(
        items=[ActivityResponse.model_validate(e) for e in items],
        total=total,
        next_cursor=next_cursor,
    )


@project_activity_router.get("/export")
async def export_workspace_activity(
    project_id: uuid.UUID,
    format: str = Query(default="json", pattern="^(csv|json)$"),
    actor_ids: list[uuid.UUID] = Query(default=[]),
    exclude_actor_ids: list[uuid.UUID] = Query(default=[]),
    actions: list[str] = Query(default=[]),
    exclude_actions: list[str] = Query(default=[]),
    entity_types: list[str] = Query(default=[]),
    entity_name_search: str | None = Query(default=None, max_length=200),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    _project: Project = Depends(get_viewer_project),
    activity_svc: ActivityService = Depends(get_activity_service),
):
    items, _, _ = await activity_svc.get_workspace_activity(
        project_id,
        limit=2000, offset=0,
        actor_ids=actor_ids or None,
        exclude_actor_ids=exclude_actor_ids or None,
        actions=actions or None,
        exclude_actions=exclude_actions or None,
        entity_types=entity_types or None,
        entity_name_search=entity_name_search or None,
        date_from=date_from,
        date_to=date_to,
    )
    if format == "csv":
        return _stream_activity_csv(items, f"project-{project_id}-activity.csv")
    return _stream_activity_json(items, f"project-{project_id}-activity.json")
