import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.models.password_reset import PasswordReset
from app.repositories.base import BaseRepository


class PasswordResetRepository(BaseRepository[PasswordReset]):
    def __init__(self, session):
        super().__init__(PasswordReset, session)

    async def get_valid_code(self, user_id: uuid.UUID, code: str) -> PasswordReset | None:
        result = await self.session.execute(
            select(PasswordReset)
            .where(
                PasswordReset.user_id == user_id,
                PasswordReset.code == code,
                PasswordReset.used == False,  # noqa: E712
                PasswordReset.expires_at > datetime.now(timezone.utc),
            )
            .order_by(PasswordReset.created_at.desc())
        )
        return result.scalars().first()

    async def invalidate_all_for_user(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            update(PasswordReset)
            .where(PasswordReset.user_id == user_id)
            .values(used=True)
        )
