"""REQ-144/145 — webhook CRUD (admin-gated, show-once secret) + new-project default."""
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
    users = UserRepository(db_session)
    admin = await users.create({"email": f"wh_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    outsider = await users.create({"email": f"out_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    project = await ProjectRepository(db_session).create({"key": "WH", "name": "P", "owner_id": admin.id})
    return admin, outsider, project


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_webhook_crud(db_session, seeded):
    admin, _, project = seeded
    app.dependency_overrides[get_current_user] = lambda: admin
    async with _client() as ac:
        base = f"/api/v1/projects/{project.id}/webhooks"

        res = await ac.post(base, json={"url": "https://example.com/hook", "events": ["task.created", "sprint.closed"]})
        assert res.status_code == 201
        created = res.json()
        assert created["secret"]
        wid = created["id"]

        # list never exposes the secret
        listed = (await ac.get(base)).json()
        assert len(listed) == 1
        assert "secret" not in listed[0]

        # invalid URL scheme rejected
        res = await ac.post(base, json={"url": "ftp://example.com", "events": ["task.created"]})
        assert res.status_code == 422

        # unknown event rejected
        res = await ac.post(base, json={"url": "https://example.com", "events": ["nonsense.event"]})
        assert res.status_code == 422

        # disable
        res = await ac.patch(f"{base}/{wid}", json={"enabled": False})
        assert res.status_code == 200
        assert res.json()["enabled"] is False

        assert (await ac.delete(f"{base}/{wid}")).status_code == 204
        assert (await ac.get(base)).json() == []
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhooks_admin_only(db_session, seeded):
    _, outsider, project = seeded
    app.dependency_overrides[get_current_user] = lambda: outsider
    async with _client() as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/webhooks")
        assert res.status_code in (403, 404)
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_new_project_defaults_hide_done_to_14(db_session, seeded):
    """REQ-145."""
    admin, _, _ = seeded
    app.dependency_overrides[get_current_user] = lambda: admin
    async with _client() as ac:
        res = await ac.post("/api/v1/projects", json={"name": "Fresh"})
        assert res.status_code == 201
        assert res.json()["hide_done_after_days"] == 14
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_webhook_format_roundtrip(db_session, seeded):
    """REQ-146: format settable at create and via PATCH."""
    admin, _, project = seeded
    app.dependency_overrides[get_current_user] = lambda: admin
    async with _client() as ac:
        base = f"/api/v1/projects/{project.id}/webhooks"
        created = (await ac.post(base, json={
            "url": "https://hooks.slack.com/services/T0/B0/x",
            "events": ["task.completed"],
            "format": "slack",
        })).json()
        assert created["format"] == "slack"

        res = await ac.patch(f"{base}/{created['id']}", json={"format": "discord"})
        assert res.json()["format"] == "discord"

        res = await ac.post(base, json={"url": "https://x.example", "events": ["task.created"], "format": "carrier-pigeon"})
        assert res.status_code == 422
    app.dependency_overrides.clear()
