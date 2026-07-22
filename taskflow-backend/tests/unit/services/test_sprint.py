"""Unit tests for SprintService (mocked repo)."""
import uuid
from datetime import date, datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.sprint import SprintCreate, SprintUpdate
from app.services.sprint import SprintService


def _make_sprint(**kwargs):
    s = MagicMock()
    s.id = kwargs.get("id", uuid.uuid4())
    s.project_id = kwargs.get("project_id", uuid.uuid4())
    s.board_id = kwargs.get("board_id", uuid.uuid4())
    s.name = kwargs.get("name", "Sprint 1")
    s.goal = kwargs.get("goal", None)
    s.start_date = kwargs.get("start_date", date(2026, 7, 1))
    s.end_date = kwargs.get("end_date", date(2026, 7, 14))
    s.status = kwargs.get("status", "planned")
    s.created_at = kwargs.get("created_at", datetime(2026, 6, 16, tzinfo=timezone.utc))
    return s


def _make_repo(sprint=None):
    repo = MagicMock()
    sp = sprint or _make_sprint()
    repo.get = AsyncMock(return_value=sp)
    repo.list_for_board = AsyncMock(return_value=[sp])
    repo.create = AsyncMock(return_value=sp)
    repo.update = AsyncMock(return_value=sp)
    repo.close = AsyncMock(return_value=_make_sprint(status="closed"))
    repo.delete = AsyncMock(return_value=None)
    return repo, sp


@pytest.mark.asyncio
async def test_list_sprints_returns_list():
    repo, sp = _make_repo()
    svc = SprintService(repo)
    result = await svc.list_sprints(sp.project_id, sp.board_id)
    assert len(result) == 1
    assert result[0].name == "Sprint 1"


@pytest.mark.asyncio
async def test_create_sprint_success():
    repo, sp = _make_repo()
    svc = SprintService(repo)
    data = SprintCreate(name="Sprint 1", start_date=date(2026, 7, 1), end_date=date(2026, 7, 14))
    result = await svc.create_sprint(sp.project_id, sp.board_id, data)
    assert result.name == "Sprint 1"
    repo.create.assert_called_once()


@pytest.mark.asyncio
async def test_create_sprint_end_before_start_raises():
    repo, sp = _make_repo()
    svc = SprintService(repo)
    data = SprintCreate(name="Bad", start_date=date(2026, 7, 14), end_date=date(2026, 7, 1))
    with pytest.raises(Exception) as exc_info:
        await svc.create_sprint(sp.project_id, sp.board_id, data)
    assert "end_date" in str(exc_info.value).lower() or exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_close_sprint_success():
    repo, sp = _make_repo()
    svc = SprintService(repo)
    result = await svc.close_sprint(sp.id, sp.project_id)
    assert result.status == "closed"
    repo.close.assert_called_once_with(sp)


@pytest.mark.asyncio
async def test_close_sprint_already_closed_raises():
    closed = _make_sprint(status="closed")
    repo, _ = _make_repo(sprint=closed)
    svc = SprintService(repo)
    with pytest.raises(Exception) as exc_info:
        await svc.close_sprint(closed.id, closed.project_id)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_sprint_active_raises():
    active = _make_sprint(status="active")
    repo, _ = _make_repo(sprint=active)
    svc = SprintService(repo)
    with pytest.raises(Exception) as exc_info:
        await svc.delete_sprint(active.id, active.project_id)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_delete_sprint_planned_succeeds():
    repo, sp = _make_repo()
    svc = SprintService(repo)
    await svc.delete_sprint(sp.id, sp.project_id)
    repo.delete.assert_called_once_with(sp)


@pytest.mark.asyncio
async def test_get_nonexistent_sprint_raises_404():
    repo, _ = _make_repo()
    repo.get = AsyncMock(return_value=None)
    svc = SprintService(repo)
    with pytest.raises(Exception) as exc_info:
        await svc.close_sprint(uuid.uuid4(), uuid.uuid4())
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_closed_sprint_raises():
    closed = _make_sprint(status="closed")
    repo, _ = _make_repo(sprint=closed)
    svc = SprintService(repo)
    with pytest.raises(Exception) as exc_info:
        await svc.update_sprint(closed.id, closed.project_id, SprintUpdate(name="New"))
    assert exc_info.value.status_code == 400


# ── complete_sprint (Phase 1: enforced flow) ─────────────────────────────────

def _make_task(sprint_id=None, parent_id=None, custom_status_id=None, status="todo", **kw):
    t = MagicMock()
    t.id = kw.get("id", uuid.uuid4())
    t.sprint_id = sprint_id
    t.parent_id = parent_id
    t.custom_status_id = custom_status_id
    t.status = status
    return t


def _make_status_row(sid, category):
    s = MagicMock()
    s.id = sid
    s.category = category
    return s


def _complete_service(sprint, all_tasks, statuses=None, target=None):
    """Build a SprintService wired with mocked sprint/task/status repos."""
    sprint_repo = MagicMock()

    def _get(sid):
        if target is not None and sid == target.id:
            return target
        if sid == sprint.id:
            return sprint
        return None

    sprint_repo.get = AsyncMock(side_effect=_get)
    sprint_repo.close = AsyncMock(return_value=_make_sprint(
        id=sprint.id, project_id=sprint.project_id, board_id=sprint.board_id, status="closed"))
    created_sprint = _make_sprint(project_id=sprint.project_id, board_id=sprint.board_id, status="planned")
    sprint_repo.create = AsyncMock(return_value=created_sprint)
    sprint_repo._created = created_sprint

    task_repo = MagicMock()
    task_repo.get_project_tasks_filtered = AsyncMock(return_value=all_tasks)
    task_repo.bulk_update = AsyncMock(return_value=0)

    status_repo = MagicMock()
    status_repo.list_for_project = AsyncMock(return_value=statuses or [])

    return SprintService(sprint_repo, task_repo, status_repo), sprint_repo, task_repo


@pytest.mark.asyncio
async def test_complete_sprint_backlog_moves_only_incomplete():
    sp = _make_sprint(status="active")
    done = _make_task(sprint_id=sp.id, status="done")
    todo = _make_task(sprint_id=sp.id, status="todo")
    svc, sprint_repo, task_repo = _complete_service(sp, [done, todo])

    result = await svc.complete_sprint(sp.id, sp.project_id, "backlog", None)

    assert result.status == "closed"
    sprint_repo.close.assert_called_once()
    task_repo.bulk_update.assert_called_once()
    args, kwargs = task_repo.bulk_update.call_args
    moved_ids = args[1] if len(args) > 1 else kwargs["task_ids"]
    data = args[2] if len(args) > 2 else kwargs["data"]
    assert list(moved_ids) == [todo.id]          # done task stays
    assert data == {"sprint_id": None}            # backlog


@pytest.mark.asyncio
async def test_complete_sprint_move_to_target():
    sp = _make_sprint(status="active")
    target = _make_sprint(status="planned", project_id=sp.project_id, board_id=sp.board_id)
    todo = _make_task(sprint_id=sp.id, status="todo")
    svc, _, task_repo = _complete_service(sp, [todo], target=target)

    await svc.complete_sprint(sp.id, sp.project_id, "move", target.id)

    args, kwargs = task_repo.bulk_update.call_args
    data = args[2] if len(args) > 2 else kwargs["data"]
    assert data == {"sprint_id": target.id}


@pytest.mark.asyncio
async def test_complete_sprint_parent_incomplete_due_to_child():
    """Jira reclassify: a done parent with an unfinished child is itself incomplete."""
    sp = _make_sprint(status="active")
    parent = _make_task(sprint_id=sp.id, status="done")
    child = _make_task(sprint_id=None, parent_id=parent.id, status="todo")  # child not in sprint
    svc, _, task_repo = _complete_service(sp, [parent, child])

    await svc.complete_sprint(sp.id, sp.project_id, "backlog", None)

    args, kwargs = task_repo.bulk_update.call_args
    moved_ids = args[1] if len(args) > 1 else kwargs["task_ids"]
    assert list(moved_ids) == [parent.id]         # parent moved despite being done


@pytest.mark.asyncio
async def test_complete_sprint_custom_status_completed_category_stays():
    sp = _make_sprint(status="active")
    done_sid, todo_sid = uuid.uuid4(), uuid.uuid4()
    statuses = [_make_status_row(done_sid, "completed"), _make_status_row(todo_sid, "started")]
    done = _make_task(sprint_id=sp.id, custom_status_id=done_sid)
    wip = _make_task(sprint_id=sp.id, custom_status_id=todo_sid)
    svc, _, task_repo = _complete_service(sp, [done, wip], statuses=statuses)

    await svc.complete_sprint(sp.id, sp.project_id, "backlog", None)

    args, kwargs = task_repo.bulk_update.call_args
    moved_ids = args[1] if len(args) > 1 else kwargs["task_ids"]
    assert list(moved_ids) == [wip.id]


@pytest.mark.asyncio
async def test_complete_sprint_new_creates_sprint_and_moves():
    sp = _make_sprint(status="active")
    todo = _make_task(sprint_id=sp.id, status="todo")
    svc, sprint_repo, task_repo = _complete_service(sp, [todo])

    await svc.complete_sprint(sp.id, sp.project_id, "new", None, new_sprint_name="Sprint 2")

    sprint_repo.create.assert_called_once()
    args, kwargs = task_repo.bulk_update.call_args
    data = args[2] if len(args) > 2 else kwargs["data"]
    assert data == {"sprint_id": sprint_repo._created.id}


@pytest.mark.asyncio
async def test_complete_sprint_new_requires_name():
    sp = _make_sprint(status="active")
    svc, _, _ = _complete_service(sp, [])
    with pytest.raises(Exception) as exc:
        await svc.complete_sprint(sp.id, sp.project_id, "new", None, new_sprint_name=None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_complete_sprint_move_requires_target():
    sp = _make_sprint(status="active")
    svc, _, _ = _complete_service(sp, [])
    with pytest.raises(Exception) as exc:
        await svc.complete_sprint(sp.id, sp.project_id, "move", None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_complete_sprint_target_closed_raises():
    sp = _make_sprint(status="active")
    target = _make_sprint(status="closed", project_id=sp.project_id, board_id=sp.board_id)
    svc, _, _ = _complete_service(sp, [], target=target)
    with pytest.raises(Exception) as exc:
        await svc.complete_sprint(sp.id, sp.project_id, "move", target.id)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_complete_sprint_already_closed_raises():
    closed = _make_sprint(status="closed")
    svc, _, _ = _complete_service(closed, [])
    with pytest.raises(Exception) as exc:
        await svc.complete_sprint(closed.id, closed.project_id, "backlog", None)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_complete_sprint_no_incomplete_skips_bulk_update():
    sp = _make_sprint(status="active")
    done = _make_task(sprint_id=sp.id, status="done")
    svc, sprint_repo, task_repo = _complete_service(sp, [done])
    await svc.complete_sprint(sp.id, sp.project_id, "backlog", None)
    task_repo.bulk_update.assert_not_called()
    sprint_repo.close.assert_called_once()
