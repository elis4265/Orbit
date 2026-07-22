import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select

from app.models.project_invite import ProjectInvite
from app.repositories.base import BaseRepository


class ProjectInviteRepository(BaseRepository[ProjectInvite]):
    def __init__(self, session):
        super().__init__(ProjectInvite, session)

    async def get_by_token(self, token: uuid.UUID) -> Optional[ProjectInvite]:
        result = await self.session.execute(
            select(ProjectInvite).where(ProjectInvite.token == token)
        )
        return result.scalar_one_or_none()

    async def get_pending_for_email(
        self, project_id: uuid.UUID, email: str
    ) -> Optional[ProjectInvite]:
        now = datetime.now(timezone.utc)
        result = await self.session.execute(
            select(ProjectInvite).where(
                ProjectInvite.project_id == project_id,
                ProjectInvite.email == email,
                ProjectInvite.used.is_(False),
                ProjectInvite.expires_at > now,
            )
        )
        return result.scalar_one_or_none()

    async def mark_used(self, invite: ProjectInvite) -> ProjectInvite:
        invite.used = True
        await self.session.commit()
        return invite
