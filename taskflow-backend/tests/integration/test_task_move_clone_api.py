"""REQ-156 — clone within a project, move across projects (DD-049)."""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user, get_redis
from app.models.user import User
from app.models.project import Project
from app.models.task import Task, TaskStatus, IssueType
from app.models.tag import Tag, TagVisibility
from app.models.task_tag import TaskTag
from app.models.task_link import TaskLink
from app.models.comment import Comment
from app.models.project_member import ProjectMember, MemberRole


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


async def _seed(db_session):
    """User owning two projects; source has a task with tag, child, comment, link."""
    user = User(email="mover@taskflow.io", username="mover", hashed_password="x",
                is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.flush()

    src = Project(name="Source", owner_id=user.id, key="SRC", next_sequence=1)
    dst = Project(name="Target", owner_id=user.id, key="DST", next_sequence=1)
    db_session.add_all([src, dst])
    await db_session.flush()

    task = Task(project_id=src.id, title="Move me", status=TaskStatus.in_progress,
                issue_type=IssueType.task, sequence_number=1, estimate=5, created_by=user.id)
    src.next_sequence = 2
    db_session.add(task)
    await db_session.flush()

    child = Task(project_id=src.id, title="checklist item", status=TaskStatus.done,
                 parent_id=task.id, sequence_number=2)
    other = Task(project_id=src.id, title="linked", sequence_number=3)
    src.next_sequence = 4
    tag = Tag(name="backend", color="#ff0000", project_id=src.id,
              owner_id=user.id, visibility=TagVisibility.workspace)
    db_session.add_all([child, other, tag])
    await db_session.flush()

    db_session.add_all([
        TaskTag(task_id=task.id, tag_id=tag.id, added_by=user.id),
        TaskLink(source_id=task.id, target_id=other.id, link_type="blocks"),
        Comment(task_id=task.id, author_id=user.id, content="<p>hi</p>"),
    ])
    await db_session.commit()
    return user, src, dst, task, child, tag


def _auth_as(user):
    app.dependency_overrides[get_current_user] = lambda: user


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_clone_copies_fields_children_tags_but_not_comments(db_session):
    user, src, dst, task, child, tag = await _seed(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/projects/{src.id}/tasks/{task.id}/clone")
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Move me"
        assert body["id"] != str(task.id)
        assert body["sequence_number"] not in (task.sequence_number,)
        assert body["status"] == "todo"  # status is NOT copied
        assert body["estimate"] == 5

    clone_id = uuid.UUID(body["id"])
    children = (await db_session.execute(
        select(Task).where(Task.parent_id == clone_id)
    )).scalars().all()
    assert [c.title for c in children] == ["checklist item"]
    assert children[0].status == TaskStatus.done  # checklist state preserved

    tag_rows = (await db_session.execute(
        select(TaskTag).where(TaskTag.task_id == clone_id)
    )).scalars().all()
    assert [t.tag_id for t in tag_rows] == [tag.id]

    comments = (await db_session.execute(
        select(Comment).where(Comment.task_id == clone_id)
    )).scalars().all()
    assert comments == []


@pytest.mark.asyncio
async def test_move_rekeys_remaps_and_travels(db_session):
    user, src, dst, task, child, tag = await _seed(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{src.id}/tasks/{task.id}/move",
            json={"target_project_id": str(dst.id)},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["project_id"] == str(dst.id)
        assert body["sequence_number"] == 1  # re-keyed in target
        assert body["sprint_id"] is None

    await db_session.refresh(task)
    assert task.project_id == dst.id
    # direct child travelled, re-keyed too
    await db_session.refresh(child)
    assert child.project_id == dst.id
    # tag dropped — target has no tag of that name
    tag_rows = (await db_session.execute(
        select(TaskTag).where(TaskTag.task_id == task.id)
    )).scalars().all()
    assert tag_rows == []
    # task links dropped
    links = (await db_session.execute(
        select(TaskLink).where((TaskLink.source_id == task.id) | (TaskLink.target_id == task.id))
    )).scalars().all()
    assert links == []
    # comments travelled (task_id unchanged)
    comments = (await db_session.execute(
        select(Comment).where(Comment.task_id == task.id)
    )).scalars().all()
    assert len(comments) == 1


@pytest.mark.asyncio
async def test_move_matches_tags_by_name_in_target(db_session):
    user, src, dst, task, child, tag = await _seed(db_session)
    dst_tag = Tag(name="Backend", color="#00ff00", project_id=dst.id,
                  owner_id=user.id, visibility=TagVisibility.workspace)
    db_session.add(dst_tag)
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{src.id}/tasks/{task.id}/move",
            json={"target_project_id": str(dst.id)},
        )
        assert resp.status_code == 200

    tag_rows = (await db_session.execute(
        select(TaskTag).where(TaskTag.task_id == task.id)
    )).scalars().all()
    assert [t.tag_id for t in tag_rows] == [dst_tag.id]  # case-insensitive name match


@pytest.mark.asyncio
async def test_move_requires_membership_in_target(db_session):
    user, src, dst, task, *_ = await _seed(db_session)
    stranger_project = Project(name="NotMine", owner_id=(await _other_user(db_session)).id,
                               key="NOPE", next_sequence=1)
    db_session.add(stranger_project)
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{src.id}/tasks/{task.id}/move",
            json={"target_project_id": str(stranger_project.id)},
        )
        assert resp.status_code == 403


async def _other_user(db_session) -> User:
    u = User(email=f"other-{uuid.uuid4().hex[:6]}@taskflow.io", hashed_password="x",
             is_verified=True, is_active=True)
    db_session.add(u)
    await db_session.flush()
    return u


@pytest.mark.asyncio
async def test_move_viewer_in_target_forbidden(db_session):
    user, src, dst, task, *_ = await _seed(db_session)
    viewer_target = Project(name="ViewerOnly", owner_id=(await _other_user(db_session)).id,
                            key="VIEW", next_sequence=1)
    db_session.add(viewer_target)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=viewer_target.id, user_id=user.id, role=MemberRole.viewer))
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{src.id}/tasks/{task.id}/move",
            json={"target_project_id": str(viewer_target.id)},
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_move_to_same_project_400(db_session):
    user, src, dst, task, *_ = await _seed(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{src.id}/tasks/{task.id}/move",
            json={"target_project_id": str(src.id)},
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_move_with_grandchildren_409(db_session):
    user, src, dst, task, child, tag = await _seed(db_session)
    grandchild = Task(project_id=src.id, title="grandchild", parent_id=child.id, sequence_number=4)
    src.next_sequence = 5
    db_session.add(grandchild)
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{src.id}/tasks/{task.id}/move",
            json={"target_project_id": str(dst.id)},
        )
        assert resp.status_code == 409
