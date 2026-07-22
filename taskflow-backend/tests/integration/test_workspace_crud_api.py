import pytest
import uuid
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository


async def _seed_user(db_session) -> User:
    return await UserRepository(db_session).create({
        "email": f"ws_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })


async def _seed_project(db_session, user: User, name="Test WS"):
    return await ProjectRepository(db_session).create({"key": "WS", 
        "name": name,
        "owner_id": user.id,
    })


@pytest.mark.asyncio
async def test_rename_workspace(db_session):
    user = await _seed_user(db_session)
    ws = await _seed_project(db_session, user)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(f"/api/v1/projects/{ws.id}", json={"name": "Renamed WS"})

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed WS"


@pytest.mark.asyncio
async def test_delete_workspace(db_session):
    user = await _seed_user(db_session)
    ws = await _seed_project(db_session, user)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{ws.id}")

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_nonexistent_workspace_returns_404(db_session):
    user = await _seed_user(db_session)
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{uuid.uuid4()}")

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_rename_workspace_owned_by_other_user_returns_404(db_session):
    owner = await _seed_user(db_session)
    intruder = await _seed_user(db_session)
    ws = await _seed_project(db_session, owner)
    app.dependency_overrides[get_current_user] = lambda: intruder

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(f"/api/v1/projects/{ws.id}", json={"name": "Hijacked"})

    app.dependency_overrides.pop(get_current_user, None)
    assert resp.status_code == 403
