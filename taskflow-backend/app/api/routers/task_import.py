"""CSV task import (REQ-149). Admin-gated; per-row error report, batch never aborts."""
import csv
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from app.api.dependencies import get_current_user, get_db_session, get_admin_project, get_task_service
from app.core.errors import AppError
from app.models.project import Project
from app.models.task import TaskStatus, IssueType
from app.models.user import User
from app.schemas.task import TaskCreate
from app.services.task import TaskService

router = APIRouter(prefix="/projects/{project_id}/import", tags=["Import"])

_MAX_ROWS = 500


class ImportRowError(BaseModel):
    row: int
    error: str


class ImportResult(BaseModel):
    created: int
    errors: list[ImportRowError]


def _parse_row(row: dict) -> TaskCreate:
    title = (row.get("title") or "").strip()
    if not title:
        raise ValueError("missing title")
    kwargs: dict = {"title": title[:100]}
    if row.get("description"):
        kwargs["description"] = row["description"]
    if row.get("status"):
        try:
            kwargs["status"] = TaskStatus(row["status"].strip().lower())
        except ValueError:
            raise ValueError(f"invalid status '{row['status']}'")
    if row.get("issue_type"):
        try:
            kwargs["issue_type"] = IssueType(row["issue_type"].strip().lower())
        except ValueError:
            raise ValueError(f"invalid issue_type '{row['issue_type']}'")
    if row.get("due_date"):
        try:
            kwargs["due_date"] = datetime.fromisoformat(row["due_date"].strip())
        except ValueError:
            raise ValueError(f"invalid due_date '{row['due_date']}' (use ISO 8601)")
    return TaskCreate(**kwargs)


# ── REQ-160: import from other trackers ──────────────────────────────────────

@router.post("/trello")
async def import_trello_board(
    file: UploadFile = File(...),
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    session=Depends(get_db_session),
):
    import json

    from app.services.tracker_import import import_trello

    raw = await file.read()
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise AppError(422, "INVALID_FILE", "File must be a Trello board JSON export.")
    try:
        return await import_trello(session, project, current_user.id, task_service, data)
    except ValueError as exc:
        raise AppError(422, "INVALID_FILE", str(exc))


@router.post("/jira")
async def import_jira(
    file: UploadFile = File(...),
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
    session=Depends(get_db_session),
):
    from app.services.tracker_import import import_jira_csv

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AppError(422, "INVALID_FILE", "File must be UTF-8 encoded CSV.")
    try:
        return await import_jira_csv(session, project, current_user.id, task_service, text)
    except ValueError as exc:
        raise AppError(422, "INVALID_FILE", str(exc))


@router.post("/csv", response_model=ImportResult)
async def import_csv(
    file: UploadFile = File(...),
    project: Project = Depends(get_admin_project),
    current_user: User = Depends(get_current_user),
    task_service: TaskService = Depends(get_task_service),
):
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise AppError(422, "INVALID_FILE", "File must be UTF-8 encoded CSV.")

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or "title" not in [f.strip().lower() for f in reader.fieldnames]:
        raise AppError(422, "INVALID_FILE", "CSV needs a header row with at least a 'title' column.")

    created = 0
    errors: list[ImportRowError] = []
    for index, row in enumerate(reader, start=2):  # row 1 = header
        if created + len(errors) >= _MAX_ROWS:
            errors.append(ImportRowError(row=index, error=f"row limit {_MAX_ROWS} reached — split the file"))
            break
        normalized = {(k or "").strip().lower(): (v or "") for k, v in row.items()}
        try:
            payload = _parse_row(normalized)
            await task_service.create_task(
                project.id, payload, created_by=current_user.id, apply_default_assignee=False
            )
            created += 1
        except Exception as exc:  # noqa: BLE001 — one bad row never aborts the batch
            errors.append(ImportRowError(row=index, error=str(exc)))
    return ImportResult(created=created, errors=errors)
