from uuid import UUID

from sqlalchemy import select

from app.models.attachment import Attachment
from app.repositories.base import BaseRepository


class AttachmentRepository(BaseRepository[Attachment]):
    def __init__(self, session):
        super().__init__(Attachment, session)

    async def get_task_attachments(self, task_id: UUID) -> list[Attachment]:
        result = await self.session.execute(
            select(Attachment)
            .where(Attachment.task_id == task_id)
            .order_by(Attachment.created_at)
        )
        return list(result.scalars().all())

    async def get_comment_attachments(self, comment_id: UUID) -> list[Attachment]:
        result = await self.session.execute(
            select(Attachment)
            .where(Attachment.comment_id == comment_id)
            .order_by(Attachment.created_at)
        )
        return list(result.scalars().all())
