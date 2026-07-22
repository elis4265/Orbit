import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.models.email_verification import EmailVerification
from app.repositories.base import BaseRepository


class EmailVerificationRepository(BaseRepository[EmailVerification]):
    def __init__(self, session):
        super().__init__(EmailVerification, session)

    async def get_valid_code(self, user_id: uuid.UUID, code: str) -> EmailVerification | None:
        result = await self.session.execute(
            select(EmailVerification)
            .where(
                EmailVerification.user_id == user_id,
                EmailVerification.code == code,
                EmailVerification.used == False,  # noqa: E712
                EmailVerification.expires_at > datetime.now(timezone.utc),
            )
            .order_by(EmailVerification.created_at.desc())
        )
        return result.scalars().first()

    async def get_latest_by_user(self, user_id: uuid.UUID) -> EmailVerification | None:
        result = await self.session.execute(
            select(EmailVerification)
            .where(EmailVerification.user_id == user_id)
            .order_by(EmailVerification.created_at.desc())
        )
        return result.scalars().first()

    async def invalidate_all_for_user(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            update(EmailVerification)
            .where(EmailVerification.user_id == user_id)
            .values(used=True)
        )
