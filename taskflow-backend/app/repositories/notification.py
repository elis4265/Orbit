import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, update, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType


class NotificationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        notification_type: NotificationType,
        payload: dict,
        task_id: uuid.UUID | None = None,
    ) -> Notification:
        notif = Notification(
            user_id=user_id,
            project_id=project_id,
            task_id=task_id,
            type=notification_type,
            payload=payload,
        )
        self.session.add(notif)
        await self.session.flush()
        return notif

    async def get_for_user(
        self, user_id: uuid.UUID, unread_only: bool = False, limit: int = 50
    ) -> list[Notification]:
        q = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
        if unread_only:
            q = q.where(Notification.read == False)  # noqa: E712
        result = await self.session.execute(q)
        return list(result.scalars().all())

    async def count_unread(self, user_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.read == False,  # noqa: E712
            )
        )
        return len(result.scalars().all())

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            update(Notification)
            .where(Notification.id == notification_id, Notification.user_id == user_id)
            .values(read=True)
        )
        await self.session.commit()
        return result.rowcount > 0

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.read == False)  # noqa: E712
            .values(read=True)
        )
        await self.session.commit()

    async def delete_one(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        result = await self.session.execute(
            delete(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        await self.session.commit()
        return result.rowcount > 0

    async def delete_all(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(Notification).where(Notification.user_id == user_id)
        )
        await self.session.commit()

    async def due_date_already_notified(
        self, task_id: uuid.UUID, user_id: uuid.UUID, within_hours: int = 25
    ) -> bool:
        """Returns True if a due_date_approaching notification was already sent within the window."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=within_hours)
        result = await self.session.execute(
            select(Notification).where(
                and_(
                    Notification.task_id == task_id,
                    Notification.user_id == user_id,
                    Notification.type == NotificationType.due_date_approaching,
                    Notification.created_at >= cutoff,
                )
            )
        )
        return result.scalars().first() is not None
