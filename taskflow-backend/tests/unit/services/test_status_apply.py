"""REQ-137 — completed_at stamping in the shared status-transition applier."""
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.task import Task, TaskStatus, IssueType
from app.services.status_apply import apply_transition


def make_task(**kwargs):
    defaults = {
        "id": uuid.uuid4(),
        "title": "T",
        "status": TaskStatus.todo,
        "issue_type": IssueType.task,
        "position": 0,
        "version": 1,
        "project_id": uuid.uuid4(),
        "completed_at": None,
    }
    defaults.update(kwargs)
    return Task(**defaults)


def open_project():
    p = MagicMock()
    p.mode = "open"
    p.id = uuid.uuid4()
    return p


def guided_project():
    p = MagicMock()
    p.mode = "guided"
    p.id = uuid.uuid4()
    return p


def session_returning(status_row):
    session = MagicMock()
    result = MagicMock()
    result.scalars.return_value.first.return_value = status_row
    session.execute = AsyncMock(return_value=result)
    return session


def status_row(category):
    row = MagicMock()
    row.id = uuid.uuid4()
    row.category = category
    row.name = "Some Status"
    return row


@pytest.mark.asyncio
async def test_open_mode_done_sets_completed_at():
    task = make_task(status=TaskStatus.in_progress)
    result = await apply_transition(MagicMock(), task, open_project(), category="done")
    assert result == "changed"
    assert task.completed_at is not None


@pytest.mark.asyncio
async def test_open_mode_leaving_done_clears_completed_at():
    task = make_task(status=TaskStatus.done, completed_at=datetime.now(timezone.utc))
    result = await apply_transition(MagicMock(), task, open_project(), category="in_progress")
    assert result == "changed"
    assert task.completed_at is None


@pytest.mark.asyncio
async def test_custom_mode_completed_category_sets_completed_at():
    task = make_task()
    session = session_returning(status_row("completed"))
    result = await apply_transition(session, task, guided_project(), category="done")
    assert result == "changed"
    assert task.completed_at is not None


@pytest.mark.asyncio
async def test_custom_mode_cancelled_category_sets_completed_at():
    task = make_task()
    session = session_returning(status_row("cancelled"))
    result = await apply_transition(session, task, guided_project(), name="Won't fix")
    assert result == "changed"
    assert task.completed_at is not None


@pytest.mark.asyncio
async def test_custom_mode_started_category_clears_completed_at():
    task = make_task(completed_at=datetime.now(timezone.utc))
    session = session_returning(status_row("started"))
    result = await apply_transition(session, task, guided_project(), category="in_progress")
    assert result == "changed"
    assert task.completed_at is None


@pytest.mark.asyncio
async def test_custom_mode_completed_to_completed_preserves_original_timestamp():
    original = datetime.now(timezone.utc) - timedelta(days=10)
    task = make_task(custom_status_id=uuid.uuid4(), completed_at=original)
    session = session_returning(status_row("completed"))
    result = await apply_transition(session, task, guided_project(), name="Shipped")
    assert result == "changed"
    assert task.completed_at == original


# ── HW-31 — apply_transition mirrors the custom status's category into task.status ──
# The VCS/automation path set custom_status_id + completed_at but left the fixed enum
# stale, so scheduler/blocker-gate/stats read the wrong status. Now it mirrors, matching
# what the UI update path already did.

@pytest.mark.asyncio
async def test_custom_completed_mirrors_status_to_done():
    task = make_task(status=TaskStatus.todo)
    session = session_returning(status_row("completed"))
    await apply_transition(session, task, guided_project(), category="done")
    assert task.status == TaskStatus.done


@pytest.mark.asyncio
async def test_custom_cancelled_mirrors_status_to_done():
    task = make_task(status=TaskStatus.in_progress)
    session = session_returning(status_row("cancelled"))
    await apply_transition(session, task, guided_project(), name="Won't fix")
    assert task.status == TaskStatus.done


@pytest.mark.asyncio
async def test_custom_started_mirrors_status_to_in_progress():
    task = make_task(status=TaskStatus.todo)
    session = session_returning(status_row("started"))
    await apply_transition(session, task, guided_project(), category="in_progress")
    assert task.status == TaskStatus.in_progress


@pytest.mark.asyncio
async def test_custom_unstarted_mirrors_status_to_todo():
    task = make_task(status=TaskStatus.done, completed_at=datetime.now(timezone.utc))
    session = session_returning(status_row("unstarted"))
    await apply_transition(session, task, guided_project(), name="Backlog")
    assert task.status == TaskStatus.todo
    assert task.completed_at is None  # and completed_at still cleared, unchanged
