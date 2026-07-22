from typing import Sequence
import uuid
from sqlalchemy import select, union_all
from app.models.project import Project
from app.models.project_member import ProjectMember
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    def __init__(self, session):
        super().__init__(Project, session)

    async def get_by_owner(self, owner_id: uuid.UUID) -> Sequence[Project]:
        result = await self.session.execute(
            select(Project).where(Project.owner_id == owner_id)
        )
        return result.scalars().all()

    async def get_accessible(self, user_id: uuid.UUID) -> Sequence[Project]:
        owned = select(Project.id).where(Project.owner_id == user_id)
        joined = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
        ids_q = union_all(owned, joined).subquery()
        result = await self.session.execute(
            select(Project).where(Project.id.in_(select(ids_q)))
        )
        return result.scalars().all()
