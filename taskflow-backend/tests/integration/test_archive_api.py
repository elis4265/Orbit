"""REQ-161 — task archive: manual + auto, excluded from lists/search/stats by default."""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.task import Task, TaskStatus


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session):
    user = User(email="archivist@taskflow.io", username="archivist", hashed_password="x",
                is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.flush()
    project = Project(name="Archive", owner_id=user.id, key="ARC", next_sequence=3)
    db_session.add(project)
    await db_session.flush()
    done = Task(project_id=project.id, title="Old glory", status=TaskStatus.done,
                sequence_number=1, completed_at=datetime.now(timezone.utc) - timedelta(days=30))
    open_task = Task(project_id=project.id, title="Still hot", status=TaskStatus.todo, sequence_number=2)
    db_session.add_all([done, open_task])
    await db_session.commit()
    return user, project, done, open_task


@pytest.mark.asyncio
async def test_archive_unarchive_and_default_exclusion(db_session):
    user, project, done, open_task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/projects/{project.id}/tasks/{done.id}/archive")
        assert resp.status_code == 200
        assert resp.json()["archived_at"] is not None

        titles = [t["title"] for t in (await ac.get(f"/api/v1/projects/{project.id}/tasks")).json()]
        assert "Old glory" not in titles and "Still hot" in titles

        withab = [t["title"] for t in (await ac.get(
            f"/api/v1/projects/{project.id}/tasks?include_archived=true"
        )).json()]
        assert "Old glory" in withab

        # search never returns archived
        found = (await ac.get(f"/api/v1/projects/{project.id}/tasks/search?q=glory")).json()
        assert all(t["title"] != "Old glory" for t in found)

        resp = await ac.post(f"/api/v1/projects/{project.id}/tasks/{done.id}/unarchive")
        assert resp.status_code == 200
        titles = [t["title"] for t in (await ac.get(f"/api/v1/projects/{project.id}/tasks")).json()]
        assert "Old glory" in titles


@pytest.mark.asyncio
async def test_archive_requires_done_status(db_session):
    user, project, done, open_task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/projects/{project.id}/tasks/{open_task.id}/archive")
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_stats_exclude_archived(db_session):
    user, project, done, open_task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        def _total(stats: dict) -> int:
            return sum(s["count"] for s in stats["by_status"])

        before = (await ac.get(f"/api/v1/projects/{project.id}/stats")).json()
        await ac.post(f"/api/v1/projects/{project.id}/tasks/{done.id}/archive")
        after = (await ac.get(f"/api/v1/projects/{project.id}/stats")).json()
        assert _total(after) == _total(before) - 1


@pytest.mark.asyncio
async def test_project_setting_and_auto_archive_runner(db_session):
    user, project, done, open_task = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(f"/api/v1/projects/{project.id}", json={"auto_archive_after_days": 7})
        assert resp.status_code == 200

    from app.services.archive import auto_archive_due_tasks
    archived = await auto_archive_due_tasks(db_session)
    assert archived == 1  # only the 30-day-old done task

    await db_session.refresh(done)
    assert done.archived_at is not None
    await db_session.refresh(open_task)
    assert open_task.archived_at is None
