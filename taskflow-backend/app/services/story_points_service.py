"""Story-Points reporting service — loads data, delegates math to story_points.py."""
import uuid

from app.core.errors import AppError
from app.models.task import TaskStatus
from app.services.story_points import sprint_report, velocity_series

_RESOLVED_CATEGORIES = {"completed", "cancelled"}


class StoryPointsService:
    def __init__(self, sprint_repo, task_repo, status_repo):
        self.sprint_repo = sprint_repo
        self.task_repo = task_repo
        self.status_repo = status_repo

    async def _resolver(self, project_id: uuid.UUID):
        statuses = await self.status_repo.list_for_project(project_id)
        resolved_ids = {s.id for s in statuses if s.category in _RESOLVED_CATEGORIES}

        def is_resolved(t) -> bool:
            if t.custom_status_id is not None:
                return t.custom_status_id in resolved_ids
            return getattr(t.status, "value", t.status) == TaskStatus.done.value

        return is_resolved

    async def velocity(self, project_id: uuid.UUID, window: int = 3) -> dict:
        sprints = await self.sprint_repo.list_closed_sprints(project_id)
        is_resolved = await self._resolver(project_id)
        tasks_by_sprint = {
            s.id: await self.task_repo.get_project_tasks_filtered(project_id, s.id)
            for s in sprints
        }
        return velocity_series(sprints, tasks_by_sprint, is_resolved, window)

    async def sprint_report(self, project_id: uuid.UUID, sprint_id: uuid.UUID) -> dict:
        sprint = await self.sprint_repo.get(sprint_id)
        if not sprint or sprint.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Sprint not found")
        is_resolved = await self._resolver(project_id)
        tasks = await self.task_repo.get_project_tasks_filtered(project_id, sprint_id)
        return sprint_report(sprint, tasks, is_resolved)
