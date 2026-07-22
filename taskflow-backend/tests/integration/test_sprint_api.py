"""Integration tests for /projects/{id}/boards/{bid}/sprints — lifecycle."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    s = uuid.uuid4().hex[:6]
    user = await UserRepository(db_session).create({
        "email": f"spr_{s}@test.io", "hashed_password": "h", "username": f"spr_{s}",
        "first_name": "Spr", "last_name": "User", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "SPR", "name": "Sprint Proj", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Main", "project_id": project.id})
    return user, project, board


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_sprint_lifecycle(seeded, db_session):
    user, project, board = seeded
    base = f"/api/v1/projects/{project.id}/boards/{board.id}/sprints"
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            created = await ac.post(base, json={
                "name": "Sprint 1", "goal": "ship MVP",
                "start_date": "2026-07-01", "end_date": "2026-07-14",
            })
            assert created.status_code == 201
            sid = created.json()["id"]
            assert created.json()["status"] == "planned"

            lst = await ac.get(base)
            assert lst.status_code == 200 and len(lst.json()) == 1

            up = await ac.patch(f"{base}/{sid}", json={"name": "Sprint 1 — MVP"})
            assert up.status_code == 200 and up.json()["name"] == "Sprint 1 — MVP"

            act = await ac.post(f"{base}/{sid}/activate")
            assert act.status_code == 200 and act.json()["status"] == "active"

            closed = await ac.post(f"{base}/{sid}/close")
            assert closed.status_code == 200 and closed.json()["status"] == "closed"

            assert (await ac.patch(f"{base}/{uuid.uuid4()}", json={"name": "x"})).status_code == 404

            assert (await ac.delete(f"{base}/{sid}")).status_code == 204
            assert (await ac.get(base)).json() == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)
