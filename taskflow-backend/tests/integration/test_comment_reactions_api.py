"""REQ-162 — emoji reactions on comments (curated set, toggle via POST/DELETE)."""
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.task import Task
from app.models.comment import Comment


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session):
    owner = User(email="owner@taskflow.io", username="owner", hashed_password="x",
                 is_verified=True, is_active=True)
    buddy = User(email="buddy@taskflow.io", username="buddy", hashed_password="x",
                 is_verified=True, is_active=True)
    viewer = User(email="viewer@taskflow.io", username="viewer", hashed_password="x",
                  is_verified=True, is_active=True)
    db_session.add_all([owner, buddy, viewer])
    await db_session.flush()
    project = Project(name="Reactions", owner_id=owner.id, key="RCT", next_sequence=2)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=buddy.id, role=MemberRole.member),
        ProjectMember(project_id=project.id, user_id=viewer.id, role=MemberRole.viewer),
    ])
    task = Task(project_id=project.id, title="Discussed", sequence_number=1)
    db_session.add(task)
    await db_session.flush()
    comment = Comment(task_id=task.id, author_id=owner.id, content="<p>hot take</p>")
    db_session.add(comment)
    await db_session.commit()
    return owner, buddy, viewer, project, task, comment


def _base(project, task, comment):
    return f"/api/v1/projects/{project.id}/tasks/{task.id}/comments/{comment.id}/reactions"


@pytest.mark.asyncio
async def test_react_aggregate_and_me_flag(db_session):
    owner, buddy, viewer, project, task, comment = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: owner
        assert (await ac.post(_base(project, task, comment), json={"emoji": "🚀"})).status_code == 200

        app.dependency_overrides[get_current_user] = lambda: buddy
        assert (await ac.post(_base(project, task, comment), json={"emoji": "🚀"})).status_code == 200

        comments = (await ac.get(
            f"/api/v1/projects/{project.id}/tasks/{task.id}/comments"
        )).json()
        reactions = comments[0]["reactions"]
        assert reactions == [{"emoji": "🚀", "count": 2, "me": True}]

        # idempotent add — same user, same emoji → still count 2
        assert (await ac.post(_base(project, task, comment), json={"emoji": "🚀"})).status_code == 200
        comments = (await ac.get(
            f"/api/v1/projects/{project.id}/tasks/{task.id}/comments"
        )).json()
        assert comments[0]["reactions"][0]["count"] == 2


@pytest.mark.asyncio
async def test_delete_removes_own_reaction_only(db_session):
    owner, buddy, viewer, project, task, comment = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: owner
        await ac.post(_base(project, task, comment), json={"emoji": "❤️"})
        app.dependency_overrides[get_current_user] = lambda: buddy
        await ac.post(_base(project, task, comment), json={"emoji": "❤️"})

        resp = await ac.request("DELETE", _base(project, task, comment), json={"emoji": "❤️"})
        assert resp.status_code == 200

        comments = (await ac.get(
            f"/api/v1/projects/{project.id}/tasks/{task.id}/comments"
        )).json()
        assert comments[0]["reactions"] == [{"emoji": "❤️", "count": 1, "me": False}]


@pytest.mark.asyncio
async def test_freeform_emoji_rejected_and_viewer_forbidden(db_session):
    owner, buddy, viewer, project, task, comment = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: owner
        assert (await ac.post(_base(project, task, comment), json={"emoji": "🥵"})).status_code == 422

        app.dependency_overrides[get_current_user] = lambda: viewer
        assert (await ac.post(_base(project, task, comment), json={"emoji": "🚀"})).status_code == 403
