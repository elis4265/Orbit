"""Automation engine — matches rules (pure logic in automation.py) and applies
their actions to a task. Actions do NOT re-trigger the engine (loop-safe)."""
import uuid

from sqlalchemy import select

from app.models.comment import Comment
from app.models.project import Project
from app.models.task_tag import TaskTag
from app.repositories.automation_rule import AutomationRuleRepository
from app.services.automation import applicable_rules
from app.services.status_apply import apply_transition


def _uuid(v):
    try:
        return uuid.UUID(str(v)) if v else None
    except (ValueError, TypeError):
        return None


class AutomationService:
    def __init__(self, session):
        self.session = session

    async def run(self, project_id: uuid.UUID, event_type: str, task, actor_id, context: dict | None = None) -> int:
        """Apply all matching rules' actions to `task`. Returns rules applied.
        `context` supplies non-task facts (e.g. VCS `open_prs`) to conditions."""
        rules = [r for r in await AutomationRuleRepository(self.session).list_for_project(project_id) if r.enabled]
        if not rules:
            return 0
        # Flow mode runs no automation (mirrors custom fields / statuses).
        project = await self.session.get(Project, project_id)
        if project is None or project.mode == "open":
            return 0
        matched = applicable_rules(rules, event_type, task, context)
        if not matched:
            return 0
        for rule in matched:
            for action in (rule.actions or []):
                await self._apply(action, task, actor_id, project)
        await self.session.commit()
        return len(matched)

    async def _apply(self, action: dict, task, actor_id, project=None) -> None:
        atype = action.get("type")
        if atype == "assign":
            task.assignee_id = _uuid(action.get("assignee_id"))
        elif atype == "set_status":
            if project is not None:
                await apply_transition(self.session, task, project,
                                       category=action.get("category"), name=action.get("status"))
        elif atype == "set_priority":
            task.priority_id = _uuid(action.get("priority_id"))
        elif atype == "add_tag":
            tag_id = _uuid(action.get("tag_id"))
            if tag_id:
                exists = (await self.session.execute(
                    select(TaskTag).where(TaskTag.task_id == task.id, TaskTag.tag_id == tag_id)
                )).scalars().first()
                if not exists:
                    self.session.add(TaskTag(task_id=task.id, tag_id=tag_id, added_by=actor_id))
        elif atype == "comment":
            text = action.get("text")
            if text:
                self.session.add(Comment(task_id=task.id, author_id=actor_id, content=str(text)))
