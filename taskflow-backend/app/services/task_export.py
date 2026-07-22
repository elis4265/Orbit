"""REQ-159 (DD-051) — CSV task export.

Full project dump: ignores hide_done_after_days, board filters, sprint scope —
the Issues page is the single-filter surface; the export file must never
silently drop rows. Column choice via a whitelist-validated `fields` list;
custom-field columns ride along under the `custom_fields` pseudo-field.
"""
import csv
import io
import uuid
from typing import AsyncIterator

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_field import CustomField
from app.models.priority import PrioritySchemeItem
from app.models.project import Project
from app.models.project_status import ProjectStatus
from app.models.release import Release
from app.models.sprint import Sprint
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_tag import TaskTag
from app.models.user import User
from app.models.work_log import WorkLog

# Order defines column order in the file. `custom_fields` expands to one
# column per project custom-field definition.
EXPORT_FIELDS: tuple[str, ...] = (
    "key", "id", "title", "description", "issue_type", "status", "custom_status",
    "parent_key", "assignee", "created_by", "priority", "severity", "tags",
    "sprint", "release", "estimate", "business_value", "start_date", "due_date",
    "created_at", "updated_at", "completed_at", "time_spent_minutes", "custom_fields",
)


def validate_fields(raw: str | None) -> list[str]:
    """Comma-separated field list → validated, order-normalized. None → all."""
    if not raw:
        return list(EXPORT_FIELDS)
    requested = [f.strip() for f in raw.split(",") if f.strip()]
    unknown = [f for f in requested if f not in EXPORT_FIELDS]
    if unknown:
        raise ValueError(f"Unknown fields: {', '.join(unknown)}")
    # Preserve canonical order regardless of request order
    return [f for f in EXPORT_FIELDS if f in requested]


def _iso(value) -> str:
    return value.isoformat() if value else ""


async def export_tasks_csv(
    session: AsyncSession, project: Project, fields: list[str],
    task_ids: list[uuid.UUID] | None = None,
) -> AsyncIterator[str]:
    """Yield CSV lines (header first). Lookups are batched once per export.
    `task_ids` narrows to a client-filtered subset (REQ-166) — always
    intersected with the project, so foreign ids can never leak."""
    query = select(Task).where(Task.project_id == project.id)
    if task_ids is not None:
        query = query.where(Task.id.in_(task_ids))
    tasks = (await session.execute(query.order_by(Task.sequence_number))).scalars().all()

    user_ids = {t.assignee_id for t in tasks} | {t.created_by for t in tasks}
    user_ids.discard(None)
    users = {} if not user_ids else {
        u.id: (u.username or u.email) for u in (await session.execute(
            select(User).where(User.id.in_(user_ids))
        )).scalars().all()
    }

    tag_rows = (await session.execute(
        select(TaskTag.task_id, Tag.name)
        .join(Tag, Tag.id == TaskTag.tag_id)
        .join(Task, Task.id == TaskTag.task_id)
        .where(Task.project_id == project.id)
        .order_by(Tag.name)
    )).all()
    tags_by_task: dict[uuid.UUID, list[str]] = {}
    for task_id, tag_name in tag_rows:
        tags_by_task.setdefault(task_id, []).append(tag_name)

    def _name_map(model):
        async def _load():
            rows = (await session.execute(
                select(model).where(model.project_id == project.id)
            )).scalars().all()
            return {r.id: r.name for r in rows}
        return _load

    sprints = await _name_map(Sprint)()
    releases = await _name_map(Release)()
    statuses = await _name_map(ProjectStatus)()

    priority_ids = {t.priority_id for t in tasks}
    priority_ids.discard(None)
    priorities = {} if not priority_ids else {
        p.id: p.name for p in (await session.execute(
            select(PrioritySchemeItem).where(PrioritySchemeItem.id.in_(priority_ids))
        )).scalars().all()
    }

    minutes_rows = (await session.execute(
        select(WorkLog.task_id, func.sum(WorkLog.minutes))
        .join(Task, Task.id == WorkLog.task_id)
        .where(Task.project_id == project.id)
        .group_by(WorkLog.task_id)
    )).all()
    minutes_by_task = {task_id: total for task_id, total in minutes_rows}

    task_keys = {t.id: f"{project.key}-{t.sequence_number}" for t in tasks}

    custom_defs: list[CustomField] = []
    if "custom_fields" in fields:
        custom_defs = list((await session.execute(
            select(CustomField).where(CustomField.project_id == project.id).order_by(CustomField.name)
        )).scalars().all())

    header = [f for f in fields if f != "custom_fields"] + [d.name for d in custom_defs]

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")

    def _flush() -> str:
        line = buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        return line

    writer.writerow(header)
    yield _flush()

    for t in tasks:
        values = {
            "key": task_keys[t.id],
            "id": str(t.id),
            "title": t.title,
            "description": t.description or "",
            "issue_type": t.issue_type.value if t.issue_type else "",
            "status": t.status.value if t.status else "",
            "custom_status": statuses.get(t.custom_status_id, ""),
            "parent_key": task_keys.get(t.parent_id, ""),
            "assignee": users.get(t.assignee_id, ""),
            "created_by": users.get(t.created_by, ""),
            "priority": priorities.get(t.priority_id, ""),
            "severity": t.severity.value if t.severity else "",
            "tags": ";".join(tags_by_task.get(t.id, [])),
            "sprint": sprints.get(t.sprint_id, ""),
            "release": releases.get(t.release_id, ""),
            "estimate": t.estimate if t.estimate is not None else "",
            "business_value": t.business_value if t.business_value is not None else "",
            "start_date": _iso(t.start_date),
            "due_date": _iso(t.due_date),
            "created_at": _iso(t.created_at),
            "updated_at": _iso(t.updated_at),
            "completed_at": _iso(t.completed_at),
            "time_spent_minutes": minutes_by_task.get(t.id, 0),
        }
        row = [values[f] for f in fields if f != "custom_fields"]
        cf_values = t.custom_fields or {}
        for d in custom_defs:
            row.append(cf_values.get(str(d.id), ""))
        writer.writerow(row)
        yield _flush()
