"""Custom reaction emotes (REQ-162 extension, Teams model).

Storage calls (MinIO) are patched so tests run without a real MinIO instance.
"""
import io
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.task import Task
from app.models.comment import Comment
from app.models.comment_reaction import CommentReaction
from app.models.custom_emote import CustomEmote

STORAGE = "app.api.routers.emote"


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session):
    owner = User(email="emoteowner@taskflow.io", username="emoteowner", hashed_password="x",
                 is_verified=True, is_active=True)
    buddy = User(email="emotebuddy@taskflow.io", username="emotebuddy", hashed_password="x",
                 is_verified=True, is_active=True)
    db_session.add_all([owner, buddy])
    await db_session.flush()
    project = Project(name="Emotes", owner_id=owner.id, key="EMO", next_sequence=2)
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=buddy.id, role=MemberRole.member))
    task = Task(project_id=project.id, title="Emotable", sequence_number=1)
    db_session.add(task)
    await db_session.flush()
    comment = Comment(task_id=task.id, author_id=owner.id, content="<p>react to me</p>")
    db_session.add(comment)
    await db_session.commit()
    return owner, buddy, project, task, comment


def _emote_file(name="party_pig", content=b"\x89PNG fake", content_type="image/png"):
    return {"name": (None, name), "file": ("pig.png", io.BytesIO(content), content_type)}


def _base(project):
    return f"/api/v1/projects/{project.id}/emotes"


@pytest.mark.asyncio
async def test_upload_and_list(db_session):
    owner, buddy, project, task, comment = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: buddy  # member can upload
    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock) as up:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(_base(project), files=_emote_file())
            assert resp.status_code == 201
            data = resp.json()
            assert data["name"] == "party_pig"
            assert data["url"].endswith(f"/emotes/{data['id']}/image")
            up.assert_awaited_once()

            listed = await ac.get(_base(project))
            assert [e["name"] for e in listed.json()] == ["party_pig"]


@pytest.mark.asyncio
async def test_upload_validation(db_session):
    owner, buddy, project, task, comment = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # bad name (uppercase / too short)
            assert (await ac.post(_base(project), files=_emote_file(name="Bad Name"))).status_code == 422
            assert (await ac.post(_base(project), files=_emote_file(name="x"))).status_code == 422
            # unsupported content type
            assert (await ac.post(
                _base(project), files={"name": (None, "svg_pig"), "file": ("p.svg", io.BytesIO(b"<svg/>"), "image/svg+xml")}
            )).status_code == 422
            # oversize (>256 KB)
            assert (await ac.post(
                _base(project), files=_emote_file(name="fat_pig", content=b"0" * (256 * 1024 + 1))
            )).status_code == 413
            # duplicate name
            assert (await ac.post(_base(project), files=_emote_file(name="dup_pig"))).status_code == 201
            assert (await ac.post(_base(project), files=_emote_file(name="dup_pig"))).status_code == 409


@pytest.mark.asyncio
async def test_react_with_custom_emote_and_aggregate_order(db_session):
    owner, buddy, project, task, comment = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            await ac.post(_base(project), files=_emote_file(name="ship_it"))
            r_base = f"/api/v1/projects/{project.id}/tasks/{task.id}/comments/{comment.id}/reactions"
            # curated + custom on the same comment
            assert (await ac.post(r_base, json={"emoji": "🚀"})).status_code == 200
            resp = await ac.post(r_base, json={"emoji": ":ship_it:"})
            assert resp.status_code == 200
            aggregates = resp.json()
            # curated order first, customs after
            assert [a["emoji"] for a in aggregates] == ["🚀", ":ship_it:"]
            assert aggregates[1]["me"] is True

            # unknown custom emote is rejected
            assert (await ac.post(r_base, json={"emoji": ":ghost_pig:"})).status_code == 404
            # malformed shape is rejected by schema
            assert (await ac.post(r_base, json={"emoji": ":BAD NAME:"})).status_code == 422


@pytest.mark.asyncio
async def test_delete_cascades_reactions_and_requires_uploader_or_admin(db_session):
    owner, buddy, project, task, comment = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: buddy
    with (
        patch(f"{STORAGE}.upload_file", new_callable=AsyncMock),
        patch(f"{STORAGE}.delete_file", new_callable=AsyncMock) as rm,
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            created = (await ac.post(_base(project), files=_emote_file(name="doomed"))).json()
            r_base = f"/api/v1/projects/{project.id}/tasks/{task.id}/comments/{comment.id}/reactions"
            assert (await ac.post(r_base, json={"emoji": ":doomed:"})).status_code == 200

            # owner (admin) may delete buddy's emote; reactions cascade
            app.dependency_overrides[get_current_user] = lambda: owner
            assert (await ac.delete(f"{_base(project)}/{created['id']}")).status_code == 204
            rm.assert_awaited_once()

    rows = (await db_session.execute(
        select(CommentReaction).where(CommentReaction.emoji == ":doomed:")
    )).scalars().all()
    assert rows == []
    emotes = (await db_session.execute(select(CustomEmote))).scalars().all()
    assert emotes == []


@pytest.mark.asyncio
async def test_delete_forbidden_for_non_uploader_member(db_session):
    owner, buddy, project, task, comment = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    with patch(f"{STORAGE}.upload_file", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            created = (await ac.post(_base(project), files=_emote_file(name="owners_pig"))).json()
            # buddy is a plain member and not the uploader → 403
            app.dependency_overrides[get_current_user] = lambda: buddy
            assert (await ac.delete(f"{_base(project)}/{created['id']}")).status_code == 403


@pytest.mark.asyncio
async def test_image_streams_and_404s(db_session):
    owner, buddy, project, task, comment = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: owner
    with (
        patch(f"{STORAGE}.upload_file", new_callable=AsyncMock),
        patch(f"{STORAGE}.download_file", new_callable=AsyncMock, return_value=b"\x89PNG bytes"),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            created = (await ac.post(_base(project), files=_emote_file(name="visible"))).json()
            img = await ac.get(f"{_base(project)}/{created['id']}/image")
            assert img.status_code == 200
            assert img.headers["content-type"] == "image/png"
            assert img.content == b"\x89PNG bytes"

            missing = await ac.get(f"{_base(project)}/00000000-0000-0000-0000-000000000000/image")
            assert missing.status_code == 404
