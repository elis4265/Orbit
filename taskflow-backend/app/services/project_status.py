import uuid
from typing import Sequence

from app.core.errors import AppError
from app.models.project_status import ProjectStatus, ProjectTransitionRule, StatusCategory
from app.models.task import TaskStatus
from app.repositories.project_status import ProjectStatusRepository
from app.schemas.project_status import ProjectStatusCreate, ProjectStatusUpdate

_CATEGORY_TO_TASK_STATUS = {
    StatusCategory.unstarted: TaskStatus.todo,
    StatusCategory.started: TaskStatus.in_progress,
    StatusCategory.completed: TaskStatus.done,
    StatusCategory.cancelled: TaskStatus.done,
}

_DEFAULT_OPEN_STATUSES = [
    {"name": "To Do",       "color": "#6b7280", "category": "unstarted",  "position": 0, "is_default": True},
    {"name": "In Progress", "color": "#7c6af7", "category": "started",    "position": 1, "is_default": False},
    {"name": "Done",        "color": "#22c55e", "category": "completed",  "position": 2, "is_default": False},
]


class ProjectStatusService:
    def __init__(self, repo: ProjectStatusRepository):
        self.repo = repo

    async def seed_defaults(self, project_id: uuid.UUID) -> None:
        for s in _DEFAULT_OPEN_STATUSES:
            await self.repo.create({**s, "project_id": project_id})

    async def list_statuses(self, project_id: uuid.UUID) -> Sequence[ProjectStatus]:
        return await self.repo.list_for_project(project_id)

    async def create_status(
        self, project_id: uuid.UUID, data: ProjectStatusCreate
    ) -> ProjectStatus:
        existing = await self.repo.list_for_project(project_id)
        names_lower = {s.name.lower() for s in existing}
        if data.name.lower() in names_lower:
            raise AppError(409, "DUPLICATE_STATUS", f"A status named '{data.name}' already exists.")
        position = len(existing)
        row: dict = {
            "project_id": project_id,
            "name": data.name,
            "color": data.color,
            "category": data.category,
            "is_default": data.is_default,
            "position": position,
        }
        if data.issue_type is not None:
            row["issue_type"] = data.issue_type
        return await self.repo.create(row)

    async def update_status(
        self, project_id: uuid.UUID, status_id: uuid.UUID, data: ProjectStatusUpdate
    ) -> ProjectStatus:
        obj = await self.repo.get(status_id)
        if not obj or obj.project_id != project_id:
            raise AppError(404, "STATUS_NOT_FOUND", "Status not found.")
        if data.name is not None and data.name.lower() != obj.name.lower():
            existing = await self.repo.list_for_project(project_id)
            names_lower = {s.name.lower() for s in existing if s.id != status_id}
            if data.name.lower() in names_lower:
                raise AppError(409, "DUPLICATE_STATUS", f"A status named '{data.name}' already exists.")
        return await self.repo.update(obj, data.model_dump(exclude_unset=True))

    async def delete_status(self, project_id: uuid.UUID, status_id: uuid.UUID) -> None:
        existing = await self.repo.list_for_project(project_id)
        if len(existing) <= 1:
            raise AppError(400, "CANNOT_DELETE_LAST_STATUS", "A project must have at least one active status.")
        obj = await self.repo.get(status_id)
        if not obj or obj.project_id != project_id:
            raise AppError(404, "STATUS_NOT_FOUND", "Status not found.")
        await self.repo.delete(obj)

    async def reorder_statuses(
        self, project_id: uuid.UUID, ordered_ids: list[uuid.UUID]
    ) -> Sequence[ProjectStatus]:
        for pos, sid in enumerate(ordered_ids):
            obj = await self.repo.get(sid)
            if obj and obj.project_id == project_id:
                await self.repo.update(obj, {"position": pos})
        return await self.repo.list_for_project(project_id)

    # ── Transition rules ────────────────────────────────────────────────────────

    async def list_transitions(self, project_id: uuid.UUID) -> Sequence[ProjectTransitionRule]:
        return await self.repo.list_transitions(project_id)

    async def create_transition(
        self,
        project_id: uuid.UUID,
        from_status_id: uuid.UUID,
        to_status_id: uuid.UUID,
        require_role: str | None,
        issue_type=None,
    ) -> ProjectTransitionRule:
        from_obj = await self.repo.get(from_status_id)
        to_obj = await self.repo.get(to_status_id)
        if not from_obj or from_obj.project_id != project_id:
            raise AppError(404, "STATUS_NOT_FOUND", "From-status not found in this project.")
        if not to_obj or to_obj.project_id != project_id:
            raise AppError(404, "STATUS_NOT_FOUND", "To-status not found in this project.")
        existing = await self.repo.get_transition_by_pair(project_id, from_status_id, to_status_id, issue_type)
        if existing:
            raise AppError(409, "DUPLICATE_TRANSITION", "This transition rule already exists.")
        row: dict = {
            "project_id": project_id,
            "from_status_id": from_status_id,
            "to_status_id": to_status_id,
            "require_role": require_role,
        }
        if issue_type is not None:
            row["issue_type"] = issue_type
        return await self.repo.create_transition(row)

    async def delete_transition(self, project_id: uuid.UUID, rule_id: uuid.UUID) -> None:
        obj = await self.repo.get_transition(rule_id)
        if not obj or obj.project_id != project_id:
            raise AppError(404, "RULE_NOT_FOUND", "Transition rule not found.")
        await self.repo.delete_transition(obj)

    async def seed_enforced_transitions(self, project_id: uuid.UUID) -> None:
        """Seed a default linear workflow when switching to Enforced mode.

        Idempotent — no-ops if transition rules already exist.
        Creates consecutive pairs by position, plus re-open rules from every
        Completed status back to the first Started status.
        """
        existing = await self.repo.list_transitions(project_id)
        if existing:
            return
        statuses = await self.repo.list_for_project(project_id)
        if len(statuses) < 2:
            return
        for i in range(len(statuses) - 1):
            await self.repo.create_transition({
                "project_id": project_id,
                "from_status_id": statuses[i].id,
                "to_status_id": statuses[i + 1].id,
            })
        first_started = next(
            (s for s in statuses if s.category == StatusCategory.started), None
        )
        if first_started:
            for s in statuses:
                if s.category == StatusCategory.completed and s.id != first_started.id:
                    await self.repo.create_transition({
                        "project_id": project_id,
                        "from_status_id": s.id,
                        "to_status_id": first_started.id,
                    })

    def _initial_status(self, statuses: Sequence[ProjectStatus]) -> ProjectStatus | None:
        """The workflow's entry point: the default status, else the first
        unstarted-category status by position, else the first status."""
        if not statuses:
            return None
        return (
            next((s for s in statuses if s.is_default), None)
            or next((s for s in statuses if s.category == StatusCategory.unstarted), statuses[0])
        )

    async def validate_transition(
        self,
        project_id: uuid.UUID,
        mode: str,
        from_status_id: uuid.UUID | None,
        to_status_id: uuid.UUID,
        issue_type=None,
    ) -> None:
        """In Enforced mode, block transitions not explicitly allowed.

        Rules scoped to a specific issue_type apply only to that type.
        Global rules (issue_type=None) apply to all types.
        The union of both sets forms the allowed set.

        A task with no current custom status (created pre-switch, imported,
        moved in) is treated as sitting on the workflow's initial status —
        previously this case skipped validation entirely and any target was
        reachable (P0: teleport past every gate).
        """
        if mode != "enforced":
            return
        if from_status_id is None:
            statuses = await self.repo.list_for_project(project_id)
            initial = self._initial_status(statuses)
            if initial is None or initial.id == to_status_id:
                return  # entering the workflow at its entry point is always fine
            from_status_id = initial.id
        allowed = await self.repo.allowed_transitions_from(project_id, from_status_id, issue_type)
        if to_status_id not in allowed:
            raise AppError(
                409,
                "TRANSITION_NOT_ALLOWED",
                "This status transition is not permitted in Enforced mode.",
            )

    # ── Creation policy (Jira Create-transition model) ──────────────────────────

    async def apply_creation_policy(self, project, payload) -> None:
        """Mutates a TaskCreate in place per project.creation_status_policy.

        'any'     — Linear: create in whatever status the client sent.
        'initial' — Jira default: coerce to the workflow's initial status.
        'curated' — only statuses flagged allow_on_create are accepted;
                    no status requested → initial (or first allowed).
        """
        policy = getattr(project, "creation_status_policy", "any")
        if policy == "any":
            return
        statuses = await self.repo.list_for_project(project.id)
        if project.mode == "open" or not statuses:
            # Fixed 3-status board: both stricter policies mean "start in To Do".
            payload.status = TaskStatus.todo
            payload.custom_status_id = None
            return

        initial = self._initial_status(statuses)
        if policy == "initial":
            chosen = initial
        else:  # curated
            allowed = [s for s in statuses if s.allow_on_create]
            if payload.custom_status_id is None:
                chosen = initial if (not allowed or any(s.id == initial.id for s in allowed)) else allowed[0]
            else:
                chosen = next((s for s in allowed if s.id == payload.custom_status_id), None)
                if chosen is None:
                    raise AppError(
                        422,
                        "CREATION_STATUS_NOT_ALLOWED",
                        "Tasks cannot be created in this status. Choose an allowed creation status.",
                    )
        payload.custom_status_id = chosen.id
        payload.status = _CATEGORY_TO_TASK_STATUS.get(StatusCategory(chosen.category), TaskStatus.todo)
