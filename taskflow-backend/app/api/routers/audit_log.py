import csv
import io
import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.api.dependencies import get_audit_log_service, get_admin_project
from app.models.project import Project
from app.schemas.audit_log import AuditLogResponse, PaginatedAuditLogResponse
from app.services.audit_log import AuditLogService


def _stream_audit_csv(items: list, workspace_id: uuid.UUID) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "actor", "action", "entity_type", "entity_name", "detail"])
    for e in items:
        detail = json.dumps(e.meta, default=str) if e.meta else ""
        writer.writerow([
            e.id, e.created_at.isoformat(),
            e.actor_name or "", e.action,
            e.entity_type, e.entity_name or "", detail,
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="audit-{workspace_id}.csv"'},
    )


def _stream_audit_json(items: list, workspace_id: uuid.UUID) -> StreamingResponse:
    data = [AuditLogResponse.model_validate(e).model_dump(mode="json") for e in items]
    return StreamingResponse(
        iter([json.dumps(data, indent=2, default=str)]),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="audit-{workspace_id}.json"'},
    )

router = APIRouter(
    prefix="/projects/{project_id}/audit",
    tags=["Audit"],
)


@router.get("", response_model=PaginatedAuditLogResponse)
async def get_workspace_audit(
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
    _project: Project = Depends(get_admin_project),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    items, total, next_cursor = await audit_svc.get_workspace_audit(
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
    return PaginatedAuditLogResponse(
        items=[AuditLogResponse.model_validate(e) for e in items],
        total=total,
        next_cursor=next_cursor,
    )


@router.get("/export")
async def export_workspace_audit(
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
    _project: Project = Depends(get_admin_project),
    audit_svc: AuditLogService = Depends(get_audit_log_service),
):
    items, _, _ = await audit_svc.get_workspace_audit(
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
        return _stream_audit_csv(items, project_id)
    return _stream_audit_json(items, project_id)
