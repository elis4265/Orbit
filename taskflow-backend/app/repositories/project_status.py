import uuid
from typing import Optional, Sequence

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_status import ProjectStatus, ProjectTransitionRule


class ProjectStatusRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_project(self, project_id: uuid.UUID) -> Sequence[ProjectStatus]:
        result = await self.session.execute(
            select(ProjectStatus)
            .where(ProjectStatus.project_id == project_id)
            .where(ProjectStatus.is_active == True)  # noqa: E712
            .order_by(ProjectStatus.position)
        )
        return result.scalars().all()

    async def get(self, status_id: uuid.UUID) -> Optional[ProjectStatus]:
        return await self.session.get(ProjectStatus, status_id)

    async def create(self, data: dict) -> ProjectStatus:
        obj = ProjectStatus(**data)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def update(self, obj: ProjectStatus, data: dict) -> ProjectStatus:
        for k, v in data.items():
            setattr(obj, k, v)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete(self, obj: ProjectStatus) -> None:
        await self.session.delete(obj)
        await self.session.flush()

    # ── Transition rules ────────────────────────────────────────────────────────

    async def list_transitions(self, project_id: uuid.UUID) -> Sequence[ProjectTransitionRule]:
        result = await self.session.execute(
            select(ProjectTransitionRule)
            .where(ProjectTransitionRule.project_id == project_id)
            .where(ProjectTransitionRule.is_active == True)  # noqa: E712
        )
        return result.scalars().all()

    async def get_transition(self, rule_id: uuid.UUID) -> Optional[ProjectTransitionRule]:
        return await self.session.get(ProjectTransitionRule, rule_id)

    async def get_transition_by_pair(
        self,
        project_id: uuid.UUID,
        from_status_id: uuid.UUID,
        to_status_id: uuid.UUID,
        issue_type=None,
    ) -> Optional[ProjectTransitionRule]:
        q = (
            select(ProjectTransitionRule)
            .where(ProjectTransitionRule.project_id == project_id)
            .where(ProjectTransitionRule.from_status_id == from_status_id)
            .where(ProjectTransitionRule.to_status_id == to_status_id)
            .where(ProjectTransitionRule.is_active == True)  # noqa: E712
        )
        if issue_type is not None:
            q = q.where(ProjectTransitionRule.issue_type == issue_type)
        else:
            q = q.where(ProjectTransitionRule.issue_type.is_(None))
        result = await self.session.execute(q)
        return result.scalars().first()

    async def create_transition(self, data: dict) -> ProjectTransitionRule:
        obj = ProjectTransitionRule(**data)
        self.session.add(obj)
        await self.session.flush()
        await self.session.refresh(obj)
        return obj

    async def delete_transition(self, obj: ProjectTransitionRule) -> None:
        await self.session.delete(obj)
        await self.session.flush()

    async def allowed_transitions_from(
        self,
        project_id: uuid.UUID,
        from_status_id: uuid.UUID,
        issue_type=None,
    ) -> list[uuid.UUID]:
        """Returns allowed to_status_id values.

        When issue_type is provided, returns global rules (issue_type IS NULL)
        UNION type-specific rules — so global rules always apply as a fallback.
        """
        q = (
            select(ProjectTransitionRule.to_status_id)
            .where(ProjectTransitionRule.project_id == project_id)
            .where(ProjectTransitionRule.from_status_id == from_status_id)
            .where(ProjectTransitionRule.is_active == True)  # noqa: E712
        )
        if issue_type is not None:
            q = q.where(
                or_(
                    ProjectTransitionRule.issue_type.is_(None),
                    ProjectTransitionRule.issue_type == issue_type,
                )
            )
        result = await self.session.execute(q)
        return list(result.scalars().all())
