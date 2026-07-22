import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status

from app.models.comment import Comment, CommentHistory
from app.models.user import User
from app.repositories.comment import CommentRepository, CommentHistoryRepository


class CommentService:
    def __init__(self, repo: CommentRepository, history_repo: CommentHistoryRepository) -> None:
        self.repo = repo
        self.history_repo = history_repo

    async def list_comments(self, task_id: uuid.UUID) -> list[Comment]:
        return await self.repo.get_task_comments(task_id)

    async def create_comment(self, task_id: uuid.UUID, author: User, content: str) -> Comment:
        return await self.repo.create({
            "task_id": task_id,
            "author_id": author.id,
            "content": content,
        })

    async def edit_comment(self, comment_id: uuid.UUID, editor: User, content: str) -> Comment:
        comment = await self.repo.get(comment_id)
        if not comment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")
        if comment.author_id != editor.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author can edit this comment.")

        await self.history_repo.create({
            "comment_id": comment.id,
            "content": comment.content,
            "edited_by": editor.id,
            "edited_at": datetime.now(timezone.utc),
        })

        return await self.repo.update(comment, {
            "content": content,
            "edited_at": datetime.now(timezone.utc),
        })

    async def delete_comment(
        self,
        comment_id: uuid.UUID,
        actor: User,
        workspace_owner_id: uuid.UUID,
        is_admin: bool,
    ) -> None:
        comment = await self.repo.get(comment_id)
        if not comment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")

        is_author = comment.author_id == actor.id
        is_workspace_admin = is_admin or actor.id == workspace_owner_id
        if not is_author and not is_workspace_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the author or an admin can delete this comment.")

        await self.repo.delete(comment)

    async def get_history(self, comment_id: uuid.UUID) -> list[CommentHistory]:
        comment = await self.repo.get(comment_id)
        if not comment:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found.")
        return await self.history_repo.get_comment_history(comment_id)
