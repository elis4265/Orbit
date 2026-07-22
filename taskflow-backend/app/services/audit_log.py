import uuid
from datetime import date

from app.repositories.audit_log import AuditLogRepository


class AuditLogService:
    def __init__(self, repo: AuditLogRepository):
        self._repo = repo

    async def _log(
        self,
        project_id: uuid.UUID,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
        action: str,
        entity_type: str,
        entity_id: str | None = None,
        entity_name: str | None = None,
        meta: dict | None = None,
    ) -> None:
        await self._repo.log(
            project_id=project_id,
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            meta=meta,
        )

    # ── Workspace events ───────────────────────────────────────────────────────

    async def log_workspace_created(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str, workspace_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "workspace.created",
                        "workspace", str(project_id), workspace_name)

    async def log_workspace_renamed(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str,
        old_name: str, new_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "workspace.renamed",
                        "workspace", str(project_id), new_name,
                        meta={"old_name": old_name, "new_name": new_name})

    async def log_workspace_deleted(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str, workspace_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "workspace.deleted",
                        "workspace", str(project_id), workspace_name)

    # ── Board events ───────────────────────────────────────────────────────────

    async def log_board_created(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str,
        board_id: uuid.UUID, board_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "board.created",
                        "board", str(board_id), board_name)

    async def log_board_renamed(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str,
        board_id: uuid.UUID, old_name: str, new_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "board.renamed",
                        "board", str(board_id), new_name,
                        meta={"old_name": old_name, "new_name": new_name})

    async def log_board_deleted(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str,
        board_id: uuid.UUID, board_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "board.deleted",
                        "board", str(board_id), board_name)

    # ── Member events ──────────────────────────────────────────────────────────

    async def log_member_invited(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str, email: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "member.invited",
                        "member", None, email, meta={"email": email})

    async def log_member_joined(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "member.joined",
                        "member", str(actor_id), actor_name)

    async def log_member_removed(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str,
        removed_user_id: uuid.UUID, removed_user_name: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "member.removed",
                        "member", str(removed_user_id), removed_user_name)

    async def log_member_role_changed(
        self, project_id: uuid.UUID, actor_id: uuid.UUID, actor_name: str,
        target_user_id: uuid.UUID, target_user_name: str, old_role: str, new_role: str
    ) -> None:
        await self._log(project_id, actor_id, actor_name, "member.role_changed",
                        "member", str(target_user_id), target_user_name,
                        meta={"old_role": old_role, "new_role": new_role})

    # ── Query ──────────────────────────────────────────────────────────────────

    async def get_workspace_audit(
        self,
        project_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
        actor_ids: list[uuid.UUID] | None = None,
        exclude_actor_ids: list[uuid.UUID] | None = None,
        actions: list[str] | None = None,
        exclude_actions: list[str] | None = None,
        entity_types: list[str] | None = None,
        entity_name_search: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        after_id: int | None = None,
        before_id: int | None = None,
    ) -> tuple[list, int, int | None]:
        return await self._repo.get_workspace_audit(
            project_id,
            limit=limit,
            offset=offset,
            actor_ids=actor_ids,
            exclude_actor_ids=exclude_actor_ids,
            actions=actions,
            exclude_actions=exclude_actions,
            entity_types=entity_types,
            entity_name_search=entity_name_search,
            date_from=date_from,
            date_to=date_to,
            after_id=after_id,
            before_id=before_id,
        )
