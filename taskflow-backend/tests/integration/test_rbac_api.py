"""
RBAC integration tests — REQ-038–042.

Role tiers:
  admin   — workspace settings, board CRUD, invite, remove, promote
  member  — task/subtask mutations
  viewer  — read only

Setup helpers register+verify+login three users:
  user_admin  — workspace creator (auto-admin)
  user_member — invited, default role=member
  user_viewer — invited, promoted to viewer after joining
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from app.models.email_verification import EmailVerification


# ─── helpers ─────────────────────────────────────────────────────────────────

async def _register_and_login(ac, db_session, email, password, username=None):
    uname = username or email.split("@")[0].replace(".", "_")
    await ac.post("/api/v1/auth/register", json={"email": email, "username": uname, "password": password, "first_name": "Test", "last_name": "User"})
    user = (await db_session.execute(select(User).where(User.email == email))).scalars().first()
    ev = (await db_session.execute(
        select(EmailVerification)
        .where(EmailVerification.user_id == user.id, EmailVerification.used == False)  # noqa: E712
        .order_by(EmailVerification.created_at.desc())
    )).scalars().first()
    await ac.post("/api/v1/auth/verify-email", json={"email": email, "code": ev.code, "new_password": password})
    # HW-37: project creation is superuser-only. Promoting every test user is safe
    # for these RBAC cases — project deps never consult is_superuser (DD-048).
    user.is_superuser = True
    await db_session.commit()
    resp = await ac.post("/api/v1/auth/login", data={"username": email, "password": password})
    return resp.json()["access_token"]


async def _create_workspace(ac, token, name="RBAC WS"):
    resp = await ac.post("/api/v1/projects", json={"name": name},
                         headers={"Authorization": f"Bearer {token}"})
    return resp.json()["id"]


async def _create_board(ac, token, project_id, name="Board"):
    resp = await ac.post(f"/api/v1/projects/{project_id}/boards", json={"name": name},
                         headers={"Authorization": f"Bearer {token}"})
    return resp.json()["id"]


async def _invite_and_accept(ac, db_session, admin_token, project_id, email, password):
    """Admin invites email; invitee registers, verifies, logs in, then accepts."""
    token = await _register_and_login(ac, db_session, email, password)
    await ac.post(f"/api/v1/projects/{project_id}/invites",
                  json={"email": email},
                  headers={"Authorization": f"Bearer {admin_token}"})
    from app.models.project_invite import ProjectInvite
    invite = (await db_session.execute(
        select(ProjectInvite).where(ProjectInvite.email == email)
    )).scalars().first()
    await ac.post(f"/api/v1/invites/{invite.token}/accept",
                  headers={"Authorization": f"Bearer {token}"})
    return token


# ─── REQ-038: creator role ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_creator_has_admin_role(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "creator@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)

        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        members = resp.json()
        me = next(m for m in members if m["role"] == "owner")
        assert me is not None


# ─── REQ-038: invited member default role ────────────────────────────────────

@pytest.mark.asyncio
async def test_invited_member_gets_member_role(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin2@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        await _invite_and_accept(ac, db_session, admin_token, ws_id, "newmember@rbac.io", "Password1!")

        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        members = resp.json()
        invited = next(m for m in members if "newmember" in m["email"])
        assert invited["role"] == "member"


# ─── REQ-039: viewer cannot mutate tasks ─────────────────────────────────────

@pytest.mark.asyncio
async def test_viewer_cannot_create_task(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin3@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        board_id = await _create_board(ac, admin_token, ws_id)
        viewer_token = await _invite_and_accept(ac, db_session, admin_token, ws_id, "viewer@rbac.io", "Password1!")

        # Promote to viewer
        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        viewer_id = next(m["id"] for m in resp.json() if "viewer" in m["email"])
        await ac.patch(f"/api/v1/projects/{ws_id}/members/{viewer_id}",
                       json={"role": "viewer"},
                       headers={"Authorization": f"Bearer {admin_token}"})

        create_resp = await ac.post(
            f"/api/v1/projects/{ws_id}/boards/{board_id}/tasks",
            json={"title": "Sneaky task"},
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert create_resp.status_code == 403
        assert create_resp.json()["error"]["code"] == "INSUFFICIENT_ROLE"


# ─── REQ-039: member can create task ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_member_can_create_task(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin4@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        board_id = await _create_board(ac, admin_token, ws_id)
        member_token = await _invite_and_accept(ac, db_session, admin_token, ws_id, "member@rbac.io", "Password1!")

        resp = await ac.post(
            f"/api/v1/projects/{ws_id}/boards/{board_id}/tasks",
            json={"title": "Valid task"},
            headers={"Authorization": f"Bearer {member_token}"},
        )
        assert resp.status_code == 201


# ─── REQ-039: member cannot invite ───────────────────────────────────────────

@pytest.mark.asyncio
async def test_member_cannot_invite(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin5@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        member_token = await _invite_and_accept(ac, db_session, admin_token, ws_id, "member2@rbac.io", "Password1!")

        resp = await ac.post(f"/api/v1/projects/{ws_id}/invites",
                             json={"email": "outsider@rbac.io"},
                             headers={"Authorization": f"Bearer {member_token}"})
        assert resp.status_code == 403


# ─── REQ-039: viewer can read tasks ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_viewer_can_read_tasks(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin6@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        board_id = await _create_board(ac, admin_token, ws_id)
        viewer_token = await _invite_and_accept(ac, db_session, admin_token, ws_id, "viewer2@rbac.io", "Password1!")

        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        viewer_id = next(m["id"] for m in resp.json() if "viewer2" in m["email"])
        await ac.patch(f"/api/v1/projects/{ws_id}/members/{viewer_id}",
                       json={"role": "viewer"},
                       headers={"Authorization": f"Bearer {admin_token}"})

        resp = await ac.get(
            f"/api/v1/projects/{ws_id}/boards/{board_id}/tasks",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert resp.status_code == 200


# ─── REQ-040: admin can promote member ───────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_promote_member_to_admin(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin7@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        await _invite_and_accept(ac, db_session, admin_token, ws_id, "promote@rbac.io", "Password1!")

        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        target_id = next(m["id"] for m in resp.json() if "promote" in m["email"])

        patch_resp = await ac.patch(
            f"/api/v1/projects/{ws_id}/members/{target_id}",
            json={"role": "admin"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["role"] == "admin"


# ─── REQ-042: cannot demote last admin ───────────────────────────────────────

@pytest.mark.asyncio
async def test_cannot_demote_last_admin(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin8@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)

        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        admin_id = resp.json()[0]["id"]  # creator is the only admin

        patch_resp = await ac.patch(
            f"/api/v1/projects/{ws_id}/members/{admin_id}",
            json={"role": "member"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert patch_resp.status_code == 400
        assert patch_resp.json()["error"]["code"] == "LAST_ADMIN"


# ─── REQ-042: cannot remove last admin ───────────────────────────────────────

@pytest.mark.asyncio
async def test_cannot_remove_last_admin(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin9@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)

        resp = await ac.get(f"/api/v1/projects/{ws_id}/members",
                            headers={"Authorization": f"Bearer {admin_token}"})
        admin_id = resp.json()[0]["id"]

        del_resp = await ac.delete(
            f"/api/v1/projects/{ws_id}/members/{admin_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert del_resp.status_code == 400
        assert del_resp.json()["error"]["code"] == "LAST_ADMIN"


# ─── non-member cannot access workspace ──────────────────────────────────────

@pytest.mark.asyncio
async def test_non_member_cannot_view_tasks(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token = await _register_and_login(ac, db_session, "admin10@rbac.io", "Password1!")
        ws_id = await _create_workspace(ac, admin_token)
        board_id = await _create_board(ac, admin_token, ws_id)
        outsider_token = await _register_and_login(ac, db_session, "outsider@rbac.io", "Password1!")

        resp = await ac.get(
            f"/api/v1/projects/{ws_id}/boards/{board_id}/tasks",
            headers={"Authorization": f"Bearer {outsider_token}"},
        )
        assert resp.status_code in (403, 404)
