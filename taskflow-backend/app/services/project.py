import uuid
from typing import Sequence
from app.core.errors import AppError
from app.models.project import Project
from app.repositories.project import ProjectRepository
from app.services.project_key import generate_project_key

MAX_PROJECTS_PER_USER = 5

DEFAULT_ASSIGNEE_MODES = ("unassigned", "creator", "member")


class ProjectLimitReachedException(Exception):
    pass


class ProjectService:
    def __init__(self, project_repo: ProjectRepository, status_service=None, priority_service=None,
                 member_repo=None):
        self.project_repo = project_repo
        self._status_service = status_service
        self._priority_service = priority_service
        # HW-18: needed to validate that a default assignee is actually a member.
        self._member_repo = member_repo

    async def get_user_projects(self, user_id: uuid.UUID) -> Sequence[Project]:
        return await self.project_repo.get_accessible(user_id)

    async def create_project(self, name: str, owner_id: uuid.UUID, mode: str = "open") -> Project:
        existing = await self.project_repo.get_by_owner(owner_id)
        if len(existing) >= MAX_PROJECTS_PER_USER:
            raise ProjectLimitReachedException(
                f"User has reached the maximum threshold of {MAX_PROJECTS_PER_USER} projects."
            )
        project = await self.project_repo.create({
            "name": name,
            "owner_id": owner_id,
            "key": generate_project_key(name),
            "next_sequence": 1,
            "mode": mode,
            # Enforced's promise starts at birth: Jira-style forced initial status.
            "creation_status_policy": "initial" if mode == "enforced" else "any",
            # REQ-145: sentiment-faithful default for new projects; existing keep theirs.
            "hide_done_after_days": 14,
        })
        if self._status_service is not None:
            await self._status_service.seed_defaults(project.id)
            if mode == "enforced":
                await self._status_service.seed_enforced_transitions(project.id)
        if self._priority_service is not None:
            await self._priority_service.init_project_scheme(project)
        return project

    async def rename_project(self, project: Project, name: str) -> Project:
        return await self.project_repo.update(project, {"name": name})

    async def update_hide_done_after_days(self, project: Project, days: int | None) -> Project:
        return await self.project_repo.update(project, {"hide_done_after_days": days})

    async def set_default_assignee(
        self,
        project: Project,
        mode: str | None,
        assignee_id: uuid.UUID | None,
        assignee_id_provided: bool,
    ) -> Project:
        """HW-18: configure the project's default assignee for newly created tasks.

        Normalisation (consistent invariant: default_assignee_id is non-NULL *only*
        when mode == 'member'):
          - mode 'unassigned' / 'creator' → default_assignee_id is force-cleared to
            NULL, even if the caller also sent an id. An id without mode='member' is
            meaningless, so it is dropped rather than rejected.
          - mode 'member' → requires an effective default_assignee_id (the one in this
            payload, else the one already stored). Missing → 422. Not a member/owner
            of this project → 422.
          - mode omitted → the project's current mode is the effective mode, so
            sending only an id re-points an existing 'member' configuration (and is
            still membership-checked) but cannot silently activate it.
        """
        effective_mode = mode if mode is not None else project.default_assignee_mode
        if effective_mode not in DEFAULT_ASSIGNEE_MODES:
            raise AppError(
                422,
                "INVALID_DEFAULT_ASSIGNEE_MODE",
                f"default_assignee_mode must be one of: {', '.join(DEFAULT_ASSIGNEE_MODES)}.",
            )

        if effective_mode != "member":
            return await self.project_repo.update(
                project,
                {"default_assignee_mode": effective_mode, "default_assignee_id": None},
            )

        effective_id = assignee_id if assignee_id_provided else project.default_assignee_id
        if effective_id is None:
            raise AppError(
                422,
                "DEFAULT_ASSIGNEE_REQUIRED",
                "default_assignee_id is required when default_assignee_mode is 'member'.",
            )
        if not await self._is_project_member(project, effective_id):
            raise AppError(
                422,
                "DEFAULT_ASSIGNEE_NOT_MEMBER",
                "The default assignee must be a member of this project.",
            )
        return await self.project_repo.update(
            project,
            {"default_assignee_mode": "member", "default_assignee_id": effective_id},
        )

    async def _is_project_member(self, project: Project, user_id: uuid.UUID) -> bool:
        """Owner counts as a member without a project_members row (RBAC convention)."""
        if user_id == project.owner_id:
            return True
        if self._member_repo is None:
            return False
        return await self._member_repo.get_membership(project.id, user_id) is not None

    async def clear_default_assignee_for_user(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Called when a user loses membership: a default assignee who is no longer a
        member would point tasks at an outsider, so reset the setting to 'unassigned'.
        ON DELETE SET NULL only covers user *deletion*, not membership removal."""
        project = await self.project_repo.get(project_id)
        if project is None or project.default_assignee_id != user_id:
            return
        await self.project_repo.update(
            project,
            {"default_assignee_mode": "unassigned", "default_assignee_id": None},
        )

    async def delete_project(self, project: Project) -> None:
        await self.project_repo.delete(project)
