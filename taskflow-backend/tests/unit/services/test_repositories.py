"""Unit tests for activity + audit_log repositories (filter branches)."""
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.repositories.activity import ActivityRepository
from app.repositories.audit_log import AuditLogRepository


# ── helpers ───────────────────────────────────────────────────────────────────

def _mock_session(rows=None, count=0):
    """Return a mocked AsyncSession with predictable execute() results."""
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    items = rows or []

    # First execute call → count query; second → items query
    count_result = MagicMock()
    count_result.scalar_one.return_value = count

    items_result = MagicMock()
    items_result.scalars.return_value.all.return_value = items

    session.execute = AsyncMock(side_effect=[count_result, items_result])
    return session


# ── ActivityRepository ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_activity_log_creates_entry():
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    repo = ActivityRepository(session)

    entry = await repo.log(
        entity_type="task",
        entity_id=uuid.uuid4(),
        entity_name="Fix bug",
        project_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
        actor_name="alice",
        action="status_changed",
        field="status",
        old_value="todo",
        new_value="in_progress",
    )

    session.add.assert_called_once()
    session.flush.assert_awaited_once()
    assert entry.action == "status_changed"
    assert entry.entity_type == "task"


@pytest.mark.asyncio
async def test_activity_log_nullable_fields():
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    repo = ActivityRepository(session)

    entry = await repo.log(
        entity_type="task",
        entity_id=None,
        entity_name=None,
        project_id=uuid.uuid4(),
        actor_id=None,
        actor_name=None,
        action="task_deleted",
    )
    assert entry.actor_id is None
    assert entry.entity_id is None


@pytest.mark.asyncio
async def test_activity_get_for_entity_no_filters():
    fake_item = MagicMock()
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[fake_item])))
    ))
    repo = ActivityRepository(session)

    result = await repo.get_for_entity("task", uuid.uuid4(), limit=10)
    assert result == [fake_item]


@pytest.mark.asyncio
async def test_activity_get_for_entity_with_actions_filter():
    session = MagicMock()
    session.execute = AsyncMock(return_value=MagicMock(
        scalars=MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
    ))
    repo = ActivityRepository(session)

    result = await repo.get_for_entity("task", uuid.uuid4(), actions=["status_changed"])
    assert result == []
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_activity_get_workspace_no_cursor():
    session = _mock_session(rows=[], count=0)
    repo = ActivityRepository(session)

    items, total, cursor = await repo.get_workspace_activity(uuid.uuid4(), limit=10)
    assert items == []
    assert total == 0
    assert cursor is None


@pytest.mark.asyncio
async def test_activity_get_workspace_with_all_filters():
    ws = uuid.uuid4()
    actor = uuid.uuid4()
    session = _mock_session(rows=[], count=0)
    repo = ActivityRepository(session)

    items, total, cursor = await repo.get_workspace_activity(
        ws,
        actor_ids=[actor],
        exclude_actor_ids=[uuid.uuid4()],
        actions=["status_changed"],
        exclude_actions=["task_deleted"],
        entity_types=["task"],
        entity_name_search="bug",
        date_from=date(2026, 1, 1),
        date_to=date(2026, 6, 14),
        after_id=5,
        before_id=100,
    )
    assert items == []


@pytest.mark.asyncio
async def test_activity_get_workspace_cursor_set_when_full_page():
    fake_row = MagicMock()
    fake_row.id = 42

    count_result = MagicMock()
    count_result.scalar_one.return_value = 1

    items_result = MagicMock()
    items_result.scalars.return_value.all.return_value = [fake_row]

    session = MagicMock()
    session.execute = AsyncMock(side_effect=[count_result, items_result])
    repo = ActivityRepository(session)

    items, total, cursor = await repo.get_workspace_activity(uuid.uuid4(), limit=1)
    assert cursor == 42


# ── AuditLogRepository ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_creates_entry():
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    repo = AuditLogRepository(session)

    entry = await repo.log(
        project_id=uuid.uuid4(),
        actor_id=uuid.uuid4(),
        actor_name="alice",
        action="workspace.created",
        entity_type="workspace",
        entity_name="My WS",
        meta={"key": "value"},
    )

    session.add.assert_called_once()
    session.flush.assert_awaited_once()
    assert entry.action == "workspace.created"


@pytest.mark.asyncio
async def test_audit_log_creates_entry_no_actor():
    session = MagicMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    repo = AuditLogRepository(session)

    entry = await repo.log(
        project_id=uuid.uuid4(),
        actor_id=None,
        actor_name=None,
        action="member.removed",
        entity_type="member",
    )
    assert entry.actor_id is None


@pytest.mark.asyncio
async def test_audit_get_workspace_no_cursor():
    session = _mock_session(rows=[], count=0)
    repo = AuditLogRepository(session)

    items, total, cursor = await repo.get_workspace_audit(uuid.uuid4(), limit=10)
    assert items == []
    assert total == 0
    assert cursor is None


@pytest.mark.asyncio
async def test_audit_get_workspace_with_all_filters():
    ws = uuid.uuid4()
    actor = uuid.uuid4()
    session = _mock_session(rows=[], count=0)
    repo = AuditLogRepository(session)

    items, total, cursor = await repo.get_workspace_audit(
        ws,
        actor_ids=[actor],
        exclude_actor_ids=[uuid.uuid4()],
        actions=["workspace.created"],
        exclude_actions=["board.deleted"],
        entity_types=["workspace"],
        entity_name_search="sprint",
        date_from=date(2026, 1, 1),
        date_to=date(2026, 6, 14),
        after_id=3,
        before_id=99,
    )
    assert items == []


@pytest.mark.asyncio
async def test_audit_get_workspace_cursor_set_when_full_page():
    fake_row = MagicMock()
    fake_row.id = 17

    count_result = MagicMock()
    count_result.scalar_one.return_value = 1

    items_result = MagicMock()
    items_result.scalars.return_value.all.return_value = [fake_row]

    session = MagicMock()
    session.execute = AsyncMock(side_effect=[count_result, items_result])
    repo = AuditLogRepository(session)

    items, total, cursor = await repo.get_workspace_audit(uuid.uuid4(), limit=1)
    assert cursor == 17
