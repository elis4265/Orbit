import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Sequence
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import selectinload
from app.models.task import Task, TaskStatus, IssueType
from app.models.project import Project
from app.repositories.base import BaseRepository

if TYPE_CHECKING:
    from app.schemas.task import TaskReorderItem


def _with_completed_at(data: dict) -> dict:
    """REQ-137: when status is written, stamp/clear completed_at in the same UPDATE.
    COALESCE preserves the original stamp when done is merely re-asserted."""
    if "status" not in data:
        return data
    if data["status"] in (TaskStatus.done, TaskStatus.done.value):
        return {**data, "completed_at": func.coalesce(Task.completed_at, datetime.now(timezone.utc))}
    return {**data, "completed_at": None}


class TaskRepository(BaseRepository[Task]):
    def __init__(self, session):
        super().__init__(Task, session)

    async def get_full(self, task_id: uuid.UUID) -> Task | None:
        result = await self.session.execute(
            select(Task)
            .where(Task.id == task_id)
            .options(
                selectinload(Task.sub_tasks),
                selectinload(Task.tags),
                selectinload(Task.parent),
                selectinload(Task.project),
            )
        )
        return result.scalar_one_or_none()

    async def get_project_tasks_filtered(
        self,
        project_id: uuid.UUID,
        sprint_filter: "str | uuid.UUID | None" = None,
    ) -> Sequence[Task]:
        """Project-scoped task query with optional sprint filter.

        sprint_filter=None   → all tasks (no sprint clause)
        sprint_filter='none' → sprint_id IS NULL  (Backlog)
        sprint_filter=<UUID> → sprint_id = <UUID> (Active Sprint or any sprint)
        """
        q = (
            select(Task)
            .where(Task.project_id == project_id, Task.archived_at.is_(None))
            .order_by(Task.status, Task.position)
            .options(selectinload(Task.sub_tasks), selectinload(Task.tags), selectinload(Task.parent), selectinload(Task.project))
        )
        if sprint_filter == "none":
            q = q.where(Task.sprint_id.is_(None))
        elif sprint_filter is not None:
            q = q.where(Task.sprint_id == sprint_filter)
        result = await self.session.execute(q)
        return result.scalars().all()

    async def get_project_tasks(
        self,
        project_id: uuid.UUID,
        status: TaskStatus | None = None,
        issue_type: IssueType | None = None,
        hide_done_before: datetime | None = None,
        include_archived: bool = False,
    ) -> Sequence[Task]:
        q = (
            select(Task)
            .where(Task.project_id == project_id)
            .order_by(Task.status, Task.position)
            .options(selectinload(Task.sub_tasks), selectinload(Task.tags), selectinload(Task.parent), selectinload(Task.project))
        )
        if not include_archived:
            # REQ-161: archived tasks leave default queries; ?include_archived opts in
            q = q.where(Task.archived_at.is_(None))
        if status is not None:
            q = q.where(Task.status == status)
        if issue_type is not None:
            q = q.where(Task.issue_type == issue_type)
        if hide_done_before is not None:
            # REQ-138: drop tasks completed before the cutoff; open tasks unaffected.
            q = q.where(or_(Task.completed_at.is_(None), Task.completed_at >= hide_done_before))
        result = await self.session.execute(q)
        return result.scalars().all()

    async def update_with_occ(self, task_id: uuid.UUID, current_version: int, update_data: dict) -> bool:
        """Updates a task row using Optimistic Concurrency Control.
        
        Matches both the primary key AND the version token from the client.
        Increments the version counter dynamically on success. Returns False on mismatch.
        """
        stmt = (
            update(Task)
            .where(Task.id == task_id, Task.version == current_version)
            .values(**_with_completed_at(update_data), version=current_version + 1, updated_at=datetime.now(timezone.utc))
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount > 0

    async def bulk_update(self, project_id: uuid.UUID, task_ids: list[uuid.UUID], data: dict) -> int:
        """Update multiple tasks in one statement. Only updates fields present in data."""
        if not data or not task_ids:
            return 0
        stmt = (
            update(Task)
            .where(Task.id.in_(task_ids), Task.project_id == project_id)
            .values(**_with_completed_at(data), updated_at=datetime.now(timezone.utc))
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.rowcount

    async def bulk_update_positions(self, items: list["TaskReorderItem"]) -> None:
        for item in items:
            values: dict = {"position": item.position, "updated_at": datetime.now(timezone.utc)}
            if item.grid_x is not None:
                values["grid_x"] = item.grid_x
            if item.grid_y is not None:
                values["grid_y"] = item.grid_y
            stmt = update(Task).where(Task.id == item.id).values(**values)
            await self.session.execute(stmt)
        await self.session.commit()

    async def create_with_sequence(self, project_id: uuid.UUID, obj_in: dict) -> Task:
        """Lock the project row, assign next sequence_number, create task — all in one commit."""
        result = await self.session.execute(
            select(Project).where(Project.id == project_id).with_for_update()
        )
        project = result.scalars().first()
        obj_in["sequence_number"] = project.next_sequence
        project.next_sequence += 1
        if obj_in.get("status") == TaskStatus.done:
            obj_in["completed_at"] = datetime.now(timezone.utc)
        task = Task(**obj_in)
        self.session.add(task)
        await self.session.commit()
        return task

    async def get_user_tasks(self, user_id: uuid.UUID, facet: str) -> Sequence[Task]:
        """REQ-142 My Work: the user's tasks across all projects they own or belong to.

        facet: 'assigned' → assignee_id, 'created' → created_by, 'watching' → task_watchers.
        Membership is always enforced — a task in an inaccessible project never leaks,
        even if assigned to the user.
        """
        from app.models.project_member import ProjectMember
        from app.models.task_watcher import TaskWatcher

        accessible = select(Project.id).where(
            or_(
                Project.owner_id == user_id,
                Project.id.in_(select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)),
            )
        )
        q = (
            select(Task)
            .where(Task.project_id.in_(accessible), Task.archived_at.is_(None))
            .order_by(Task.due_date.asc().nulls_last(), Task.updated_at.desc())
            # HW-30: custom_status is eager-loaded here because My Work spans projects and
            # cannot fetch each project's status list to resolve the name client-side.
            .options(
                selectinload(Task.sub_tasks), selectinload(Task.tags), selectinload(Task.parent),
                selectinload(Task.project), selectinload(Task.custom_status),
            )
        )
        if facet == "assigned":
            q = q.where(Task.assignee_id == user_id)
        elif facet == "created":
            q = q.where(Task.created_by == user_id)
        else:  # watching
            q = q.where(Task.id.in_(select(TaskWatcher.task_id).where(TaskWatcher.user_id == user_id)))
        result = await self.session.execute(q)
        return result.scalars().all()

    async def unassign_all_for_user(self, project_id: uuid.UUID, user_id: uuid.UUID) -> int:
        """Clear this user's assignments across one project. Returns the row count.

        Used when a member is removed: leaving the tasks assigned would point them at
        someone who can no longer open the project — the team sees a blank avatar
        (they are gone from memberMap) while filters and stats still count the task as
        assigned, and the removed user cannot see it either because My Work enforces
        membership. Unassigning keeps the UI and the database telling the same story.
        """
        result = await self.session.execute(
            update(Task)
            .where(Task.project_id == project_id, Task.assignee_id == user_id)
            .values(assignee_id=None)
        )
        return result.rowcount or 0

    async def get_children(self, parent_id: uuid.UUID) -> Sequence[Task]:
        result = await self.session.execute(
            select(Task).where(Task.parent_id == parent_id)
        )
        return result.scalars().all()

    async def get_with_children(self, task_id: uuid.UUID) -> Task | None:
        result = await self.session.execute(
            select(Task)
            .where(Task.id == task_id)
            .options(selectinload(Task.sub_tasks), selectinload(Task.tags), selectinload(Task.parent), selectinload(Task.project))
            .execution_options(populate_existing=True)
        )
        return result.scalars().first()