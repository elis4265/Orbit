"""
Integration tests for invite-driven registration.

REQ-038: GET /invites/:token returns invite metadata (public, no auth).
REQ-039: POST /auth/register with invite_token creates verified user + joins workspace.
"""
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.project_invite import ProjectInviteRepository
from app.repositories.project_member import ProjectMemberRepository


async def _make_user(db, suffix=None):
    tag = suffix or uuid.uuid4().hex[:6]
    return await UserRepository(db).create({
        "email": f"invtest_{tag}@taskflow.io",
        "hashed_password": "argon2hash",
        "username": f"invtest_{tag}",
        "is_verified": True,
    })


async def _make_workspace(db, owner):
    return await ProjectRepository(db).create({"key": "WS", "name": "Invite WS", "owner_id": owner.id})


async def _make_invite(db, project_id, owner_id, email, *, expired=False, used=False):
    expires_at = (
        datetime.now(timezone.utc) - timedelta(hours=1)
        if expired
        else datetime.now(timezone.utc) + timedelta(days=7)
    )
    return await ProjectInviteRepository(db).create({
        "project_id": project_id,
        "invited_by": owner_id,
        "email": email,
        "token": uuid.uuid4(),
        "expires_at": expires_at,
        "used": used,
    })


# ── REQ-038 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_invite_metadata_returns_workspace_info(db_session):
    """[REQ-038] GET /invites/:token returns workspace name, email, used, expired — no auth."""
    owner = await _make_user(db_session, "meta1")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "newuser@example.com")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/invites/{invite.token}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["workspace_name"] == "Invite WS"
    assert data["email"] == "newuser@example.com"
    assert data["project_id"] == str(ws.id)
    assert data["expired"] is False
    assert data["used"] is False
    # HW-23: no account for this email yet
    assert data["user_exists"] is False


@pytest.mark.asyncio
async def test_get_invite_metadata_flags_existing_account(db_session):
    """[HW-23] user_exists is true when the invited email already has an account —
    the invite page routes those users to Sign in instead of Register."""
    owner = await _make_user(db_session, "meta_ex1")
    invitee = await _make_user(db_session, "meta_ex2")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, invitee.email)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/invites/{invite.token}")

    assert resp.status_code == 200
    assert resp.json()["user_exists"] is True


@pytest.mark.asyncio
async def test_get_invite_metadata_unknown_token_returns_404(db_session):
    """[REQ-038] Unknown token → 404."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/invites/{uuid.uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_invite_metadata_expired_invite_returns_expired_flag(db_session):
    """[REQ-038] Expired invite returns expired: True (not 404)."""
    owner = await _make_user(db_session, "meta3")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "expired@example.com", expired=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/invites/{invite.token}")

    assert resp.status_code == 200
    assert resp.json()["expired"] is True


@pytest.mark.asyncio
async def test_get_invite_metadata_used_invite_returns_used_flag(db_session):
    """[REQ-038] Used invite returns used: True (not 404)."""
    owner = await _make_user(db_session, "meta4")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "used@example.com", used=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/invites/{invite.token}")

    assert resp.status_code == 200
    assert resp.json()["used"] is True


@pytest.mark.asyncio
async def test_get_invite_metadata_does_not_consume_token(db_session):
    """[REQ-038] GET does not mark the invite as used."""
    owner = await _make_user(db_session, "meta2")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "peek@example.com")

    token = invite.token  # cache before expire_all()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.get(f"/api/v1/invites/{token}")
        await ac.get(f"/api/v1/invites/{token}")

    db_session.expire_all()
    refreshed = await ProjectInviteRepository(db_session).get_by_token(token)
    assert refreshed.used is False


# ── REQ-039 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_with_invite_creates_verified_member(db_session):
    """[REQ-039] Valid invite_token → is_verified=True, membership row created, project_id returned."""
    owner = await _make_user(db_session, "own1")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "invited@example.com")

    with patch("app.services.email.send_verification_email", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post("/api/v1/auth/register", json={
                "email": "invited@example.com",
                "username": "inviteduser",
                "password": "Password123",
                "invite_token": str(invite.token),
                "first_name": "Test",
                "last_name": "User",
            })

    assert resp.status_code == 201
    data = resp.json()
    assert data["project_id"] == str(ws.id)
    assert data["access_token"] is not None

    user = (await db_session.execute(
        select(User).where(User.email == "invited@example.com")
    )).scalars().first()
    assert user is not None
    assert user.is_verified is True

    membership = await ProjectMemberRepository(db_session).get_membership(ws.id, user.id)
    assert membership is not None


@pytest.mark.asyncio
async def test_register_with_invite_marks_invite_used(db_session):
    """[REQ-039] Invite token is marked used after successful registration."""
    owner = await _make_user(db_session, "own2")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "markused@example.com")

    token = invite.token  # cache before expire_all()
    with patch("app.services.email.send_verification_email", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            await ac.post("/api/v1/auth/register", json={
                "email": "markused@example.com",
                "username": "markuseduser",
                "password": "Password123",
                "invite_token": str(token),
                "first_name": "Test",
                "last_name": "User",
            })

    db_session.expire_all()
    refreshed = await ProjectInviteRepository(db_session).get_by_token(token)
    assert refreshed.used is True


@pytest.mark.asyncio
async def test_register_with_expired_invite_returns_400(db_session):
    """[REQ-039] Expired invite token → 400."""
    owner = await _make_user(db_session, "own3")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "expired@example.com", expired=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "expired@example.com",
            "username": "expireduser",
            "password": "Password123",
            "invite_token": str(invite.token),
            "first_name": "Test",
            "last_name": "User",
        })

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_register_with_used_invite_returns_400(db_session):
    """[REQ-039] Already-used invite token → 400."""
    owner = await _make_user(db_session, "own4")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "alreadyused@example.com", used=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "alreadyused@example.com",
            "username": "alreadyuseduser",
            "password": "Password123",
            "invite_token": str(invite.token),
            "first_name": "Test",
            "last_name": "User",
        })

    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_register_with_unknown_invite_token_returns_404(db_session):
    """[REQ-039] Unknown invite token → 404."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "unknown@example.com",
            "username": "unknownuser",
            "password": "Password123",
            "invite_token": str(uuid.uuid4()),
            "first_name": "Test",
            "last_name": "User",
        })

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_new_user_invite_single_step_no_email_verification(db_session):
    """[REQ-039] Brand-new user registers via invite:
    returned access_token is immediately usable, user is verified,
    workspace appears in their list — no email verification step required.
    """
    owner = await _make_user(db_session, "e2e1")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "brandnew@example.com")

    # Step 1 — register as a completely new user using the invite token
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "brandnew@example.com",
            "username": "brandnewuser",
            "password": "Password123",
            "invite_token": str(invite.token),
            "first_name": "Test",
            "last_name": "User",
        })

    assert resp.status_code == 201
    data = resp.json()
    assert data["project_id"] == str(ws.id)
    access_token = data["access_token"]
    assert access_token is not None

    # Step 2 — use the token directly; no /verify-email call should be needed
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        me = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        workspaces = await ac.get("/api/v1/projects", headers={"Authorization": f"Bearer {access_token}"})

    assert me.status_code == 200
    assert me.json()["email"] == "brandnew@example.com"
    assert me.json()["is_verified"] is True

    assert workspaces.status_code == 200
    assert any(w["id"] == str(ws.id) for w in workspaces.json())


@pytest.mark.asyncio
async def test_register_with_invite_skips_verification_email(db_session):
    """[REQ-039] Invite-driven registration does not send a verification email."""
    owner = await _make_user(db_session, "own5")
    ws = await _make_workspace(db_session, owner)
    invite = await _make_invite(db_session, ws.id, owner.id, "noemail@example.com")

    with patch("app.services.email.send_verification_email", new_callable=AsyncMock) as mock_verify:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            await ac.post("/api/v1/auth/register", json={
                "email": "noemail@example.com",
                "username": "noemailuser",
                "password": "Password123",
                "invite_token": str(invite.token),
                "first_name": "Test",
                "last_name": "User",
            })

    mock_verify.assert_not_awaited()
