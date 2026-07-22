"""REQ-156 — clone within a project, move across projects (DD-049).

Clone: new task + children/tags/Yjs doc; no comments/worklogs/attachments/watchers.
Move: same task row re-homed — comments etc. travel because task_id is stable;
project-scoped refs (sprint, release, custom status, tags, custom fields, links)
are remapped or dropped. Direct children travel; grandchildren refuse (v1).
"""
import uuid

from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.models.project import Project
from app.models.project_status import ProjectStatus, StatusCategory
from app.models.tag import Tag
from app.models.task import Task, TaskStatus
from app.models.task_link import TaskLink
from app.models.task_tag import TaskTag
from app.models.custom_field import CustomField

# Enum status → category, and back (first match wins on the way back).
_STATUS_TO_CATEGORY = {
    TaskStatus.todo: StatusCategory.unstarted,
    TaskStatus.in_progress: StatusCategory.started,
    TaskStatus.done: StatusCategory.completed,
}
_CATEGORY_TO_STATUS = {
    StatusCategory.unstarted: TaskStatus.todo,
    StatusCategory.started: TaskStatus.in_progress,
    StatusCategory.completed: TaskStatus.done,
    StatusCategory.cancelled: TaskStatus.done,
}


async def _next_sequence(session: AsyncSession, project_id: uuid.UUID) -> int:
    result = await session.execute(
        select(Project).where(Project.id == project_id).with_for_update()
    )
    project = result.scalars().first()
    seq = project.next_sequence
    project.next_sequence += 1
    return seq


async def _children_of(session: AsyncSession, task_id: uuid.UUID) -> list[Task]:
    result = await session.execute(select(Task).where(Task.parent_id == task_id))
    return list(result.scalars().all())


async def clone_task(session: AsyncSession, task: Task, actor_id: uuid.UUID) -> Task:
    clone = Task(
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        # status deliberately NOT copied — a clone starts fresh (DD-049)
        issue_type=task.issue_type,
        priority_id=task.priority_id,
        severity=task.severity,
        estimate=task.estimate,
        business_value=task.business_value,
        custom_fields=dict(task.custom_fields) if task.custom_fields else None,
        start_date=task.start_date,
        due_date=task.due_date,
        parent_id=task.parent_id,
        created_by=actor_id,
        sequence_number=await _next_sequence(session, task.project_id),
    )
    session.add(clone)
    await session.flush()

    for child in await _children_of(session, task.id):
        session.add(Task(
            project_id=task.project_id,
            title=child.title,
            status=child.status,  # subtask done-state preserved
            parent_id=clone.id,
            created_by=actor_id,
            sequence_number=await _next_sequence(session, task.project_id),
        ))

    tag_rows = (await session.execute(
        select(TaskTag).where(TaskTag.task_id == task.id)
    )).scalars().all()
    for row in tag_rows:
        session.add(TaskTag(task_id=clone.id, tag_id=row.tag_id, added_by=actor_id))

    # Copy the collaborative description document so the editor shows the text.
    await session.execute(text(
        "INSERT INTO task_yjs_documents (task_id, ydoc) "
        "SELECT :new_id, ydoc FROM task_yjs_documents WHERE task_id = :old_id"
    ), {"new_id": clone.id, "old_id": task.id})

    await session.commit()
    await session.refresh(clone)
    return clone


async def _remap_status(
    session: AsyncSession, task: Task, target_project: Project
) -> tuple[TaskStatus, uuid.UUID | None]:
    """Effective category of the task → (enum status, custom_status_id) in the target."""
    category = _STATUS_TO_CATEGORY[task.status]
    if task.custom_status_id:
        src_status = await session.get(ProjectStatus, task.custom_status_id)
        if src_status:
            category = src_status.category

    target_statuses = (await session.execute(
        select(ProjectStatus)
        .where(ProjectStatus.project_id == target_project.id, ProjectStatus.category == category)
        .order_by(ProjectStatus.position)
    )).scalars().all()

    enum_status = _CATEGORY_TO_STATUS[category]
    if target_project.mode != "open" and target_statuses:
        return enum_status, target_statuses[0].id
    return enum_status, None


async def _remap_tags(session: AsyncSession, task_id: uuid.UUID, source_project_id: uuid.UUID, target_project_id: uuid.UUID) -> None:
    rows = (await session.execute(
        select(TaskTag, Tag).join(Tag, Tag.id == TaskTag.tag_id).where(TaskTag.task_id == task_id)
    )).all()
    if not rows:
        return
    target_tags = (await session.execute(
        select(Tag).where(Tag.project_id == target_project_id)
    )).scalars().all()
    by_name = {t.name.lower(): t.id for t in target_tags}
    for task_tag, tag in rows:
        match = by_name.get(tag.name.lower())
        if match:
            task_tag.tag_id = match
        else:
            await session.delete(task_tag)


async def _remap_custom_fields(
    session: AsyncSession, task: Task, source_project_id: uuid.UUID, target_project_id: uuid.UUID
) -> None:
    if not task.custom_fields:
        return
    src_defs = {str(f.id): f for f in (await session.execute(
        select(CustomField).where(CustomField.project_id == source_project_id)
    )).scalars().all()}
    dst_by_name = {(f.name.lower(), f.field_type): f for f in (await session.execute(
        select(CustomField).where(CustomField.project_id == target_project_id)
    )).scalars().all()}

    remapped: dict = {}
    for field_id, value in task.custom_fields.items():
        src = src_defs.get(field_id)
        if src is None:
            continue
        dst = dst_by_name.get((src.name.lower(), src.field_type))
        if dst is not None:
            remapped[str(dst.id)] = value
    task.custom_fields = remapped or None


async def move_task(
    session: AsyncSession, task: Task, target_project: Project, actor_id: uuid.UUID
) -> Task:
    if task.project_id == target_project.id:
        raise AppError(400, "SAME_PROJECT", "Task is already in this project.")

    children = await _children_of(session, task.id)
    for child in children:
        grandchildren = (await session.execute(
            select(func.count()).select_from(Task).where(Task.parent_id == child.id)
        )).scalar_one()
        if grandchildren:
            raise AppError(
                409, "MOVE_DEPTH_EXCEEDED",
                "This task has nested children. Move or detach the nested tasks first.",
            )

    source_project_id = task.project_id

    # Links dropped — cross-project links would leak titles past the membership wall (DD-049).
    await session.execute(delete(TaskLink).where(
        (TaskLink.source_id == task.id) | (TaskLink.target_id == task.id)
    ))

    for t in (task, *children):
        enum_status, custom_status_id = await _remap_status(session, t, target_project)
        t.status = enum_status
        t.custom_status_id = custom_status_id
        t.project_id = target_project.id
        t.sequence_number = await _next_sequence(session, target_project.id)
        t.sprint_id = None
        t.release_id = None
        t.version += 1
        await _remap_tags(session, t.id, source_project_id, target_project.id)
        await _remap_custom_fields(session, t, source_project_id, target_project.id)

    task.parent_id = None  # the root leaves its old parent behind

    await session.commit()
    await session.refresh(task)
    return task
