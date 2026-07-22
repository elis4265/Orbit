"""Unit tests for Flow-mode cycle reconciliation orchestration (mocked repos)."""
import uuid
from dataclasses import dataclass, field
from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.cycle_runner import reconcile_project_cycles, disable_project_cycles

ANCHOR = date(2026, 1, 5)


@dataclass
class _Cfg:
    project_id: uuid.UUID = field(default_factory=uuid.uuid4)
    duration_weeks: int = 2
    cooldown_days: int = 0
    start_anchor: date = ANCHOR
    upcoming_count: int = 1


def _row(start, end, status="active", rid=None):
    r = MagicMock()
    r.id = rid or uuid.uuid4()
    r.start_date = start
    r.end_date = end
    r.status = status
    return r


def _task(sprint_id, status="todo"):
    t = MagicMock()
    t.id = uuid.uuid4()
    t.sprint_id = sprint_id
    t.status = status
    return t


def _repos(existing, sprint_tasks=None, backlog=None):
    sprint_repo = MagicMock()
    sprint_repo.list_auto_cycles = AsyncMock(return_value=existing)
    created = []

    async def _create_cycle(project_id, name, start, end, status):
        r = _row(start, end, status)
        r.name = name
        created.append(r)
        return r

    sprint_repo.create_cycle = AsyncMock(side_effect=_create_cycle)
    sprint_repo.activate = AsyncMock(side_effect=lambda s: setattr(s, "status", "active") or s)
    sprint_repo.close = AsyncMock(side_effect=lambda s: setattr(s, "status", "closed") or s)
    sprint_repo.delete = AsyncMock(return_value=None)

    task_repo = MagicMock()

    async def _filtered(project_id, sprint_filter):
        if sprint_filter == "none":
            return backlog or []      # cycle-less tasks (for auto-add)
        return sprint_tasks or []     # tasks in a specific cycle (for rollover)

    task_repo.get_project_tasks_filtered = AsyncMock(side_effect=_filtered)
    task_repo.bulk_update = AsyncMock(return_value=0)
    return sprint_repo, task_repo, created


@pytest.mark.asyncio
async def test_creates_missing_cycles_when_none_exist():
    cfg = _Cfg()
    sprint_repo, task_repo, created = _repos(existing=[])
    res = await reconcile_project_cycles(cfg, date(2026, 1, 10), sprint_repo, task_repo)
    # current + 1 upcoming = 2 cycles created
    assert res["created"] == 2
    assert created[0].status == "active"     # current window
    assert created[1].status == "planned"    # upcoming


@pytest.mark.asyncio
async def test_activates_existing_planned_current_cycle():
    cfg = _Cfg()
    current = _row(date(2026, 1, 5), date(2026, 1, 18), status="planned")
    sprint_repo, task_repo, _ = _repos(existing=[current])
    await reconcile_project_cycles(cfg, date(2026, 1, 10), sprint_repo, task_repo)
    sprint_repo.activate.assert_awaited_once()


@pytest.mark.asyncio
async def test_rolls_incomplete_tasks_into_current_then_closes():
    cfg = _Cfg()
    # ended cycle (1/5–1/18) is past on 1/25; current window is 1/19–2/1
    ended = _row(date(2026, 1, 5), date(2026, 1, 18), status="active")
    current = _row(date(2026, 1, 19), date(2026, 2, 1), status="active")
    done = _task(ended.id, status="done")
    todo = _task(ended.id, status="todo")
    sprint_repo, task_repo, _ = _repos(existing=[ended, current], sprint_tasks=[done, todo])

    res = await reconcile_project_cycles(cfg, date(2026, 1, 25), sprint_repo, task_repo)

    # only the unfinished task rolls forward
    task_repo.bulk_update.assert_awaited_once()
    args, kwargs = task_repo.bulk_update.call_args
    moved = args[1] if len(args) > 1 else kwargs["task_ids"]
    data = args[2] if len(args) > 2 else kwargs["data"]
    assert list(moved) == [todo.id]
    assert data == {"sprint_id": current.id}
    assert res["closed"] == 1 and res["rolled"] == 1
    sprint_repo.close.assert_awaited()


@pytest.mark.asyncio
async def test_auto_adds_started_cycleless_tasks_to_current():
    cfg = _Cfg()
    current = _row(date(2026, 1, 5), date(2026, 1, 18), status="active")
    started = _task(sprint_id=None, status="in_progress")
    todo = _task(sprint_id=None, status="todo")          # backlog stays out
    sprint_repo, task_repo, _ = _repos(existing=[current], backlog=[started, todo])

    res = await reconcile_project_cycles(cfg, date(2026, 1, 10), sprint_repo, task_repo)

    task_repo.bulk_update.assert_awaited_once()
    args, kwargs = task_repo.bulk_update.call_args
    moved = args[1] if len(args) > 1 else kwargs["task_ids"]
    data = args[2] if len(args) > 2 else kwargs["data"]
    assert list(moved) == [started.id]                   # only the started task
    assert data == {"sprint_id": current.id}
    assert res["added"] == 1


@pytest.mark.asyncio
async def test_disable_closes_active_and_removes_planned():
    pid = uuid.uuid4()
    active = _row(date(2026, 1, 5), date(2026, 1, 18), status="active")
    planned = _row(date(2026, 1, 19), date(2026, 2, 1), status="planned")
    sprint_repo, _, _ = _repos(existing=[active, planned])

    res = await disable_project_cycles(pid, sprint_repo)

    sprint_repo.close.assert_awaited_once_with(active)
    sprint_repo.delete.assert_awaited_once_with(planned)
    assert res == {"closed": 1, "removed": 1}


@pytest.mark.asyncio
async def test_no_double_create_when_cycles_present():
    cfg = _Cfg()
    w0 = _row(date(2026, 1, 5), date(2026, 1, 18), status="active")
    w1 = _row(date(2026, 1, 19), date(2026, 2, 1), status="planned")
    sprint_repo, task_repo, created = _repos(existing=[w0, w1])
    res = await reconcile_project_cycles(cfg, date(2026, 1, 10), sprint_repo, task_repo)
    assert res["created"] == 0
    sprint_repo.create_cycle.assert_not_called()
