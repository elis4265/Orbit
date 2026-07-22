import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user, get_redis, get_ai_service
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository
from app.models.task import TaskStatus
from app.services.ai import AIService, AIBreakdownResult, AISubTaskItem


async def _seed(db_session):
    user = await UserRepository(db_session).create({
        "email": f"ai_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    ws = await ProjectRepository(db_session).create({"key": "WS", "name": "AI WS", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "AI Board", "project_id": ws.id})
    task = await TaskRepository(db_session).create_with_sequence(ws.id, {
        "title": "Implement JWT auth",
        "description": "Use PyJWT with HS256",
        "project_id": ws.id,
        "status": TaskStatus.todo,
        "position": 0,
    })
    return user, ws, board, task


def _mock_ai(sub_tasks: list[str]):
    result = AIBreakdownResult(sub_tasks=[AISubTaskItem(title=t) for t in sub_tasks])
    mock_service = MagicMock(spec=AIService)
    mock_service.generate_subtasks = AsyncMock(return_value=result)
    return mock_service


def _mock_redis(count: int = 1):
    r = AsyncMock()
    r.incr = AsyncMock(return_value=count)
    r.expire = AsyncMock()
    r.exists = AsyncMock(return_value=0)
    r.set = AsyncMock()
    return r


@pytest.mark.asyncio
async def test_ai_breakdown_creates_subtasks(db_session):
    user, ws, board, task = await _seed(db_session)
    mock_service = _mock_ai(["Write unit tests", "Implement refresh logic"])
    mock_redis = _mock_redis()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_ai_service] = lambda: mock_service
    app.dependency_overrides[get_redis] = lambda: mock_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/ai-breakdown"
        )

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_ai_service, None)
    app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 200
    data = resp.json()
    titles = [s["title"] for s in data["sub_tasks"]]
    assert "Write unit tests" in titles
    assert "Implement refresh logic" in titles


@pytest.mark.asyncio
async def test_ai_breakdown_rate_limit_exceeded(db_session):
    user, ws, board, task = await _seed(db_session)
    mock_service = _mock_ai(["Step 1"])
    mock_redis = _mock_redis(count=11)  # over limit

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_ai_service] = lambda: mock_service
    app.dependency_overrides[get_redis] = lambda: mock_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/ai-breakdown"
        )

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_ai_service, None)
    app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"


@pytest.mark.asyncio
async def test_ai_breakdown_service_failure_returns_502(db_session):
    user, ws, board, task = await _seed(db_session)
    mock_service = MagicMock(spec=AIService)
    mock_service.generate_subtasks = AsyncMock(side_effect=Exception("OpenAI timeout"))
    mock_redis = _mock_redis()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_ai_service] = lambda: mock_service
    app.dependency_overrides[get_redis] = lambda: mock_redis

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}/ai-breakdown"
        )

    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_ai_service, None)
    app.dependency_overrides.pop(get_redis, None)

    assert resp.status_code == 502
    assert resp.json()["error"]["code"] == "AI_SERVICE_UNAVAILABLE"


@pytest.mark.asyncio
async def test_task_list_returns_all_tasks(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{ws.id}/boards/{board.id}/tasks")

    app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_error_envelope_shape_on_404(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(
            f"/api/v1/projects/{ws.id}/tasks/{uuid.uuid4()}"
        )

    app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 404
    body = resp.json()
    assert "error" in body
    assert body["error"]["code"] == "NOT_FOUND"
    assert "message" in body["error"]
    assert "detail" in body["error"]


@pytest.mark.asyncio
async def test_error_envelope_shape_on_409(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_base = f"/api/v1/projects/{ws.id}/boards/{board.id}/tasks"
        task_base = f"/api/v1/projects/{ws.id}/tasks"
        # Bump version to 2 first
        await ac.patch(f"{task_base}/{task.id}", json={"status": "in_progress", "version": 1})
        # Send stale version 1 — should 409
        resp = await ac.patch(f"{task_base}/{task.id}", json={"status": "done", "version": 1})

    app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"] == "CONFLICT_VERSION"
    assert "message" in body["error"]


@pytest.mark.asyncio
async def test_error_envelope_shape_on_422(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Missing required `version` field — should 422. Use the seeded task so the
        # not-found (404) guard doesn't short-circuit before body validation runs.
        resp = await ac.patch(
            f"/api/v1/projects/{ws.id}/tasks/{task.id}",
            json={"status": "done"},
        )

    app.dependency_overrides.pop(get_current_user, None)

    assert resp.status_code == 422
    body = resp.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(body["error"]["detail"], list)


@pytest.mark.asyncio
async def test_login_response_includes_expires_in(db_session):
    from app.repositories.user import UserRepository
    from app.services.auth import AuthService

    user_repo = UserRepository(db_session)
    hashed = AuthService.hash_password("Password1!")
    await user_repo.create({"email": "expiry@taskflow.io", "hashed_password": hashed, "is_verified": True})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/auth/login",
            data={"username": "expiry@taskflow.io", "password": "Password1!"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "expires_in" in data
    assert data["expires_in"] == 900


@pytest.mark.asyncio
async def test_task_list_status_filter(db_session):
    user, ws, board, task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        base = f"/api/v1/projects/{ws.id}/boards/{board.id}/tasks"
        resp_todo = await ac.get(base, params={"status": "todo"})
        resp_done = await ac.get(base, params={"status": "done"})

    app.dependency_overrides.pop(get_current_user, None)

    assert resp_todo.status_code == 200
    assert all(t["status"] == "todo" for t in resp_todo.json())
    assert resp_done.status_code == 200
    assert resp_done.json() == []
