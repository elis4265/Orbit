"""REQ-160 — import from other trackers: Trello (board JSON) and Jira (CSV).

Same contract as the REQ-149 CSV importer: valid entities import, invalid ones
are reported per entity, one bad entity never aborts the batch. Users are
never auto-created — assignees are dropped; comment authorship is attributed
to the importer with the original author named in the body.
"""
import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.comment import Comment
from app.models.project import Project
from app.models.tag import Tag, TagVisibility
from app.models.task import TaskStatus, IssueType
from app.models.task_tag import TaskTag
from app.models.project_status import ProjectStatus
from app.schemas.task import TaskCreate
from app.services.task import TaskService

logger = get_logger("tracker_import")

_MAX_ENTITIES = 500

# Trello label color names → our hex palette
_TRELLO_COLORS = {
    "green": "#22c55e", "yellow": "#eab308", "orange": "#f97316", "red": "#ef4444",
    "purple": "#a855f7", "blue": "#3b82f6", "sky": "#0ea5e9", "lime": "#84cc16",
    "pink": "#ec4899", "black": "#6b7280",
}

_DONE_WORDS = ("done", "complete", "closed", "resolved", "shipped", "finished")
_PROGRESS_WORDS = ("progress", "doing", "review", "wip", "started", "development")


class ImportEntityError(BaseModel):
    entity: str
    error: str


class TrackerImportResult(BaseModel):
    created: int
    errors: list[ImportEntityError]


def _status_from_name(name: str) -> TaskStatus:
    lowered = (name or "").lower()
    if any(w in lowered for w in _DONE_WORDS):
        return TaskStatus.done
    if any(w in lowered for w in _PROGRESS_WORDS):
        return TaskStatus.in_progress
    return TaskStatus.todo


async def _custom_status_by_name(session: AsyncSession, project: Project, name: str):
    if project.mode == "open":
        return None
    rows = (await session.execute(
        select(ProjectStatus).where(ProjectStatus.project_id == project.id)
    )).scalars().all()
    for s in rows:
        if s.name.lower() == (name or "").lower():
            return s
    return None


async def _find_or_create_tag(
    session: AsyncSession, project: Project, actor_id: uuid.UUID, name: str, color: str
) -> Tag:
    existing = (await session.execute(
        select(Tag).where(Tag.project_id == project.id)
    )).scalars().all()
    for t in existing:
        if t.name.lower() == name.lower():
            return t
    tag = Tag(project_id=project.id, owner_id=actor_id, name=name[:50], color=color,
              visibility=TagVisibility.workspace)
    session.add(tag)
    await session.flush()
    return tag


async def import_trello(
    session: AsyncSession, project: Project, actor_id: uuid.UUID,
    task_service: TaskService, data: dict,
) -> TrackerImportResult:
    if not isinstance(data, dict) or "cards" not in data or "lists" not in data:
        raise ValueError("Not a Trello board export (expected 'lists' and 'cards').")

    lists_by_id = {l.get("id"): l for l in data.get("lists", []) if isinstance(l, dict)}
    checklists_by_card: dict = {}
    for cl in data.get("checklists", []) or []:
        checklists_by_card.setdefault(cl.get("idCard"), []).extend(cl.get("checkItems", []) or [])
    comments_by_card: dict = {}
    for action in data.get("actions", []) or []:
        if action.get("type") == "commentCard":
            card_id = (action.get("data", {}).get("card") or {}).get("id")
            if card_id:
                comments_by_card.setdefault(card_id, []).append(action)

    created = 0
    errors: list[ImportEntityError] = []

    for card in data.get("cards", []) or []:
        entity = f"card '{(card.get('name') or '?')[:40]}'"
        if created + len(errors) >= _MAX_ENTITIES:
            errors.append(ImportEntityError(entity=entity, error=f"entity limit {_MAX_ENTITIES} reached"))
            break
        try:
            if card.get("closed"):
                continue  # Trello-archived cards are skipped
            title = (card.get("name") or "").strip()
            if not title:
                raise ValueError("missing card name")

            list_name = (lists_by_id.get(card.get("idList")) or {}).get("name", "")
            custom = await _custom_status_by_name(session, project, list_name)
            kwargs: dict = {
                "title": title[:100],
                "status": _status_from_name(list_name),
            }
            if custom is not None:
                kwargs["custom_status_id"] = custom.id
            if card.get("desc"):
                kwargs["description"] = card["desc"]
            if card.get("due"):
                try:
                    kwargs["due_date"] = datetime.fromisoformat(card["due"].replace("Z", "+00:00"))
                except ValueError:
                    pass  # bad due date is not worth failing the card

            task = await task_service.create_task(
                project.id, TaskCreate(**kwargs), created_by=actor_id, apply_default_assignee=False
            )

            for label in card.get("labels", []) or []:
                name = (label.get("name") or "").strip() or label.get("color", "label")
                tag = await _find_or_create_tag(
                    session, project, actor_id, name, _TRELLO_COLORS.get(label.get("color", ""), "#7c6af7")
                )
                session.add(TaskTag(task_id=task.id, tag_id=tag.id, added_by=actor_id))

            for item in checklists_by_card.get(card.get("id"), []):
                item_name = (item.get("name") or "").strip()
                if not item_name:
                    continue
                await task_service.task_repo.create_with_sequence(project.id, {
                    "project_id": project.id,
                    "parent_id": task.id,
                    "title": item_name[:100],
                    "status": TaskStatus.done if item.get("state") == "complete" else TaskStatus.todo,
                    "created_by": actor_id,
                    # HW-18: imports never apply the project default assignee —
                    # a checklist child with no assignee stays unassigned.
                    "assignee_id": None,
                })

            for action in comments_by_card.get(card.get("id"), []):
                author = (action.get("memberCreator") or {}).get("fullName", "unknown")
                text = (action.get("data") or {}).get("text", "")
                session.add(Comment(
                    task_id=task.id, author_id=actor_id,
                    content=f"<p><em>Trello · {author}:</em></p><p>{text}</p>",
                ))

            await session.commit()
            created += 1
        except Exception as exc:  # noqa: BLE001 — one bad entity never aborts the batch
            await session.rollback()
            errors.append(ImportEntityError(entity=entity, error=str(exc)))

    logger.info("trello_import", project=str(project.id), created=created, failed=len(errors))
    return TrackerImportResult(created=created, errors=errors)


_JIRA_TYPES = {"epic": IssueType.epic, "story": IssueType.story, "task": IssueType.task, "bug": IssueType.bug}


async def import_jira_csv(
    session: AsyncSession, project: Project, actor_id: uuid.UUID,
    task_service: TaskService, text: str,
) -> TrackerImportResult:
    import csv
    import io

    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise ValueError("Empty file.")
    cols = [h.strip().lower() for h in header]
    if "summary" not in cols:
        raise ValueError("Not a Jira CSV export (no 'Summary' column).")

    def col(row: list, name: str) -> str:
        try:
            return (row[cols.index(name)] or "").strip()
        except (ValueError, IndexError):
            return ""

    # Jira repeats the Labels column once per label
    label_idxs = [i for i, c in enumerate(cols) if c == "labels"]

    created = 0
    errors: list[ImportEntityError] = []
    for line_no, row in enumerate(reader, start=2):
        entity = f"row {line_no}"
        if created + len(errors) >= _MAX_ENTITIES:
            errors.append(ImportEntityError(entity=entity, error=f"entity limit {_MAX_ENTITIES} reached"))
            break
        try:
            title = col(row, "summary")
            if not title:
                raise ValueError("missing Summary")
            kwargs: dict = {
                "title": title[:100],
                "status": _status_from_name(col(row, "status")),
                "issue_type": _JIRA_TYPES.get(col(row, "issue type").lower(), IssueType.task),
            }
            if col(row, "description"):
                kwargs["description"] = col(row, "description")
            due = col(row, "due date")
            if due:
                try:
                    kwargs["due_date"] = datetime.fromisoformat(due)
                except ValueError:
                    pass

            task = await task_service.create_task(
                project.id, TaskCreate(**kwargs), created_by=actor_id, apply_default_assignee=False
            )

            for i in label_idxs:
                if i < len(row) and (row[i] or "").strip():
                    tag = await _find_or_create_tag(session, project, actor_id, row[i].strip(), "#7c6af7")
                    session.add(TaskTag(task_id=task.id, tag_id=tag.id, added_by=actor_id))
            await session.commit()
            created += 1
        except Exception as exc:  # noqa: BLE001
            await session.rollback()
            errors.append(ImportEntityError(entity=entity, error=str(exc)))

    logger.info("jira_import", project=str(project.id), created=created, failed=len(errors))
    return TrackerImportResult(created=created, errors=errors)
