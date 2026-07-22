"""REQ-163 — public share links: admin mint/revoke, strict public payload."""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.task import Task, TaskStatus
from app.models.comment import Comment
from app.models.work_log import WorkLog


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session):
    owner = User(email="sharer@taskflow.io", username="sharer", hashed_password="x",
                 is_verified=True, is_active=True)
    member = User(email="pleb@taskflow.io", username="pleb", hashed_password="x",
                  is_verified=True, is_active=True)
    db_session.add_all([owner, member])
    await db_session.flush()
    project = Project(name="Shared", owner_id=owner.id, key="SHR", next_sequence=2)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=member.id, role=MemberRole.member))
    task = Task(project_id=project.id, title="Public bug", description="<p>details</p>",
                status=TaskStatus.in_progress, sequence_number=1)
    db_session.add(task)
    await db_session.flush()
    db_session.add_all([
        Comment(task_id=task.id, author_id=owner.id, content="<p>internal note</p>"),
        WorkLog(task_id=task.id, user_id=owner.id, minutes=45),
    ])
    await db_session.commit()
    return owner, member, project, task


@pytest.mark.asyncio
async def test_admin_mints_link_and_public_payload_is_allowlisted(db_session):
    owner, member, project, task = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: owner
        resp = await ac.post(f"/api/v1/projects/{project.id}/tasks/{task.id}/share-links")
        assert resp.status_code == 201
        token = resp.json()["token"]
        assert len(token) >= 40  # 256-bit urlsafe

        # public read — NO auth override in effect for this route (no bearer sent)
        app.dependency_overrides.pop(get_current_user, None)
        pub = await ac.get(f"/api/v1/share/{token}")
        assert pub.status_code == 200
        body = pub.json()
        assert body["title"] == "Public bug"
        assert body["key"] == "SHR-1"
        assert body["comments"][0]["content"] == "<p>internal note</p>"
        # strict allowlist: no emails, no worklogs, no ids
        text = pub.text
        assert "sharer@taskflow.io" not in text
        assert "minutes" not in body
        assert "assignee" not in body


@pytest.mark.asyncio
async def test_member_cannot_mint_403(db_session):
    owner, member, project, task = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: member
        resp = await ac.post(f"/api/v1/projects/{project.id}/tasks/{task.id}/share-links")
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_revoked_and_unknown_are_indistinguishable_404(db_session):
    owner, member, project, task = await _seed(db_session)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        app.dependency_overrides[get_current_user] = lambda: owner
        created = (await ac.post(f"/api/v1/projects/{project.id}/tasks/{task.id}/share-links")).json()
        links = (await ac.get(f"/api/v1/projects/{project.id}/tasks/{task.id}/share-links")).json()
        assert len(links) == 1

        resp = await ac.delete(f"/api/v1/projects/{project.id}/tasks/{task.id}/share-links/{created['id']}")
        assert resp.status_code == 204

        app.dependency_overrides.pop(get_current_user, None)
        revoked = await ac.get(f"/api/v1/share/{created['token']}")
        unknown = await ac.get("/api/v1/share/definitely-not-a-token")
        assert revoked.status_code == 404
        assert unknown.status_code == 404
        assert revoked.json() == unknown.json()
