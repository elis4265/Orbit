"""REQ-142 — My Work: created_by auto-set + /users/me/tasks facets."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.project_member import ProjectMember, MemberRole
from app.models.task_watcher import TaskWatcher
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    """me: owns P1, member of P2; stranger owns P3 (me has no access)."""
    users = UserRepository(db_session)
    me = await users.create({"email": f"me_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    other = await users.create({"email": f"ot_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})

    projects = ProjectRepository(db_session)
    p1 = await projects.create({"key": "P1", "name": "Mine", "owner_id": me.id})
    p2 = await projects.create({"key": "P2", "name": "Joined", "owner_id": other.id})
    p3 = await projects.create({"key": "P3", "name": "Foreign", "owner_id": other.id})
    db_session.add(ProjectMember(project_id=p2.id, user_id=me.id, role=MemberRole.member))
    await db_session.commit()

    for p in (p1, p2, p3):
        await BoardRepository(db_session).create({"name": "Main", "project_id": p.id})
    return me, other, p1, p2, p3


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_created_by_is_set_automatically(db_session, seeded):
    me, _, p1, _, __ = seeded
    app.dependency_overrides[get_current_user] = lambda: me
    boards = await BoardRepository(db_session).get_by_project(p1.id)
    async with _client() as ac:
        res = await ac.post(
            f"/api/v1/projects/{p1.id}/boards/{boards[0].id}/tasks",
            json={"title": "Track my creator"},
        )
        assert res.status_code == 201
        assert res.json()["created_by"] == str(me.id)
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_my_tasks_facets(db_session, seeded):
    me, other, p1, p2, p3 = seeded
    tasks = TaskRepository(db_session)

    assigned_p1 = await tasks.create_with_sequence(p1.id, {"project_id": p1.id, "title": "A1", "assignee_id": me.id})
    assigned_p2 = await tasks.create_with_sequence(p2.id, {"project_id": p2.id, "title": "A2", "assignee_id": me.id})
    # Assigned to me in a project I can't access — must never leak.
    assigned_p3 = await tasks.create_with_sequence(p3.id, {"project_id": p3.id, "title": "A3", "assignee_id": me.id})
    created_p2 = await tasks.create_with_sequence(p2.id, {"project_id": p2.id, "title": "C2", "created_by": me.id})
    other_task = await tasks.create_with_sequence(p2.id, {"project_id": p2.id, "title": "O1", "created_by": other.id})
    db_session.add(TaskWatcher(task_id=other_task.id, user_id=me.id))
    await db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: me
    async with _client() as ac:
        # default facet = assigned
        res = await ac.get("/api/v1/users/me/tasks")
        assert res.status_code == 200
        ids = {t["id"] for t in res.json()}
        assert str(assigned_p1.id) in ids
        assert str(assigned_p2.id) in ids
        assert str(assigned_p3.id) not in ids  # no access to P3

        res = await ac.get("/api/v1/users/me/tasks?facet=created")
        ids = {t["id"] for t in res.json()}
        assert str(created_p2.id) in ids
        assert str(other_task.id) not in ids

        res = await ac.get("/api/v1/users/me/tasks?facet=watching")
        ids = {t["id"] for t in res.json()}
        assert ids == {str(other_task.id)}

        res = await ac.get("/api/v1/users/me/tasks?facet=nonsense")
        assert res.status_code == 422
    app.dependency_overrides.clear()
