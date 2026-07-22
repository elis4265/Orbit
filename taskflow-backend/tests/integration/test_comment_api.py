import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from app.models.email_verification import EmailVerification

pytestmark = pytest.mark.integration


# ─── helpers ────────────────────────────────────────────────────────────────

async def _register_login(ac: AsyncClient, db_session, email: str, password: str = "Password1"):
    # Uniquify so the suite is isolation-independent (drop_all is unreliable under
    # USE_TESTCONTAINERS=0; these tests otherwise reuse fixed emails and collide).
    local, domain = email.split("@")
    email = f"{local}_{uuid.uuid4().hex[:6]}@{domain}"
    username = email.split("@")[0].replace(".", "_")
    await ac.post("/api/v1/auth/register", json={"email": email, "username": username, "password": password, "first_name": "Test", "last_name": "User"})
    user = (await db_session.execute(select(User).where(User.email == email))).scalars().first()
    ev = (await db_session.execute(
        select(EmailVerification)
        .where(EmailVerification.user_id == user.id, EmailVerification.used == False)  # noqa: E712
        .order_by(EmailVerification.created_at.desc())
    )).scalars().first()
    await ac.post("/api/v1/auth/verify-email", json={"email": email, "code": ev.code, "new_password": password})
    resp = await ac.post("/api/v1/auth/login", data={"username": email, "password": password})
    return resp.json()["access_token"]


async def _setup(ac: AsyncClient, db_session, email: str = "owner@test.io"):
    token = await _register_login(ac, db_session, email)
    headers = {"Authorization": f"Bearer {token}"}
    ws = (await ac.post("/api/v1/projects", json={"name": "WS"}, headers=headers)).json()
    board = (await ac.post(f"/api/v1/projects/{ws['id']}/boards", json={"name": "B"}, headers=headers)).json()
    task = (await ac.post(
        f"/api/v1/projects/{ws['id']}/boards/{board['id']}/tasks",
        json={"title": "Task 1"},
        headers=headers,
    )).json()
    return token, ws, board, task


def _base(ws, board, task):
    return f"/api/v1/projects/{ws['id']}/tasks/{task['id']}/comments"


# ─── list ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_comments_empty(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        r = await ac.get(_base(ws, board, task), headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json() == []


# ─── create ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_comment(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        r = await ac.post(
            _base(ws, board, task),
            json={"content": "<p>hello world</p>"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["content"] == "<p>hello world</p>"
        assert data["task_id"] == task["id"]
        assert data["edited_at"] is None


@pytest.mark.asyncio
async def test_viewer_cannot_create_comment(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        viewer_token = await _register_login(ac, db_session, "viewer@test.io")
        viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
        owner_headers = {"Authorization": f"Bearer {token}"}

        viewer_resp = (await ac.get("/api/v1/auth/me", headers=viewer_headers)).json()
        await ac.post(
            f"/api/v1/projects/{ws['id']}/invites",
            json={"email": "viewer@test.io"},
            headers=owner_headers,
        )
        invite_token = (await ac.post(
            f"/api/v1/projects/{ws['id']}/invites",
            json={"email": "viewer@test.io"},
            headers=owner_headers,
        )).json().get("token")

        # Accept invite
        if invite_token:
            await ac.post(f"/api/v1/invites/{invite_token}/accept", headers=viewer_headers)

        # Promote to viewer role
        await ac.patch(
            f"/api/v1/projects/{ws['id']}/members/{viewer_resp['id']}",
            json={"role": "viewer"},
            headers=owner_headers,
        )

        r = await ac.post(
            _base(ws, board, task),
            json={"content": "<p>viewer comment</p>"},
            headers=viewer_headers,
        )
        assert r.status_code == 403


# ─── edit ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_edit_comment_by_author(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        headers = {"Authorization": f"Bearer {token}"}
        create_r = await ac.post(_base(ws, board, task), json={"content": "<p>original</p>"}, headers=headers)
        comment_id = create_r.json()["id"]

        r = await ac.patch(
            f"{_base(ws, board, task)}/{comment_id}",
            json={"content": "<p>edited</p>"},
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["content"] == "<p>edited</p>"
        assert r.json()["edited_at"] is not None


@pytest.mark.asyncio
async def test_edit_comment_by_non_author_fails(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        owner_headers = {"Authorization": f"Bearer {token}"}

        other_token = await _register_login(ac, db_session, "other@test.io")
        other_resp = (await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {other_token}"})).json()
        invite_r = await ac.post(
            f"/api/v1/projects/{ws['id']}/invites",
            json={"email": "other@test.io"},
            headers=owner_headers,
        )
        await ac.post(f"/api/v1/invites/{invite_r.json()['token']}/accept", headers={"Authorization": f"Bearer {other_token}"})

        create_r = await ac.post(_base(ws, board, task), json={"content": "<p>owner comment</p>"}, headers=owner_headers)
        comment_id = create_r.json()["id"]

        r = await ac.patch(
            f"{_base(ws, board, task)}/{comment_id}",
            json={"content": "<p>hacked</p>"},
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert r.status_code == 403


# ─── delete ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_comment_by_author(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        headers = {"Authorization": f"Bearer {token}"}
        comment_id = (await ac.post(_base(ws, board, task), json={"content": "<p>bye</p>"}, headers=headers)).json()["id"]

        r = await ac.delete(f"{_base(ws, board, task)}/{comment_id}", headers=headers)
        assert r.status_code == 204

        listed = await ac.get(_base(ws, board, task), headers=headers)
        assert all(c["id"] != comment_id for c in listed.json())


@pytest.mark.asyncio
async def test_delete_comment_by_admin(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        owner_headers = {"Authorization": f"Bearer {token}"}

        member_token = await _register_login(ac, db_session, "member@test.io")
        member_headers = {"Authorization": f"Bearer {member_token}"}
        invite_r = await ac.post(
            f"/api/v1/projects/{ws['id']}/invites",
            json={"email": "member@test.io"},
            headers=owner_headers,
        )
        await ac.post(f"/api/v1/invites/{invite_r.json()['token']}/accept", headers=member_headers)

        # member creates a comment
        comment_id = (await ac.post(_base(ws, board, task), json={"content": "<p>member note</p>"}, headers=member_headers)).json()["id"]

        # owner (admin) deletes it
        r = await ac.delete(f"{_base(ws, board, task)}/{comment_id}", headers=owner_headers)
        assert r.status_code == 204


# ─── history ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_edit_history_recorded(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, ws, board, task = await _setup(ac, db_session)
        headers = {"Authorization": f"Bearer {token}"}
        comment_id = (await ac.post(_base(ws, board, task), json={"content": "<p>v1</p>"}, headers=headers)).json()["id"]

        await ac.patch(f"{_base(ws, board, task)}/{comment_id}", json={"content": "<p>v2</p>"}, headers=headers)
        await ac.patch(f"{_base(ws, board, task)}/{comment_id}", json={"content": "<p>v3</p>"}, headers=headers)

        r = await ac.get(f"{_base(ws, board, task)}/{comment_id}/history", headers=headers)
        assert r.status_code == 200
        history = r.json()
        assert len(history) == 2
        # newest edit first
        assert history[0]["content"] == "<p>v2</p>"
        assert history[1]["content"] == "<p>v1</p>"
