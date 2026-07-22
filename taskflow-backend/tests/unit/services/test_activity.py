"""Unit tests for ActivityService — V2 centralized ledger (REQ-V2-001 through REQ-V2-013)."""
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.activity import ActivityService, _strip_html


# ── Helper ─────────────────────────────────────────────────────────────────────

def _make_service():
    repo = MagicMock()
    repo.log = AsyncMock(return_value=None)
    return ActivityService(repo), repo


ENTITY_ID = uuid.uuid4()
WS_ID = uuid.uuid4()
ACTOR_ID = uuid.uuid4()
ENTITY_NAME = "My Task"


# ── _strip_html ────────────────────────────────────────────────────────────────

def test_strip_html_removes_tags():
    assert _strip_html("<p>Hello <b>world</b></p>") == "Hello world"


def test_strip_html_truncates_to_150():
    assert len(_strip_html("<p>" + "x" * 200 + "</p>")) == 150


def test_strip_html_handles_none():
    assert _strip_html(None) == ""


# ── entity_type always 'task' for all log_* methods ───────────────────────────

@pytest.mark.asyncio
async def test_log_task_created():
    svc, repo = _make_service()
    await svc.log_task_created(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice")
    repo.log.assert_awaited_once()
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["entity_id"] == ENTITY_ID
    assert kw["entity_name"] == ENTITY_NAME
    assert kw["action"] == "task_created"


@pytest.mark.asyncio
async def test_log_status_changed():
    svc, repo = _make_service()
    await svc.log_status_changed(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "todo", "in_progress")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "status_changed"
    assert kw["old_value"] == "todo"
    assert kw["new_value"] == "in_progress"
    assert kw["field"] == "status"


@pytest.mark.asyncio
async def test_log_priority_changed_logs_str_values():
    # Priorities are named scheme items referenced by id now (not the old P1–P5
    # integers), so the service logs the raw value as a string — no "P" prefix.
    svc, repo = _make_service()
    await svc.log_priority_changed(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "High", "Low")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["old_value"] == "High"
    assert kw["new_value"] == "Low"


@pytest.mark.asyncio
async def test_log_assignee_changed():
    svc, repo = _make_service()
    await svc.log_assignee_changed(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", None, "bob")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "assignee_changed"
    assert kw["old_value"] is None
    assert kw["new_value"] == "bob"


@pytest.mark.asyncio
async def test_log_due_date_changed():
    svc, repo = _make_service()
    await svc.log_due_date_changed(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "2026-01-01", "2026-02-01")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "due_date_changed"
    assert kw["field"] == "due_date"


@pytest.mark.asyncio
async def test_log_title_changed():
    svc, repo = _make_service()
    await svc.log_title_changed(ENTITY_ID, "New T", WS_ID, ACTOR_ID, "alice", "Old T", "New T")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "title_changed"
    assert kw["old_value"] == "Old T"
    assert kw["new_value"] == "New T"


@pytest.mark.asyncio
async def test_log_comment_added_stores_snippet():
    svc, repo = _make_service()
    await svc.log_comment_added(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "<p>Nice fix!</p>")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "comment_added"
    assert kw["meta"]["snippet"] == "Nice fix!"


@pytest.mark.asyncio
async def test_log_comment_edited():
    svc, repo = _make_service()
    await svc.log_comment_edited(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "<p>Updated comment</p>")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "comment_edited"
    assert kw["meta"]["snippet"] == "Updated comment"


@pytest.mark.asyncio
async def test_log_comment_deleted():
    svc, repo = _make_service()
    await svc.log_comment_deleted(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "comment_deleted"


@pytest.mark.asyncio
async def test_log_attachment_added():
    svc, repo = _make_service()
    await svc.log_attachment_added(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "photo.png", 1024)
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "attachment_added"
    assert kw["meta"]["filename"] == "photo.png"
    assert kw["meta"]["size_bytes"] == 1024


@pytest.mark.asyncio
async def test_log_attachment_deleted():
    svc, repo = _make_service()
    await svc.log_attachment_deleted(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "photo.png")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "attachment_deleted"
    assert kw["meta"]["filename"] == "photo.png"


@pytest.mark.asyncio
async def test_log_tag_applied():
    svc, repo = _make_service()
    await svc.log_tag_applied(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "bug", "#ff0000")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "tag_applied"
    assert kw["meta"]["tag_name"] == "bug"


@pytest.mark.asyncio
async def test_log_tag_removed():
    svc, repo = _make_service()
    await svc.log_tag_removed(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "bug", "#ff0000")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "tag_removed"


@pytest.mark.asyncio
async def test_log_subtask_added():
    svc, repo = _make_service()
    await svc.log_subtask_added(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "Write tests")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "subtask_added"
    assert kw["meta"]["title"] == "Write tests"


@pytest.mark.asyncio
async def test_log_subtask_toggled_completed():
    svc, repo = _make_service()
    await svc.log_subtask_toggled(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "Step 1", True)
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "subtask_completed"


@pytest.mark.asyncio
async def test_log_subtask_toggled_uncompleted():
    svc, repo = _make_service()
    await svc.log_subtask_toggled(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "Step 1", False)
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "subtask_uncompleted"


@pytest.mark.asyncio
async def test_log_subtask_deleted():
    svc, repo = _make_service()
    await svc.log_subtask_deleted(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice", "Old step")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "subtask_deleted"
    assert kw["meta"]["title"] == "Old step"


@pytest.mark.asyncio
async def test_log_task_deleted():
    svc, repo = _make_service()
    await svc.log_task_deleted(ENTITY_ID, ENTITY_NAME, WS_ID, ACTOR_ID, "alice")
    kw = repo.log.call_args.kwargs
    assert kw["entity_type"] == "task"
    assert kw["action"] == "task_deleted"
    assert kw["actor_name"] == "alice"


# ── get_for_entity (replaces get_task_activity) ───────────────────────────────

@pytest.mark.asyncio
async def test_get_for_entity_delegates_to_repo():
    svc, repo = _make_service()
    repo.get_for_entity = AsyncMock(return_value=["entry1"])
    result = await svc.get_for_entity("task", ENTITY_ID, limit=10)
    repo.get_for_entity.assert_awaited_once_with("task", ENTITY_ID, limit=10, offset=0, actions=None)
    assert result == ["entry1"]


@pytest.mark.asyncio
async def test_get_for_entity_passes_action_filter():
    svc, repo = _make_service()
    repo.get_for_entity = AsyncMock(return_value=[])
    await svc.get_for_entity("task", ENTITY_ID, actions=["comment_added", "comment_deleted"])
    kw = repo.get_for_entity.call_args.kwargs
    assert kw["actions"] == ["comment_added", "comment_deleted"]


# ── get_workspace_activity ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_workspace_activity_delegates_to_repo():
    svc, repo = _make_service()
    repo.get_workspace_activity = AsyncMock(return_value=(["e1", "e2"], 2, None))
    items, total, next_cursor = await svc.get_workspace_activity(WS_ID, limit=25)
    repo.get_workspace_activity.assert_awaited_once_with(
        WS_ID,
        limit=25,
        offset=0,
        actor_ids=None,
        exclude_actor_ids=None,
        actions=None,
        exclude_actions=None,
        entity_types=None,
        entity_name_search=None,
        date_from=None,
        date_to=None,
        after_id=None,
        before_id=None,
    )
    assert items == ["e1", "e2"]
    assert total == 2
    assert next_cursor is None


@pytest.mark.asyncio
async def test_get_workspace_activity_passes_actor_filter():
    svc, repo = _make_service()
    actor = uuid.uuid4()
    repo.get_workspace_activity = AsyncMock(return_value=([], 0, None))
    await svc.get_workspace_activity(WS_ID, actor_ids=[actor])
    kw = repo.get_workspace_activity.call_args.kwargs
    assert kw["actor_ids"] == [actor]


@pytest.mark.asyncio
async def test_get_workspace_activity_passes_action_filter():
    svc, repo = _make_service()
    repo.get_workspace_activity = AsyncMock(return_value=([], 0, None))
    await svc.get_workspace_activity(WS_ID, actions=["task_created"])
    kw = repo.get_workspace_activity.call_args.kwargs
    assert kw["actions"] == ["task_created"]


@pytest.mark.asyncio
async def test_get_workspace_activity_passes_entity_types_filter():
    svc, repo = _make_service()
    repo.get_workspace_activity = AsyncMock(return_value=([], 0, None))
    await svc.get_workspace_activity(WS_ID, entity_types=["task"])
    kw = repo.get_workspace_activity.call_args.kwargs
    assert kw["entity_types"] == ["task"]


@pytest.mark.asyncio
async def test_get_workspace_activity_passes_cursor_params():
    svc, repo = _make_service()
    repo.get_workspace_activity = AsyncMock(return_value=([], 0, None))
    await svc.get_workspace_activity(WS_ID, after_id=100)
    kw = repo.get_workspace_activity.call_args.kwargs
    assert kw["after_id"] == 100
    assert kw["before_id"] is None


@pytest.mark.asyncio
async def test_get_workspace_activity_passes_date_filters():
    from datetime import date
    svc, repo = _make_service()
    d_from = date(2026, 1, 1)
    d_to = date(2026, 12, 31)
    repo.get_workspace_activity = AsyncMock(return_value=([], 0, None))
    await svc.get_workspace_activity(WS_ID, date_from=d_from, date_to=d_to)
    kw = repo.get_workspace_activity.call_args.kwargs
    assert kw["date_from"] == d_from
    assert kw["date_to"] == d_to


@pytest.mark.asyncio
async def test_get_workspace_activity_returns_items_total_and_cursor():
    svc, repo = _make_service()
    repo.get_workspace_activity = AsyncMock(return_value=(["e1", "e2"], 5, 42))
    items, total, next_cursor = await svc.get_workspace_activity(WS_ID)
    assert items == ["e1", "e2"]
    assert total == 5
    assert next_cursor == 42


@pytest.mark.asyncio
async def test_get_workspace_activity_no_filters_passes_none_defaults():
    svc, repo = _make_service()
    repo.get_workspace_activity = AsyncMock(return_value=([], 0, None))
    await svc.get_workspace_activity(WS_ID)
    kw = repo.get_workspace_activity.call_args.kwargs
    assert kw["actor_ids"] is None
    assert kw["actions"] is None
    assert kw["entity_types"] is None
    assert kw["date_from"] is None
    assert kw["date_to"] is None
    assert kw["after_id"] is None
    assert kw["before_id"] is None
