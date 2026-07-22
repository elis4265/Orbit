"""Unit tests for SubtaskService v2 — subtasks backed by child Tasks (parent_id)."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.subtask import SubtaskService
from app.models.task import TaskStatus


def _make_child_task(status=TaskStatus.todo, parent_id=None):
    t = MagicMock()
    t.id = uuid.uuid4()
    t.title = "Sub A"
    t.status = status
    t.parent_id = parent_id or uuid.uuid4()
    t.project_id = uuid.uuid4()
    t.created_at = "2026-01-01"
    # Derived properties that Task exposes after v2
    type(t).is_completed = property(lambda self: self.status == TaskStatus.done)
    type(t).task_id = property(lambda self: self.parent_id)
    return t


# ── create_subtask ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_subtask_creates_child_task():
    """create_subtask delegates to TaskRepository.create with parent_id set."""
    parent_id = uuid.uuid4()
    project_id = uuid.uuid4()
    created = _make_child_task(parent_id=parent_id)

    task_repo = MagicMock()
    task_repo.create_with_sequence = AsyncMock(return_value=created)

    svc = SubtaskService(task_repo)
    result = await svc.create_subtask(
        task_id=parent_id,
        project_id=project_id,
        title="Sub A",
    )

    task_repo.create_with_sequence.assert_awaited_once()
    call_data = task_repo.create_with_sequence.call_args[0][1]
    assert call_data["parent_id"] == parent_id
    assert call_data["title"] == "Sub A"
    assert call_data["project_id"] == project_id
    assert call_data["status"] == TaskStatus.todo
    assert result is created


# ── toggle_complete ───────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_toggle_complete_todo_becomes_done():
    child = _make_child_task(status=TaskStatus.todo)
    updated = _make_child_task(status=TaskStatus.done, parent_id=child.parent_id)
    task_repo = MagicMock()
    task_repo.get = AsyncMock(return_value=child)
    task_repo.update = AsyncMock(return_value=updated)

    svc = SubtaskService(task_repo)
    result = await svc.toggle_complete(child.id)

    task_repo.update.assert_awaited_once_with(child, {"status": TaskStatus.done})
    assert result is updated


@pytest.mark.asyncio
async def test_toggle_complete_done_becomes_todo():
    child = _make_child_task(status=TaskStatus.done)
    updated = _make_child_task(status=TaskStatus.todo, parent_id=child.parent_id)
    task_repo = MagicMock()
    task_repo.get = AsyncMock(return_value=child)
    task_repo.update = AsyncMock(return_value=updated)

    svc = SubtaskService(task_repo)
    result = await svc.toggle_complete(child.id)

    task_repo.update.assert_awaited_once_with(child, {"status": TaskStatus.todo})
    assert result is updated


@pytest.mark.asyncio
async def test_toggle_complete_not_found_returns_none():
    task_repo = MagicMock()
    task_repo.get = AsyncMock(return_value=None)

    svc = SubtaskService(task_repo)
    result = await svc.toggle_complete(uuid.uuid4())

    assert result is None


# ── delete_subtask ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_subtask_deletes_task():
    child = _make_child_task()
    task_repo = MagicMock()
    task_repo.get = AsyncMock(return_value=child)
    task_repo.delete = AsyncMock()

    svc = SubtaskService(task_repo)
    result = await svc.delete_subtask(child.id)

    task_repo.delete.assert_awaited_once_with(child)
    assert result is True


@pytest.mark.asyncio
async def test_delete_subtask_not_found_returns_false():
    task_repo = MagicMock()
    task_repo.get = AsyncMock(return_value=None)

    svc = SubtaskService(task_repo)
    result = await svc.delete_subtask(uuid.uuid4())

    assert result is False
