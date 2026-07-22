import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cycle_config import CycleConfig


class CycleConfigRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, project_id: uuid.UUID) -> CycleConfig | None:
        result = await self.session.execute(
            select(CycleConfig).where(CycleConfig.project_id == project_id)
        )
        return result.scalars().first()

    async def upsert(self, project_id: uuid.UUID, data: dict) -> CycleConfig:
        cfg = await self.get(project_id)
        if cfg is None:
            cfg = CycleConfig(project_id=project_id, **data)
            self.session.add(cfg)
        else:
            for key, value in data.items():
                setattr(cfg, key, value)
        await self.session.commit()
        await self.session.refresh(cfg)
        return cfg
