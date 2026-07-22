from uuid import UUID

from sqlalchemy import select

from app.models.comment import Comment, CommentHistory
from app.repositories.base import BaseRepository


class CommentRepository(BaseRepository[Comment]):
    def __init__(self, session):
        super().__init__(Comment, session)

    async def get_task_comments(self, task_id: UUID) -> list[Comment]:
        result = await self.session.execute(
            select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at)
        )
        return list(result.scalars().all())


class CommentHistoryRepository(BaseRepository[CommentHistory]):
    def __init__(self, session):
        super().__init__(CommentHistory, session)

    async def get_comment_history(self, comment_id: UUID) -> list[CommentHistory]:
        result = await self.session.execute(
            select(CommentHistory)
            .where(CommentHistory.comment_id == comment_id)
            .order_by(CommentHistory.edited_at.desc())
        )
        return list(result.scalars().all())
