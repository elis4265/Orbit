"""Integration tests for /projects/{id}/task-templates — CRUD + tag_ids."""
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
    s = uuid.uuid4().hex[:6]
    user = await UserRepository(db_session).create({
        "email": f"tpl_{s}@test.io", "hashed_password": "h", "username": f"tpl_{s}",
        "first_name": "Tpl", "last_name": "User", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "TPL", "name": "Tpl Proj", "owner_id": user.id})
    return user, project


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_task_template_crud_and_tags(seeded, db_session):
    user, project = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/task-templates"
            tag = (await ac.post(f"/api/v1/projects/{project.id}/tags", json={"name": "triage", "color": "#ff8800"})).json()

            r = await ac.post(base, json={
                "name": "Bug report", "title": "[BUG] ", "description": "Steps",
                "issue_type": "bug", "severity": "high", "tag_ids": [tag["id"]],
            })
            assert r.status_code == 201
            body = r.json()
            tid = body["id"]
            assert body["issue_type"] == "bug"
            assert body["severity"] == "high"
            assert body["tag_ids"] == [tag["id"]]

            lst = await ac.get(base)
            assert lst.status_code == 200 and len(lst.json()) == 1

            up = await ac.patch(f"{base}/{tid}", json={"name": "Bug report v2", "severity": "critical"})
            assert up.status_code == 200
            assert up.json()["name"] == "Bug report v2" and up.json()["severity"] == "critical"

            assert (await ac.patch(f"{base}/{uuid.uuid4()}", json={"name": "x"})).status_code == 404
            assert (await ac.delete(f"{base}/{uuid.uuid4()}")).status_code == 404

            assert (await ac.delete(f"{base}/{tid}")).status_code == 204
            assert (await ac.get(base)).json() == []

            # invalid issue_type rejected by schema
            assert (await ac.post(base, json={"name": "X", "issue_type": "nope"})).status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)
