import uuid
from datetime import date

from app.core.errors import AppError
from app.models.task import TaskStatus
from app.repositories.sprint import SprintRepository
from app.schemas.sprint import SprintCreate, SprintResponse, SprintUpdate

# Status categories that count as "resolved" (won't roll over on sprint completion).
_RESOLVED_CATEGORIES = {"completed", "cancelled"}


class SprintService:
    def __init__(self, repo: SprintRepository, task_repo=None, status_repo=None):
        self.repo = repo
        self.task_repo = task_repo
        self.status_repo = status_repo

    async def list_sprints(self, project_id: uuid.UUID, board_id: uuid.UUID) -> list[SprintResponse]:
        sprints = await self.repo.list_for_board(project_id, board_id)
        return [SprintResponse.model_validate(s) for s in sprints]

    async def create_sprint(
        self, project_id: uuid.UUID, board_id: uuid.UUID, data: SprintCreate
    ) -> SprintResponse:
        if data.end_date < data.start_date:
            raise AppError(400, code="INVALID_PAYLOAD", message="end_date must be after start_date")
        sprint = await self.repo.create(
            project_id=project_id,
            board_id=board_id,
            name=data.name,
            goal=data.goal,
            start_date=data.start_date,
            end_date=data.end_date,
        )
        return SprintResponse.model_validate(sprint)

    async def update_sprint(
        self, sprint_id: uuid.UUID, project_id: uuid.UUID, data: SprintUpdate
    ) -> SprintResponse:
        sprint = await self.repo.get(sprint_id)
        if not sprint or sprint.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Sprint not found")
        if sprint.status == "closed":
            raise AppError(400, code="INVALID_PAYLOAD", message="Cannot update a closed sprint")
        update_data = data.model_dump(exclude_none=True)
        sprint = await self.repo.update(sprint, update_data)
        return SprintResponse.model_validate(sprint)

    async def activate_sprint(self, sprint_id: uuid.UUID, project_id: uuid.UUID) -> SprintResponse:
        sprint = await self.repo.get(sprint_id)
        if not sprint or sprint.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Sprint not found")
        if sprint.status != "planned":
            raise AppError(400, code="INVALID_PAYLOAD", message="Only planned sprints can be activated")
        # Snapshot committed story points (sum of assigned task estimates) for velocity.
        if self.task_repo is not None:
            tasks = await self.task_repo.get_project_tasks_filtered(project_id, sprint_id)
            committed = sum((t.estimate or 0) for t in tasks)
            await self.repo.update(sprint, {"committed_points": committed})
        sprint = await self.repo.activate(sprint)
        return SprintResponse.model_validate(sprint)

    async def close_sprint(self, sprint_id: uuid.UUID, project_id: uuid.UUID) -> SprintResponse:
        sprint = await self.repo.get(sprint_id)
        if not sprint or sprint.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Sprint not found")
        if sprint.status == "closed":
            raise AppError(400, code="INVALID_PAYLOAD", message="Sprint is already closed")
        sprint = await self.repo.close(sprint)
        return SprintResponse.model_validate(sprint)

    async def complete_sprint(
        self,
        sprint_id: uuid.UUID,
        project_id: uuid.UUID,
        action: str,
        target_sprint_id: uuid.UUID | None,
        new_sprint_name: str | None = None,
    ) -> SprintResponse:
        """Enforced-mode completion (Jira-style): move incomplete tasks to the
        backlog or a target sprint, then close. Completed tasks stay assigned.
        A parent with any unfinished child is itself treated as incomplete."""
        sprint = await self.repo.get(sprint_id)
        if not sprint or sprint.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Sprint not found")
        if sprint.status == "closed":
            raise AppError(400, code="INVALID_PAYLOAD", message="Sprint is already closed")

        if action == "move":
            if target_sprint_id is None:
                raise AppError(400, code="INVALID_PAYLOAD", message="target_sprint_id is required when moving incomplete tasks")
            if target_sprint_id == sprint_id:
                raise AppError(400, code="INVALID_PAYLOAD", message="Cannot move tasks to the sprint being completed")
            target = await self.repo.get(target_sprint_id)
            if not target or target.project_id != project_id or target.board_id != sprint.board_id:
                raise AppError(404, code="NOT_FOUND", message="Target sprint not found")
            if target.status == "closed":
                raise AppError(400, code="INVALID_PAYLOAD", message="Cannot move tasks to a closed sprint")
            new_sprint_id = target_sprint_id
        elif action == "new":
            if not new_sprint_name:
                raise AppError(400, code="INVALID_PAYLOAD", message="new_sprint_name is required when creating a sprint")
            length = sprint.end_date - sprint.start_date
            today = date.today()
            created = await self.repo.create(
                project_id=project_id,
                board_id=sprint.board_id,
                name=new_sprint_name,
                goal=None,
                start_date=today,
                end_date=today + length,
            )
            new_sprint_id = created.id
        elif action == "backlog":
            new_sprint_id = None
        else:
            raise AppError(400, code="INVALID_PAYLOAD", message="incomplete_action must be 'backlog', 'move', or 'new'")

        # Resolve completion via status category (custom modes) or fixed status (Flow).
        statuses = await self.status_repo.list_for_project(project_id)
        resolved_status_ids = {s.id for s in statuses if s.category in _RESOLVED_CATEGORIES}

        all_tasks = await self.task_repo.get_project_tasks_filtered(project_id, None)
        children_by_parent: dict[uuid.UUID, list] = {}
        for t in all_tasks:
            if t.parent_id is not None:
                children_by_parent.setdefault(t.parent_id, []).append(t)

        def is_resolved(t) -> bool:
            if t.custom_status_id is not None:
                return t.custom_status_id in resolved_status_ids
            status_value = getattr(t.status, "value", t.status)
            return status_value == TaskStatus.done.value

        def is_incomplete(t) -> bool:
            if not is_resolved(t):
                return True
            return any(not is_resolved(c) for c in children_by_parent.get(t.id, []))

        incomplete_ids = [t.id for t in all_tasks if t.sprint_id == sprint_id and is_incomplete(t)]
        if incomplete_ids:
            await self.task_repo.bulk_update(project_id, incomplete_ids, {"sprint_id": new_sprint_id})

        closed = await self.repo.close(sprint)
        return SprintResponse.model_validate(closed)

    async def delete_sprint(self, sprint_id: uuid.UUID, project_id: uuid.UUID) -> None:
        sprint = await self.repo.get(sprint_id)
        if not sprint or sprint.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Sprint not found")
        if sprint.status == "active":
            raise AppError(400, code="INVALID_PAYLOAD", message="Cannot delete an active sprint")
        await self.repo.delete(sprint)
