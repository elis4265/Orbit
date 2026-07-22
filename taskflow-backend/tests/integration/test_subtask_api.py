import pytest
import uuid
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository
from app.models.task import TaskStatus


async def _seed(db_session):
    user = await UserRepository(db_session).create({
        "email": f"sub_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    ws = await ProjectRepository(db_session).create({"key": "WS", "name": "WS", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Board", "project_id": ws.id})
    task = await TaskRepository(db_session).create_with_sequence(ws.id, {
        "title": "Parent Task",
        "project_id": ws.id,
        "status": TaskStatus.todo,
        "position": 0,
    })
    return user, ws, board, task


async def _seed_subtask(db_session, parent_task, ws, board, title="Step 1"):
    return await TaskRepository(db_session).create_with_sequence(ws.id, {
        "title": title,
        "parent_id": parent_task.id,
        "project_id": ws.id,
        "status": TaskStatus.todo,
        "position": 0,
    })


@pytest.mark.asyncio
async def test_create_subtask(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/subtasks",
            json={"title": "Write unit tests"},
        )

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Write unit tests"
    assert data["is_completed"] is False


@pytest.mark.asyncio
async def test_toggle_subtask(db_session):
    user, ws, board, task = await _seed(db_session)
    subtask = await _seed_subtask(db_session, task, ws, board)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/subtasks/{subtask.id}"
        )

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is True


@pytest.mark.asyncio
async def test_toggle_subtask_twice_returns_to_false(db_session):
    user, ws, board, task = await _seed(db_session)
    subtask = await _seed_subtask(db_session, task, ws, board)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        base = f"/api/v1/projects/{ws.id}/tasks/{task.id}/subtasks/{subtask.id}"
        await ac.patch(base)
        resp = await ac.patch(base)

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is False


@pytest.mark.asyncio
async def test_delete_subtask(db_session):
    user, ws, board, task = await _seed(db_session)
    subtask = await _seed_subtask(db_session, task, ws, board, title="Cleanup")
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/subtasks/{subtask.id}"
        )

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_nonexistent_subtask_returns_404(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/subtasks/{uuid.uuid4()}"
        )

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_task_workspace_mismatch_returns_404(db_session):
    """task_id from a different workspace must return 404 — prevents IDOR across workspace boundary."""
    user, ws, board, _ = await _seed(db_session)
    other_ws = await ProjectRepository(db_session).create({"key": "WS", "name": "Other WS", "owner_id": user.id})
    other_board = await BoardRepository(db_session).create({"name": "Other Board", "project_id": other_ws.id})
    task_in_other_ws = await TaskRepository(db_session).create_with_sequence(other_ws.id, {
        "title": "Foreign Task",
        "project_id": other_ws.id,
        "status": TaskStatus.todo,
        "position": 0,
    })
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/tasks/{task_in_other_ws.id}/subtasks",
            json={"title": "Should not be created"},
        )

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 404
