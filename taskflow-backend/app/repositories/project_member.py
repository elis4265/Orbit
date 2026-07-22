import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

from sqlalchemy import select, func

from app.models.project_member import ProjectMember, MemberRole
from app.repositories.base import BaseRepository


class ProjectMemberRepository(BaseRepository[ProjectMember]):
    def __init__(self, session):
        super().__init__(ProjectMember, session)

    async def get_membership(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> Optional[ProjectMember]:
        result = await self.session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_members(self, project_id: uuid.UUID) -> Sequence[ProjectMember]:
        result = await self.session.execute(
            select(ProjectMember).where(ProjectMember.project_id == project_id)
        )
        return result.scalars().all()

    async def get_admin_count(self, project_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count()).where(
                ProjectMember.project_id == project_id,
                ProjectMember.role == MemberRole.admin,
            )
        )
        return result.scalar_one()

    async def add_member(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        role: MemberRole = MemberRole.member,
    ) -> ProjectMember:
        member = ProjectMember(
            project_id=project_id,
            user_id=user_id,
            role=role,
            joined_at=datetime.now(timezone.utc),
        )
        self.session.add(member)
        await self.session.commit()
        return member

    async def update_role(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: MemberRole
    ) -> ProjectMember:
        membership = await self.get_membership(project_id, user_id)
        membership.role = role
        await self.session.commit()
        await self.session.refresh(membership)
        return membership

    async def remove_member(self, project_id: uuid.UUID, user_id: uuid.UUID) -> None:
        membership = await self.get_membership(project_id, user_id)
        if membership:
            await self.session.delete(membership)
            await self.session.commit()
