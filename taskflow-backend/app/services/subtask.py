import uuid
from typing import Optional
from app.models.task import Task, TaskStatus
from app.repositories.task import TaskRepository


class SubtaskService:
    def __init__(self, task_repo: TaskRepository):
        self.task_repo = task_repo

    async def create_subtask(
        self,
        task_id: uuid.UUID,
        project_id: uuid.UUID,
        title: str,
        created_by: uuid.UUID | None = None,
    ) -> Task:
        return await self.task_repo.create_with_sequence(project_id, {
            "parent_id": task_id,
            "project_id": project_id,
            "title": title,
            "status": TaskStatus.todo,
            "created_by": created_by,
        })

    async def toggle_complete(self, subtask_id: uuid.UUID) -> Optional[Task]:
        child = await self.task_repo.get(subtask_id)
        if not child:
            return None
        new_status = TaskStatus.done if child.status != TaskStatus.done else TaskStatus.todo
        return await self.task_repo.update(child, {"status": new_status})

    async def delete_subtask(self, subtask_id: uuid.UUID) -> bool:
        child = await self.task_repo.get(subtask_id)
        if not child:
            return False
        await self.task_repo.delete(child)
        return True

    async def promote_subtask(
        self, subtask_id: uuid.UUID, parent_id: uuid.UUID, actor_id: uuid.UUID
    ) -> Optional[Task]:
        """REQ-164: detach a child into a standalone task; keep a relates_to
        link to the old parent. The child keeps id/key/status/completed_at."""
        from app.models.task_link import TaskLink

        child = await self.task_repo.get(subtask_id)
        if not child or child.parent_id != parent_id:
            return None
        child.parent_id = None
        self.task_repo.session.add(TaskLink(
            source_id=child.id, target_id=parent_id,
            link_type="relates_to", created_by=actor_id,
        ))
        await self.task_repo.session.commit()
        await self.task_repo.session.refresh(child)
        return child
