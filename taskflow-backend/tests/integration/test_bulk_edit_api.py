"""REQ-157 — bulk edit: per-row report, transition validation, no silent path (DD-050)."""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user, get_redis
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.project_status import ProjectStatus, ProjectTransitionRule, StatusCategory
from app.models.task import Task, TaskStatus
from app.models.tag import Tag, TagVisibility
from app.models.task_tag import TaskTag


class FakeRedis:
    def __init__(self):
        self.store = {}

    async def set(self, key, value, ex=None):
        self.store[key] = str(value)

    async def get(self, key):
        return self.store.get(key)

    async def exists(self, key):
        return 1 if key in self.store else 0


@pytest.fixture(autouse=True)
def _fake_redis():
    fake = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_redis, None)


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _auth_as(user):
    app.dependency_overrides[get_current_user] = lambda: user


async def _seed_open(db_session):
    user = User(email="bulk@taskflow.io", username="bulk", hashed_password="x",
                is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.flush()
    project = Project(name="Bulk", owner_id=user.id, key="BLK", next_sequence=4)
    db_session.add(project)
    await db_session.flush()
    tasks = [
        Task(project_id=project.id, title=f"t{i}", status=TaskStatus.todo, sequence_number=i)
        for i in (1, 2, 3)
    ]
    db_session.add_all(tasks)
    await db_session.commit()
    return user, project, tasks


@pytest.mark.asyncio
async def test_bulk_status_change_updates_all_and_stamps_completed(db_session):
    user, project, tasks = await _seed_open(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(t.id) for t in tasks], "changes": {"status": "done"}},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert sorted(body["updated"]) == sorted(str(t.id) for t in tasks)
        assert body["errors"] == []

    for t in tasks:
        await db_session.refresh(t)
        assert t.status == TaskStatus.done
        assert t.completed_at is not None
        assert t.version == 2  # server bumped OCC without client versions


@pytest.mark.asyncio
async def test_bulk_unknown_id_reported_not_fatal(db_session):
    user, project, tasks = await _seed_open(db_session)
    ghost = str(uuid.uuid4())
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(tasks[0].id), ghost], "changes": {"status": "in_progress"}},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["updated"] == [str(tasks[0].id)]
        assert len(body["errors"]) == 1 and body["errors"][0]["task_id"] == ghost


@pytest.mark.asyncio
async def test_bulk_assignee_and_tags(db_session):
    user, project, tasks = await _seed_open(db_session)
    tag = Tag(name="bulkable", color="#123456", project_id=project.id,
              owner_id=user.id, visibility=TagVisibility.workspace)
    db_session.add(tag)
    await db_session.flush()
    # pre-apply on task 0 so add is idempotent there
    db_session.add(TaskTag(task_id=tasks[0].id, tag_id=tag.id, added_by=user.id))
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={
                "task_ids": [str(tasks[0].id), str(tasks[1].id)],
                "changes": {"assignee_id": str(user.id), "add_tag_ids": [str(tag.id)]},
            },
        )
        assert resp.status_code == 200
        assert len(resp.json()["updated"]) == 2

    for t in tasks[:2]:
        await db_session.refresh(t)
        assert t.assignee_id == user.id
    rows = (await db_session.execute(
        select(TaskTag).where(TaskTag.tag_id == tag.id)
    )).scalars().all()
    assert len(rows) == 2  # idempotent add, no duplicate on task 0


@pytest.mark.asyncio
async def test_bulk_remove_tags(db_session):
    user, project, tasks = await _seed_open(db_session)
    tag = Tag(name="stale", color="#654321", project_id=project.id,
              owner_id=user.id, visibility=TagVisibility.workspace)
    db_session.add(tag)
    await db_session.flush()
    db_session.add_all([TaskTag(task_id=t.id, tag_id=tag.id, added_by=user.id) for t in tasks])
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(t.id) for t in tasks], "changes": {"remove_tag_ids": [str(tag.id)]}},
        )
        assert resp.status_code == 200

    rows = (await db_session.execute(select(TaskTag).where(TaskTag.tag_id == tag.id))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_bulk_enforced_transition_violations_reported_per_row(db_session):
    user, project, _ = await _seed_open(db_session)
    project.mode = "enforced"
    s_a = ProjectStatus(project_id=project.id, name="A", color="#111111", category=StatusCategory.unstarted, position=0)
    s_b = ProjectStatus(project_id=project.id, name="B", color="#222222", category=StatusCategory.started, position=1)
    s_c = ProjectStatus(project_id=project.id, name="C", color="#333333", category=StatusCategory.completed, position=2)
    db_session.add_all([s_a, s_b, s_c])
    await db_session.flush()
    # A may only go to B — a bulk move to C from A must be rejected for that row
    db_session.add(ProjectTransitionRule(project_id=project.id, from_status_id=s_a.id, to_status_id=s_b.id))
    blocked = Task(project_id=project.id, title="blocked", status=TaskStatus.todo,
                   custom_status_id=s_a.id, sequence_number=10)
    ok = Task(project_id=project.id, title="ok", status=TaskStatus.todo,
              custom_status_id=s_a.id, sequence_number=11)
    db_session.add_all([blocked, ok])
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # blocked → C (violates A→B-only rule); ok → B (allowed)
        resp_blocked = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(blocked.id)], "changes": {"custom_status_id": str(s_c.id)}},
        )
        resp_ok = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(ok.id)], "changes": {"custom_status_id": str(s_b.id)}},
        )

    assert resp_blocked.status_code == 200
    body = resp_blocked.json()
    assert body["updated"] == []
    assert len(body["errors"]) == 1 and body["errors"][0]["task_id"] == str(blocked.id)

    assert resp_ok.json()["updated"] == [str(ok.id)]


@pytest.mark.asyncio
async def test_bulk_cap_100(db_session):
    user, project, tasks = await _seed_open(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(uuid.uuid4()) for _ in range(101)], "changes": {"status": "done"}},
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_bulk_viewer_forbidden(db_session):
    user, project, tasks = await _seed_open(db_session)
    viewer = User(email="viewer@taskflow.io", hashed_password="x", is_verified=True, is_active=True)
    db_session.add(viewer)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=viewer.id, role=MemberRole.viewer))
    await db_session.commit()

    _auth_as(viewer)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/bulk",
            json={"task_ids": [str(tasks[0].id)], "changes": {"status": "done"}},
        )
        assert resp.status_code == 403
