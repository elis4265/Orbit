import uuid
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification_preferences import NotificationPreferences


_DEFAULTS = dict(
    on_comment=True,
    on_mention=True,
    on_status_change=True,
    on_assignee_change=True,
    on_priority_change=True,
    on_due_date_approaching=True,
    on_task_deleted=True,
    due_date_reminder_hours=24,
    email_enabled=False,
)


class NotificationPreferencesRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_or_default(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> NotificationPreferences:
        result = await self.session.execute(
            select(NotificationPreferences).where(
                NotificationPreferences.user_id == user_id,
                NotificationPreferences.project_id == project_id,
            )
        )
        prefs = result.scalars().first()
        if prefs is None:
            prefs = NotificationPreferences(
                user_id=user_id, project_id=project_id, **_DEFAULTS
            )
        return prefs

    async def upsert(
        self, user_id: uuid.UUID, project_id: uuid.UUID, data: dict
    ) -> NotificationPreferences:
        stmt = (
            insert(NotificationPreferences)
            .values(user_id=user_id, project_id=project_id, **data)
            .on_conflict_do_update(
                index_elements=["user_id", "project_id"],
                set_=data,
            )
            .returning(NotificationPreferences)
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalars().first()

    async def get_for_users(
        self, user_ids: list[uuid.UUID], project_id: uuid.UUID
    ) -> dict[uuid.UUID, NotificationPreferences]:
        if not user_ids:
            return {}
        result = await self.session.execute(
            select(NotificationPreferences).where(
                NotificationPreferences.user_id.in_(user_ids),
                NotificationPreferences.project_id == project_id,
            )
        )
        rows = result.scalars().all()
        found = {r.user_id: r for r in rows}
        # fill defaults for users with no row
        for uid in user_ids:
            if uid not in found:
                found[uid] = NotificationPreferences(
                    user_id=uid, project_id=project_id, **_DEFAULTS
                )
        return found
