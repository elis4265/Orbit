"""
Audit log integration tests — split from activity log.

Activity log (/workspaces/{id}/activity): viewer+, task events.
Audit trail  (/workspaces/{id}/audit):    admin-only, workspace/board/member events.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.project_invite import ProjectInvite

pytestmark = pytest.mark.integration


# ─── helpers ─────────────────────────────────────────────────────────────────

async def _register_login(ac: AsyncClient, db_session, email: str, password: str = "Password1"):
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
    return resp.json()["access_token"], user


async def _invite_and_accept(ac, db_session, admin_headers, ws_id, member_email, member_token):
    await ac.post(f"/api/v1/projects/{ws_id}/invites",
                  json={"email": member_email}, headers=admin_headers)
    invite = (await db_session.execute(
        select(ProjectInvite).where(ProjectInvite.email == member_email)
    )).scalars().first()
    await ac.post(f"/api/v1/invites/{invite.token}/accept",
                  headers={"Authorization": f"Bearer {member_token}"})


def _audit_url(ws_id):
    return f"/api/v1/projects/{ws_id}/audit"


def _activity_url(ws_id):
    return f"/api/v1/projects/{ws_id}/activity"


# ─── access control ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_admin_only_member_gets_403(db_session):
    """Regular member cannot access audit trail."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token, _ = await _register_login(ac, db_session, "aud_ac_admin@t.com")
        member_token, _ = await _register_login(ac, db_session, "aud_ac_member@t.com")
        h = {"Authorization": f"Bearer {admin_token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "AuditAC"}, headers=h)).json()
        await _invite_and_accept(ac, db_session, h, ws["id"], "aud_ac_member@t.com", member_token)

        r = await ac.get(_audit_url(ws["id"]), headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_audit_unauthenticated_gets_401(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token, _ = await _register_login(ac, db_session, "aud_unauth@t.com")
        h = {"Authorization": f"Bearer {admin_token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "AuditUnauth"}, headers=h)).json()
        r = await ac.get(_audit_url(ws["id"]))
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_activity_log_viewer_accessible(db_session):
    """Project-level activity log is now viewer+ (not admin-only)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token, _ = await _register_login(ac, db_session, "aud_v_admin@t.com")
        member_token, _ = await _register_login(ac, db_session, "aud_v_member@t.com")
        h = {"Authorization": f"Bearer {admin_token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "ActViewer"}, headers=h)).json()
        board = (await ac.post(f"/api/v1/projects/{ws['id']}/boards", json={"name": "B"}, headers=h)).json()
        await ac.post(f"/api/v1/projects/{ws['id']}/boards/{board['id']}/tasks",
                      json={"title": "T"}, headers=h)
        await _invite_and_accept(ac, db_session, h, ws["id"], "aud_v_member@t.com", member_token)

        r = await ac.get(_activity_url(ws["id"]), headers={"Authorization": f"Bearer {member_token}"})
        assert r.status_code == 200
        assert r.json()["total"] >= 1


# ─── audit events logged ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_workspace_created_logged(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_ws_create@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "WS Create"}, headers=h)).json()

        r = await ac.get(_audit_url(ws["id"]), headers=h)
        assert r.status_code == 200
        actions = [i["action"] for i in r.json()["items"]]
        assert "workspace.created" in actions


@pytest.mark.asyncio
async def test_workspace_renamed_logged(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_ws_rename@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "Before"}, headers=h)).json()
        await ac.patch(f"/api/v1/projects/{ws['id']}", json={"name": "After"}, headers=h)

        r = await ac.get(_audit_url(ws["id"]), headers=h)
        rename = next((i for i in r.json()["items"] if i["action"] == "workspace.renamed"), None)
        assert rename is not None
        assert rename["meta"]["old_name"] == "Before"
        assert rename["meta"]["new_name"] == "After"


@pytest.mark.asyncio
async def test_board_created_deleted_logged(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_board@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "BoardAudit"}, headers=h)).json()
        board = (await ac.post(f"/api/v1/projects/{ws['id']}/boards", json={"name": "B1"}, headers=h)).json()
        await ac.delete(f"/api/v1/projects/{ws['id']}/boards/{board['id']}", headers=h)

        r = await ac.get(_audit_url(ws["id"]), headers=h)
        actions = [i["action"] for i in r.json()["items"]]
        assert "board.created" in actions
        assert "board.deleted" in actions


@pytest.mark.asyncio
async def test_board_renamed_logged(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_board_ren@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "BRenAudit"}, headers=h)).json()
        board = (await ac.post(f"/api/v1/projects/{ws['id']}/boards", json={"name": "Old"}, headers=h)).json()
        await ac.patch(f"/api/v1/projects/{ws['id']}/boards/{board['id']}", json={"name": "New"}, headers=h)

        r = await ac.get(_audit_url(ws["id"]), headers=h)
        rename = next((i for i in r.json()["items"] if i["action"] == "board.renamed"), None)
        assert rename is not None
        assert rename["meta"]["old_name"] == "Old"
        assert rename["meta"]["new_name"] == "New"


@pytest.mark.asyncio
async def test_member_invited_and_joined_logged(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token, _ = await _register_login(ac, db_session, "aud_inv_admin@t.com")
        member_token, _ = await _register_login(ac, db_session, "aud_inv_member@t.com")
        h = {"Authorization": f"Bearer {admin_token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "InvAudit"}, headers=h)).json()
        await _invite_and_accept(ac, db_session, h, ws["id"], "aud_inv_member@t.com", member_token)

        r = await ac.get(_audit_url(ws["id"]), headers=h)
        actions = [i["action"] for i in r.json()["items"]]
        assert "member.invited" in actions
        assert "member.joined" in actions


@pytest.mark.asyncio
async def test_member_removed_logged(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        admin_token, _ = await _register_login(ac, db_session, "aud_rem_admin@t.com")
        member_token, member_user = await _register_login(ac, db_session, "aud_rem_member@t.com")
        h = {"Authorization": f"Bearer {admin_token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "RemAudit"}, headers=h)).json()
        await _invite_and_accept(ac, db_session, h, ws["id"], "aud_rem_member@t.com", member_token)
        await ac.delete(f"/api/v1/projects/{ws['id']}/members/{member_user.id}", headers=h)

        r = await ac.get(_audit_url(ws["id"]), headers=h)
        actions = [i["action"] for i in r.json()["items"]]
        assert "member.removed" in actions


# ─── filters ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_filter_by_action(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_filt@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "FiltAudit"}, headers=h)).json()
        await ac.post(f"/api/v1/projects/{ws['id']}/boards", json={"name": "B"}, headers=h)

        r = await ac.get(_audit_url(ws["id"]), params={"actions": ["board.created"]}, headers=h)
        items = r.json()["items"]
        assert len(items) >= 1
        assert all(i["action"] == "board.created" for i in items)


@pytest.mark.asyncio
async def test_audit_filter_future_date_returns_empty(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_date@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "DateAudit"}, headers=h)).json()

        r = await ac.get(_audit_url(ws["id"]), params={"date_from": "2099-01-01"}, headers=h)
        assert r.json()["items"] == []


# ─── export ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_export_csv(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_exp@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "ExpAudit"}, headers=h)).json()

        r = await ac.get(f"{_audit_url(ws['id'])}/export", params={"format": "csv"}, headers=h)
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        lines = r.text.strip().split("\n")
        assert lines[0].startswith("id,")
        assert len(lines) >= 2


@pytest.mark.asyncio
async def test_audit_export_json(db_session):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        token, _ = await _register_login(ac, db_session, "aud_expj@t.com")
        h = {"Authorization": f"Bearer {token}"}
        ws = (await ac.post("/api/v1/projects", json={"name": "ExpJAudit"}, headers=h)).json()

        r = await ac.get(f"{_audit_url(ws['id'])}/export", params={"format": "json"}, headers=h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 1
