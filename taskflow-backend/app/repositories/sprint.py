import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.sprint import Sprint


class SprintRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, sprint_id: uuid.UUID) -> Sprint | None:
        result = await self.session.execute(select(Sprint).where(Sprint.id == sprint_id))
        return result.scalars().first()

    async def list_for_board(self, project_id: uuid.UUID, board_id: uuid.UUID) -> list[Sprint]:
        result = await self.session.execute(
            select(Sprint)
            .where(Sprint.project_id == project_id, Sprint.board_id == board_id)
            .order_by(Sprint.start_date.desc())
        )
        return list(result.scalars().all())

    async def list_closed_sprints(self, project_id: uuid.UUID) -> list[Sprint]:
        """Closed manual sprints (not auto cycles), oldest→newest — for velocity."""
        result = await self.session.execute(
            select(Sprint)
            .where(
                Sprint.project_id == project_id,
                Sprint.status == "closed",
                Sprint.auto_managed.is_(False),
            )
            .order_by(Sprint.start_date.asc())
        )
        return list(result.scalars().all())

    async def list_auto_cycles(self, project_id: uuid.UUID) -> list[Sprint]:
        """Flow-mode scheduler-managed cycles for a project (board_id NULL)."""
        result = await self.session.execute(
            select(Sprint)
            .where(Sprint.project_id == project_id, Sprint.auto_managed.is_(True))
            .order_by(Sprint.start_date.asc())
        )
        return list(result.scalars().all())

    async def create_cycle(self, project_id: uuid.UUID, name: str, start, end, status: str) -> Sprint:
        cycle = Sprint(
            project_id=project_id,
            board_id=None,
            name=name,
            goal=None,
            start_date=start,
            end_date=end,
            status=status,
            auto_managed=True,
        )
        self.session.add(cycle)
        await self.session.commit()
        await self.session.refresh(cycle)
        return cycle

    async def create(
        self,
        project_id: uuid.UUID,
        board_id: uuid.UUID,
        name: str,
        goal: str | None,
        start_date,
        end_date,
    ) -> Sprint:
        sprint = Sprint(
            project_id=project_id,
            board_id=board_id,
            name=name,
            goal=goal,
            start_date=start_date,
            end_date=end_date,
        )
        self.session.add(sprint)
        await self.session.commit()
        await self.session.refresh(sprint)
        return sprint

    async def update(self, sprint: Sprint, data: dict) -> Sprint:
        for key, value in data.items():
            setattr(sprint, key, value)
        await self.session.commit()
        await self.session.refresh(sprint)
        return sprint

    async def activate(self, sprint: Sprint) -> Sprint:
        sprint.status = "active"
        await self.session.commit()
        await self.session.refresh(sprint)
        return sprint

    async def close(self, sprint: Sprint) -> Sprint:
        sprint.status = "closed"
        await self.session.commit()
        await self.session.refresh(sprint)
        return sprint

    async def delete(self, sprint: Sprint) -> None:
        await self.session.delete(sprint)
        await self.session.commit()
