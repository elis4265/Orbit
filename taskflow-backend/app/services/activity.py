import re
import uuid
from datetime import date

from app.repositories.activity import ActivityRepository


def _strip_html(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()[:150]


class ActivityService:
    def __init__(self, repo: ActivityRepository):
        self._repo = repo

    # ── Internal helper ────────────────────────────────────────────────────────

    async def _log(self, task_id: uuid.UUID, task_title: str, project_id: uuid.UUID,
                   actor_id: uuid.UUID | None, actor_name: str | None, action: str, **kwargs):
        await self._repo.log(
            entity_type="task",
            entity_id=task_id,
            entity_name=task_title,
            project_id=project_id,
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            **kwargs,
        )

    # ── Log methods (public signatures unchanged for router callers) ───────────

    async def log_task_created(self, task_id, task_title, project_id, actor_id, actor_name):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "task_created")

    async def log_status_changed(self, task_id, task_title, project_id, actor_id, actor_name,
                                  old_status, new_status):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "status_changed",
                        field="status", old_value=old_status, new_value=new_status)

    async def log_priority_changed(self, task_id, task_title, project_id, actor_id, actor_name,
                                    old_priority, new_priority):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "priority_changed",
                        field="priority", old_value=str(old_priority) if old_priority else None, new_value=str(new_priority) if new_priority else None)

    async def log_assignee_changed(self, task_id, task_title, project_id, actor_id, actor_name,
                                    old_assignee_name, new_assignee_name):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "assignee_changed",
                        field="assignee", old_value=old_assignee_name, new_value=new_assignee_name)

    async def log_due_date_changed(self, task_id, task_title, project_id, actor_id, actor_name,
                                    old_due_date, new_due_date):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "due_date_changed",
                        field="due_date", old_value=old_due_date, new_value=new_due_date)

    async def log_title_changed(self, task_id, task_title, project_id, actor_id, actor_name,
                                 old_title, new_title):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "title_changed",
                        field="title", old_value=old_title, new_value=new_title)

    async def log_comment_added(self, task_id, task_title, project_id, actor_id, actor_name, comment_html):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "comment_added",
                        meta={"snippet": _strip_html(comment_html)})

    async def log_comment_edited(self, task_id, task_title, project_id, actor_id, actor_name, comment_html):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "comment_edited",
                        meta={"snippet": _strip_html(comment_html)})

    async def log_comment_deleted(self, task_id, task_title, project_id, actor_id, actor_name):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "comment_deleted")

    async def log_attachment_added(self, task_id, task_title, project_id, actor_id, actor_name,
                                    filename: str, size_bytes: int):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "attachment_added",
                        meta={"filename": filename, "size_bytes": size_bytes})

    async def log_attachment_deleted(self, task_id, task_title, project_id, actor_id, actor_name, filename: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "attachment_deleted",
                        meta={"filename": filename})

    async def log_tag_applied(self, task_id, task_title, project_id, actor_id, actor_name,
                               tag_name: str, tag_color: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "tag_applied",
                        meta={"tag_name": tag_name, "tag_color": tag_color})

    async def log_tag_removed(self, task_id, task_title, project_id, actor_id, actor_name,
                               tag_name: str, tag_color: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "tag_removed",
                        meta={"tag_name": tag_name, "tag_color": tag_color})

    async def log_subtask_added(self, task_id, task_title, project_id, actor_id, actor_name, subtask_title: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "subtask_added",
                        meta={"title": subtask_title})

    async def log_subtask_toggled(self, task_id, task_title, project_id, actor_id, actor_name,
                                   subtask_title: str, is_completed: bool):
        action = "subtask_completed" if is_completed else "subtask_uncompleted"
        await self._log(task_id, task_title, project_id, actor_id, actor_name, action,
                        meta={"title": subtask_title})

    async def log_subtask_deleted(self, task_id, task_title, project_id, actor_id, actor_name, subtask_title: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "subtask_deleted",
                        meta={"title": subtask_title})

    # REQ-164: promotion is not a deletion — parent and child each get an explicit entry.
    async def log_subtask_promoted(self, task_id, task_title, project_id, actor_id, actor_name, subtask_title: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "subtask_promoted",
                        meta={"title": subtask_title})

    async def log_task_promoted(self, task_id, task_title, project_id, actor_id, actor_name, parent_title: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "task_promoted",
                        meta={"title": parent_title})

    async def log_link_added(self, task_id, task_title, project_id, actor_id, actor_name,
                              display_type: str, linked_task_title: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "link_added",
                        meta={"display_type": display_type, "linked_task": linked_task_title})

    async def log_link_removed(self, task_id, task_title, project_id, actor_id, actor_name,
                                display_type: str, linked_task_title: str):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "link_removed",
                        meta={"display_type": display_type, "linked_task": linked_task_title})

    async def log_task_deleted(self, task_id, task_title, project_id, actor_id, actor_name):
        await self._log(task_id, task_title, project_id, actor_id, actor_name, "task_deleted")

    # ── Query methods ──────────────────────────────────────────────────────────

    async def get_for_entity(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        limit: int = 100,
        offset: int = 0,
        actions: list[str] | None = None,
    ) -> list:
        return await self._repo.get_for_entity(
            entity_type, entity_id, limit=limit, offset=offset, actions=actions
        )

    async def get_workspace_activity(
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
        return await self._repo.get_workspace_activity(
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

    # Backwards-compatible alias used by existing router call sites
    async def get_task_activity(self, task_id: uuid.UUID, limit: int = 100, offset: int = 0) -> list:
        return await self.get_for_entity("task", task_id, limit=limit, offset=offset)
