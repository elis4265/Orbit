"""REQ-143 — personal API tokens: show-once, scopes, revocation."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    user = await UserRepository(db_session).create({
        "email": f"pat_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "x",
        "is_superuser": True,  # HW-37: the write-scope PAT test creates a project
    })
    project = await ProjectRepository(db_session).create({"key": "PT", "name": "P", "owner_id": user.id})
    return user, project


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_token_lifecycle(db_session, seeded):
    user, project = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    async with _client() as ac:
        res = await ac.post("/api/v1/users/me/tokens", json={"name": "ci", "scope": "write"})
        assert res.status_code == 201
        created = res.json()
        assert created["token"].startswith("orbit_pat_")
        token = created["token"]

        # list never exposes the secret
        res = await ac.get("/api/v1/users/me/tokens")
        listed = res.json()
        assert len(listed) == 1
        assert "token" not in listed[0]
        assert listed[0]["prefix"].startswith("orbit_pat_")
    app.dependency_overrides.pop(get_current_user, None)

    # authenticate with the PAT — no dependency override
    async with _client() as ac:
        res = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        assert res.json()["email"] == user.email

        # write scope may mutate
        res = await ac.post(
            "/api/v1/projects", json={"name": "Via PAT"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 201

        # bogus token → 401
        res = await ac.get("/api/v1/auth/me", headers={"Authorization": "Bearer orbit_pat_nonsense"})
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_read_scope_rejects_writes(db_session, seeded):
    user, project = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    async with _client() as ac:
        token = (await ac.post("/api/v1/users/me/tokens", json={"name": "ro", "scope": "read"})).json()["token"]
    app.dependency_overrides.pop(get_current_user, None)

    async with _client() as ac:
        headers = {"Authorization": f"Bearer {token}"}
        assert (await ac.get("/api/v1/auth/me", headers=headers)).status_code == 200
        res = await ac.post("/api/v1/projects", json={"name": "Nope"}, headers=headers)
        assert res.status_code == 403


@pytest.mark.asyncio
async def test_revoked_token_is_dead(db_session, seeded):
    user, project = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    async with _client() as ac:
        created = (await ac.post("/api/v1/users/me/tokens", json={"name": "tmp", "scope": "read"})).json()
        assert (await ac.delete(f"/api/v1/users/me/tokens/{created['id']}")).status_code == 204
    app.dependency_overrides.pop(get_current_user, None)

    async with _client() as ac:
        res = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {created['token']}"})
        assert res.status_code == 401
