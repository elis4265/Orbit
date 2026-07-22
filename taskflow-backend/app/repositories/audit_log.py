import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


def _audit_set_filters(
    filters: list,
    actor_ids: list[uuid.UUID] | None,
    exclude_actor_ids: list[uuid.UUID] | None,
    actions: list[str] | None,
    exclude_actions: list[str] | None,
    entity_types: list[str] | None,
    entity_name_search: str | None,
) -> None:
    if actor_ids:
        filters.append(AuditLog.actor_id.in_(actor_ids))
    if exclude_actor_ids:
        filters.append(AuditLog.actor_id.notin_(exclude_actor_ids))
    if actions:
        filters.append(AuditLog.action.in_(actions))
    if exclude_actions:
        filters.append(AuditLog.action.notin_(exclude_actions))
    if entity_types:
        filters.append(AuditLog.entity_type.in_(entity_types))
    if entity_name_search:
        filters.append(AuditLog.entity_name.ilike(f"%{entity_name_search}%"))


def _audit_range_filters(
    filters: list,
    date_from: date | None,
    date_to: date | None,
    after_id: int | None,
    before_id: int | None,
) -> None:
    if date_from is not None:
        filters.append(AuditLog.created_at >= datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc))
    if date_to is not None:
        filters.append(AuditLog.created_at < datetime(date_to.year, date_to.month, date_to.day + 1, tzinfo=timezone.utc))
    if after_id is not None:
        filters.append(AuditLog.id > after_id)
    if before_id is not None:
        filters.append(AuditLog.id < before_id)


def _build_audit_filters(
    project_id: uuid.UUID,
    actor_ids: list[uuid.UUID] | None,
    exclude_actor_ids: list[uuid.UUID] | None,
    actions: list[str] | None,
    exclude_actions: list[str] | None,
    entity_types: list[str] | None,
    entity_name_search: str | None,
    date_from: date | None,
    date_to: date | None,
    after_id: int | None,
    before_id: int | None,
) -> list:
    filters: list = [AuditLog.project_id == project_id]
    _audit_set_filters(filters, actor_ids, exclude_actor_ids, actions, exclude_actions, entity_types, entity_name_search)
    _audit_range_filters(filters, date_from, date_to, after_id, before_id)
    return filters


class AuditLogRepository:
    def __init__(self, session: AsyncSession):
        self._session = session

    async def log(
        self,
        *,
        project_id: uuid.UUID,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
        action: str,
        entity_type: str,
        entity_id: str | None = None,
        entity_name: str | None = None,
        meta: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            project_id=project_id,
            actor_id=actor_id,
            actor_name=actor_name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            meta=meta,
            created_at=datetime.now(timezone.utc),
        )
        self._session.add(entry)
        await self._session.flush()
        return entry

    async def get_workspace_audit(
        self,
        project_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
        actor_ids: list[uuid.UUID] | None = None,
        exclude_actor_ids: list[uuid.UUID] | None = None,
        actions: list[str] | None = None,
        exclude_actions: list[str] | None = None,
        entity_types: list[str] | None = None,
        entity_name_search: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        after_id: int | None = None,
        before_id: int | None = None,
    ) -> tuple[list[AuditLog], int, int | None]:
        filters = _build_audit_filters(
            project_id, actor_ids, exclude_actor_ids, actions, exclude_actions,
            entity_types, entity_name_search, date_from, date_to, after_id, before_id,
        )

        total_result = await self._session.execute(
            select(func.count()).select_from(AuditLog).where(*filters)
        )
        total = total_result.scalar_one()

        items_result = await self._session.execute(
            select(AuditLog)
            .where(*filters)
            .order_by(desc(AuditLog.id))
            .limit(limit)
            .offset(offset)
        )
        items = list(items_result.scalars().all())

        next_cursor = items[-1].id if len(items) == limit else None

        return items, total, next_cursor
