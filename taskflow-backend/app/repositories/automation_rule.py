import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_rule import AutomationRule


class AutomationRuleRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_project(self, project_id: uuid.UUID) -> list[AutomationRule]:
        result = await self.session.execute(
            select(AutomationRule)
            .where(AutomationRule.project_id == project_id)
            .order_by(AutomationRule.position.asc(), AutomationRule.name.asc())
        )
        return list(result.scalars().all())

    async def get(self, rule_id: uuid.UUID) -> AutomationRule | None:
        result = await self.session.execute(select(AutomationRule).where(AutomationRule.id == rule_id))
        return result.scalars().first()

    async def create(self, project_id: uuid.UUID, data: dict) -> AutomationRule:
        rule = AutomationRule(project_id=project_id, **data)
        self.session.add(rule)
        await self.session.commit()
        await self.session.refresh(rule)
        return rule

    async def update(self, rule: AutomationRule, data: dict) -> AutomationRule:
        for k, v in data.items():
            setattr(rule, k, v)
        await self.session.commit()
        await self.session.refresh(rule)
        return rule

    async def delete(self, rule: AutomationRule) -> None:
        await self.session.delete(rule)
        await self.session.commit()
