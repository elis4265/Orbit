import pytest
import uuid
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository


async def _seed(db_session):
    user = await UserRepository(db_session).create({
        "email": f"board_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    ws = await ProjectRepository(db_session).create({"key": "WS", "name": "WS", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Sprint 1", "project_id": ws.id})
    return user, ws, board


@pytest.mark.asyncio
async def test_rename_board(db_session):
    user, ws, board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{ws.id}/boards/{board.id}",
            json={"name": "Sprint 2"},
        )

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Sprint 2"


@pytest.mark.asyncio
async def test_delete_board(db_session):
    user, ws, board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{ws.id}/boards/{board.id}")

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_board_wrong_workspace_returns_404(db_session):
    user, ws, board = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{uuid.uuid4()}/boards/{board.id}")

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_board_ownership_guard_blocks_other_user(db_session):
    owner, ws, board = await _seed(db_session)
    intruder = await UserRepository(db_session).create({
        "email": f"intruder_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    app.dependency_overrides[get_current_user] = lambda: intruder

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{ws.id}/boards/{board.id}")

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 403
