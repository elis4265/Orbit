import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional, Sequence

if TYPE_CHECKING:
    from app.repositories.task_link import TaskLinkRepository

from app.models.task import Task, TaskStatus, IssueType, SeverityLevel, ALLOWED_PARENT_TYPES
from app.repositories.task import TaskRepository
from app.schemas.task import TaskCreate, TaskUpdate, TaskReorderItem
from app.core.errors import AppError


class TaskService:
    def __init__(self, task_repo: TaskRepository, project_repo=None):
        self.task_repo = task_repo
        # HW-18: required to resolve the project's default-assignee policy on create.
        # Every production construction site passes it (api/dependencies.get_task_service
        # and services/recurrence); when absent the default simply does not apply.
        self.project_repo = project_repo

    async def resolve_default_assignee(
        self,
        project_id: uuid.UUID,
        explicit_assignee_id: uuid.UUID | None,
        created_by: uuid.UUID | None,
        explicitly_set: bool = False,
    ) -> uuid.UUID | None:
        """HW-18: per-project default assignee for new tasks.

        An explicit assignee always wins. Otherwise the project's policy decides.

        HW-18: explicitly_set distinguishes "assignee_id: null" from an absent key.
        The Create modal pre-fills this field from the default and lets the creator
        empty it again, so a null the client actually sent means "nobody" and must
        stand — otherwise the field they just cleared is silently refilled. A caller
        that never mentions assignee_id (API, PAT, recurring schedule) has no opinion
        and still gets the default.

        Imports are deliberately excluded (see create_task's apply_default_assignee):
        an imported row carries its own assignee data, and silently mass-assigning
        hundreds of rows to one person is surprising and tedious to undo. If an
        import has no assignee — or names one we cannot match to a user — the task
        stays unassigned rather than falling back to the project default.
        """
        if explicit_assignee_id is not None:
            return explicit_assignee_id
        if explicitly_set:
            return None
        if self.project_repo is None:
            return None
        project = await self.project_repo.get(project_id)
        if project is None:
            return None
        mode = project.default_assignee_mode
        if mode == "creator":
            return created_by
        if mode == "member":
            return project.default_assignee_id
        return None

    async def _validate_hierarchy(self, child_type: IssueType, parent_id: uuid.UUID | None) -> None:
        allowed = ALLOWED_PARENT_TYPES[child_type]
        if parent_id is None:
            return
        if not allowed:
            raise AppError(422, "INVALID_HIERARCHY", f"An epic cannot have a parent task.")
        parent = await self.task_repo.get(parent_id)
        if parent is None:
            raise AppError(404, "NOT_FOUND", "Parent task not found.")
        if parent.issue_type not in allowed:
            allowed_names = " or ".join(sorted(t.value for t in allowed))
            raise AppError(
                422,
                "INVALID_HIERARCHY",
                f"A {child_type.value} cannot be nested under a {parent.issue_type.value}. "
                f"Allowed parent types: {allowed_names}.",
            )

    async def create_task(
        self,
        project_id: uuid.UUID,
        data: TaskCreate,
        created_by: uuid.UUID | None = None,
        *,
        apply_default_assignee: bool = True,
    ) -> Task:
        await self._validate_hierarchy(data.issue_type, data.parent_id)
        # Import paths pass False: imported rows keep their own assignee (or none).
        assignee_id = (
            await self.resolve_default_assignee(
                project_id,
                data.assignee_id,
                created_by,
                # HW-18: Pydantic records which fields the client actually sent, which is
                # the only way to tell a deliberate null from an omission over JSON.
                explicitly_set="assignee_id" in data.model_fields_set,
            )
            if apply_default_assignee
            else data.assignee_id
        )
        task_data = {
            "project_id": project_id,
            "title": data.title,
            "description": data.description,
            "status": data.status,
            "issue_type": data.issue_type,
            "priority_id": data.priority_id,
            "position": data.position,
            "due_date": data.due_date,
            "assignee_id": assignee_id,
            "parent_id": data.parent_id,
            "custom_status_id": data.custom_status_id,
            "severity": data.severity,
            "start_date": data.start_date,
            "created_by": created_by,
        }
        return await self.task_repo.create_with_sequence(project_id, task_data)

    async def get_project_tasks(
        self,
        project_id: uuid.UUID,
        status: TaskStatus | None = None,
        issue_type: IssueType | None = None,
        hide_done_before: datetime | None = None,
        include_archived: bool = False,
    ) -> Sequence[Task]:
        return await self.task_repo.get_project_tasks(
            project_id, status, issue_type, hide_done_before, include_archived
        )

    async def get_task_with_subtasks(self, task_id: uuid.UUID) -> Optional[Task]:
        return await self.task_repo.get_with_children(task_id)

    async def update_task(
        self,
        task_id: uuid.UUID,
        update: TaskUpdate,
        extra_fields: dict | None = None,
    ) -> Optional[Task]:
        update_data = update.model_dump(exclude={"version"}, exclude_unset=True)
        if extra_fields:
            update_data.update(extra_fields)
        if "parent_id" in update_data or "issue_type" in update_data:
            current = await self.task_repo.get(task_id)
            if current:
                effective_type = update_data.get("issue_type", current.issue_type)
                effective_parent_id = update_data["parent_id"] if "parent_id" in update_data else current.parent_id
                await self._validate_hierarchy(effective_type, effective_parent_id)
        success = await self.task_repo.update_with_occ(task_id, update.version, update_data)
        if not success:
            return None
        return await self.task_repo.get_with_children(task_id)

    async def delete_task(self, task_id: uuid.UUID) -> bool:
        task = await self.task_repo.get(task_id)
        if not task:
            return False
        await self.task_repo.delete(task)
        return True

    async def enforce_type_gates(
        self,
        task: Task,
        update: "TaskUpdate",
        extra_fields: dict,
        project_mode: str,
    ) -> None:
        """Enforced mode: type-specific transition gates.

        Bug: severity must be set before entering a 'started' status.
        Story: parent Epic required before leaving 'unstarted' status.
        """
        if project_mode != "enforced":
            return

        new_status = extra_fields.get("status") or update.status
        if new_status is None:
            return

        if task.issue_type == IssueType.bug:
            effective_severity = update.severity if update.severity is not None else task.severity
            if new_status == TaskStatus.in_progress and effective_severity is None:
                raise AppError(422, "SEVERITY_REQUIRED", "Bug tasks require severity to be set before starting work.")

        if task.issue_type == IssueType.story:
            effective_parent_id = update.parent_id if "parent_id" in (update.model_fields_set or set()) else task.parent_id
            if new_status in (TaskStatus.in_progress, TaskStatus.done) and effective_parent_id is None:
                raise AppError(422, "EPIC_REQUIRED", "Story tasks must be linked to an Epic before leaving the backlog.")
            if effective_parent_id is not None and new_status in (TaskStatus.in_progress, TaskStatus.done):
                parent = await self.task_repo.get(effective_parent_id)
                if parent is None or parent.issue_type != IssueType.epic:
                    raise AppError(422, "EPIC_REQUIRED", "Story tasks must be linked to an Epic (not another task type).")

    async def enforce_block_gate(
        self,
        task: Task,
        update: "TaskUpdate",
        extra_fields: dict,
        project_mode: str,
        enforce_block_links: bool,
        task_link_repo: "TaskLinkRepository",
    ) -> None:
        if project_mode != "enforced" or not enforce_block_links:
            return
        new_status = extra_fields.get("status") or update.status
        if new_status != TaskStatus.done:
            return
        active_blockers = await task_link_repo.get_incoming_active_blocks(task.id)
        if active_blockers:
            raise AppError(
                422,
                "BLOCKED",
                "This task is blocked by unresolved issues. Resolve all blockers before marking as Done.",
            )

    async def maybe_rollup_epic(
        self,
        task: Task,
        new_status: TaskStatus,
        project_mode: str,
    ) -> Optional[Task]:
        """Open mode only: auto-complete the parent Epic when all its children reach done."""
        if project_mode != "open":
            return None
        if new_status != TaskStatus.done:
            return None
        if task.parent_id is None:
            return None
        parent = await self.task_repo.get(task.parent_id)
        if parent is None or parent.issue_type != IssueType.epic:
            return None
        if parent.status == TaskStatus.done:
            return None
        siblings = await self.task_repo.get_children(parent.id)
        if not siblings or not all(s.status == TaskStatus.done for s in siblings):
            return None
        success = await self.task_repo.update_with_occ(
            parent.id, parent.version, {"status": TaskStatus.done}
        )
        if not success:
            return None
        return await self.task_repo.get_with_children(parent.id)

    async def reorder_tasks(self, items: list[TaskReorderItem]) -> None:
        await self.task_repo.bulk_update_positions(items)
