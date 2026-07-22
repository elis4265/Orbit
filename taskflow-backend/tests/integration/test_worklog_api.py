"""REQ-147 — work logs: create/list/total, author-only delete, time report."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository
from app.models.project_member import ProjectMember, MemberRole

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    users = UserRepository(db_session)
    owner = await users.create({"email": f"wl_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    mate = await users.create({"email": f"wm_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    project = await ProjectRepository(db_session).create({"key": "WL", "name": "P", "owner_id": owner.id})
    db_session.add(ProjectMember(project_id=project.id, user_id=mate.id, role=MemberRole.member))
    await db_session.commit()
    await BoardRepository(db_session).create({"name": "B", "project_id": project.id})
    task = await TaskRepository(db_session).create_with_sequence(project.id, {"project_id": project.id, "title": "T"})
    return owner, mate, project, task


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_worklog_lifecycle_and_total(db_session, seeded):
    owner, mate, project, task = seeded
    base = f"/api/v1/projects/{project.id}/tasks/{task.id}/worklogs"

    app.dependency_overrides[get_current_user] = lambda: owner
    async with _client() as ac:
        res = await ac.post(base, json={"minutes": 90, "note": "root cause", "spent_on": "2026-07-01"})
        assert res.status_code == 201
        assert res.json()["minutes"] == 90
        owner_log = res.json()["id"]

        # invalid durations rejected
        assert (await ac.post(base, json={"minutes": 0})).status_code == 422
        assert (await ac.post(base, json={"minutes": -5})).status_code == 422

    app.dependency_overrides[get_current_user] = lambda: mate
    async with _client() as ac:
        await ac.post(base, json={"minutes": 30})

        res = await ac.get(base)
        data = res.json()
        assert data["total_minutes"] == 120
        assert len(data["entries"]) == 2

        # author-only delete: mate cannot delete owner's entry
        assert (await ac.delete(f"{base}/{owner_log}")).status_code == 403

    app.dependency_overrides[get_current_user] = lambda: owner
    async with _client() as ac:
        assert (await ac.delete(f"{base}/{owner_log}")).status_code == 204
        assert (await ac.get(base)).json()["total_minutes"] == 30
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_time_report_per_user_and_range(db_session, seeded):
    owner, mate, project, task = seeded
    base = f"/api/v1/projects/{project.id}/tasks/{task.id}/worklogs"

    app.dependency_overrides[get_current_user] = lambda: owner
    async with _client() as ac:
        await ac.post(base, json={"minutes": 60, "spent_on": "2026-06-01"})
        await ac.post(base, json={"minutes": 45, "spent_on": "2026-07-01"})
    app.dependency_overrides[get_current_user] = lambda: mate
    async with _client() as ac:
        await ac.post(base, json={"minutes": 15, "spent_on": "2026-07-01"})

        res = await ac.get(f"/api/v1/projects/{project.id}/stats/time-report")
        data = res.json()
        assert data["total_minutes"] == 120
        by_user = {r["user_id"]: r["total_minutes"] for r in data["rows"]}
        assert by_user[str(owner.id)] == 105
        assert by_user[str(mate.id)] == 15

        # range filter drops the June entry
        res = await ac.get(f"/api/v1/projects/{project.id}/stats/time-report?from=2026-07-01")
        assert res.json()["total_minutes"] == 60
    app.dependency_overrides.pop(get_current_user, None)
