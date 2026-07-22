"""
Integration tests for workspace membership and invite flow.

REQ-033: Owner can invite a member by email.
REQ-034: Authenticated user can accept an invite token.
REQ-035: Any member can list workspace members.
REQ-036: Owner can remove a member.
REQ-037: GET /workspaces returns owned + joined workspaces.
"""
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.project_member import ProjectMemberRepository
from app.repositories.project_invite import ProjectInviteRepository


async def _make_user(db, suffix=None):
    tag = suffix or uuid.uuid4().hex[:6]
    return await UserRepository(db).create({
        "email": f"member_{tag}@taskflow.io",
        "hashed_password": "argon2hash",
    })


async def _make_workspace(db, owner):
    return await ProjectRepository(db).create({"key": "WS", "name": "Team WS", "owner_id": owner.id})


# ── REQ-033 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_can_invite_by_email(db_session):
    """[REQ-033] POST /invites returns 201 and creates a pending invite."""
    owner = await _make_user(db_session, "owner1")
    ws = await _make_workspace(db_session, owner)
    app.dependency_overrides[get_current_user] = lambda: owner

    with patch("app.services.email.send_invite_email", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                f"/api/v1/projects/{ws.id}/invites",
                json={"email": "invitee@example.com", "role": "member"},
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "invitee@example.com"
    assert data["used"] is False


@pytest.mark.asyncio
async def test_invite_sends_email(db_session):
    """[REQ-033] Inviting calls _send_invite_email with the invitee's address."""
    owner = await _make_user(db_session, "ownerE")
    ws = await _make_workspace(db_session, owner)
    app.dependency_overrides[get_current_user] = lambda: owner

    with patch(
        "app.services.email.send_invite_email",
        new_callable=AsyncMock,
    ) as mock_send:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                f"/api/v1/projects/{ws.id}/invites",
                json={"email": "email_test@example.com"},
            )

    app.dependency_overrides.clear()
    assert resp.status_code == 201
    mock_send.assert_awaited_once()
    call_email = mock_send.call_args[0][0]
    assert call_email == "email_test@example.com"


@pytest.mark.asyncio
async def test_invite_duplicate_pending_returns_409(db_session):
    """[REQ-033] Second invite for same email while first is pending → 409."""
    owner = await _make_user(db_session, "owner2")
    ws = await _make_workspace(db_session, owner)
    app.dependency_overrides[get_current_user] = lambda: owner

    with patch("app.services.email.send_invite_email", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            await ac.post(f"/api/v1/projects/{ws.id}/invites", json={"email": "dup@example.com"})
            resp = await ac.post(f"/api/v1/projects/{ws.id}/invites", json={"email": "dup@example.com"})

    app.dependency_overrides.clear()
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_invite_existing_member_returns_400(db_session):
    """[REQ-033] Inviting a user who is already a member → 400."""
    owner = await _make_user(db_session, "owner3")
    member = await _make_user(db_session, "mem3")
    ws = await _make_workspace(db_session, owner)
    await ProjectMemberRepository(db_session).add_member(ws.id, member.id)
    app.dependency_overrides[get_current_user] = lambda: owner

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/invites",
            json={"email": member.email},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_non_owner_cannot_invite(db_session):
    """[REQ-033] Non-owner cannot send invites → 404."""
    owner = await _make_user(db_session, "owner4")
    stranger = await _make_user(db_session, "str4")
    ws = await _make_workspace(db_session, owner)
    app.dependency_overrides[get_current_user] = lambda: stranger

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{ws.id}/invites",
            json={"email": "x@example.com"},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 403


# ── REQ-034 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_accept_valid_invite(db_session):
    """[REQ-034] Accepting a valid token adds the user to workspace_members."""
    owner = await _make_user(db_session, "owner5")
    invitee = await _make_user(db_session, "inv5")
    ws = await _make_workspace(db_session, owner)
    invite = await ProjectInviteRepository(db_session).create({
        "project_id": ws.id,
        "invited_by": owner.id,
        "email": invitee.email,
        "token": uuid.uuid4(),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "used": False,
    })
    app.dependency_overrides[get_current_user] = lambda: invitee

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/invites/{invite.token}/accept")

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    membership = await ProjectMemberRepository(db_session).get_membership(ws.id, invitee.id)
    assert membership is not None


@pytest.mark.asyncio
async def test_accept_valid_invite_returns_project_id(db_session):
    """[REQ-034 / REQ-040] Accept response includes project_id for frontend redirect."""
    owner = await _make_user(db_session, "owner5b")
    invitee = await _make_user(db_session, "inv5b")
    ws = await _make_workspace(db_session, owner)
    invite = await ProjectInviteRepository(db_session).create({
        "project_id": ws.id,
        "invited_by": owner.id,
        "email": invitee.email,
        "token": uuid.uuid4(),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "used": False,
    })
    app.dependency_overrides[get_current_user] = lambda: invitee

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/invites/{invite.token}/accept")

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert resp.json()["project_id"] == str(ws.id)


@pytest.mark.asyncio
async def test_accept_expired_invite_returns_400(db_session):
    """[REQ-034] Expired invite token → 400."""
    owner = await _make_user(db_session, "owner6")
    invitee = await _make_user(db_session, "inv6")
    ws = await _make_workspace(db_session, owner)
    invite = await ProjectInviteRepository(db_session).create({
        "project_id": ws.id,
        "invited_by": owner.id,
        "email": invitee.email,
        "token": uuid.uuid4(),
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
        "used": False,
    })
    app.dependency_overrides[get_current_user] = lambda: invitee

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/invites/{invite.token}/accept")

    app.dependency_overrides.clear()
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_accept_unknown_token_returns_404(db_session):
    """[REQ-034] Unknown token → 404."""
    user = await _make_user(db_session, "user7")
    app.dependency_overrides[get_current_user] = lambda: user

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(f"/api/v1/invites/{uuid.uuid4()}/accept")

    app.dependency_overrides.clear()
    assert resp.status_code == 404


# ── REQ-035 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_members_includes_owner_and_members(db_session):
    """[REQ-035] GET /members returns owner + all members."""
    owner = await _make_user(db_session, "owner8")
    member = await _make_user(db_session, "mem8")
    ws = await _make_workspace(db_session, owner)
    await ProjectMemberRepository(db_session).add_member(ws.id, member.id)
    app.dependency_overrides[get_current_user] = lambda: owner

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{ws.id}/members")

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    emails = {m["email"] for m in resp.json()}
    assert owner.email in emails
    assert member.email in emails


@pytest.mark.asyncio
async def test_member_can_list_members(db_session):
    """[REQ-035] A non-owner member can list members."""
    owner = await _make_user(db_session, "owner9")
    member = await _make_user(db_session, "mem9")
    ws = await _make_workspace(db_session, owner)
    await ProjectMemberRepository(db_session).add_member(ws.id, member.id)
    app.dependency_overrides[get_current_user] = lambda: member

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{ws.id}/members")

    app.dependency_overrides.clear()
    assert resp.status_code == 200


# ── REQ-036 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_can_remove_member(db_session):
    """[REQ-036] Owner removes a member; they no longer appear in member list."""
    owner = await _make_user(db_session, "ownerA")
    member = await _make_user(db_session, "memA")
    ws = await _make_workspace(db_session, owner)
    await ProjectMemberRepository(db_session).add_member(ws.id, member.id)
    app.dependency_overrides[get_current_user] = lambda: owner

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{ws.id}/members/{member.id}")

    app.dependency_overrides.clear()
    assert resp.status_code == 204
    membership = await ProjectMemberRepository(db_session).get_membership(ws.id, member.id)
    assert membership is None


@pytest.mark.asyncio
async def test_cannot_remove_owner(db_session):
    """[REQ-036] Attempting to remove the workspace owner → 400."""
    owner = await _make_user(db_session, "ownerB")
    ws = await _make_workspace(db_session, owner)
    app.dependency_overrides[get_current_user] = lambda: owner

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.delete(f"/api/v1/projects/{ws.id}/members/{owner.id}")

    app.dependency_overrides.clear()
    assert resp.status_code == 400


# ── REQ-037 ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_workspaces_includes_joined(db_session):
    """[REQ-037] GET /workspaces returns both owned and joined workspaces."""
    owner = await _make_user(db_session, "ownerC")
    member = await _make_user(db_session, "memC")
    ws = await _make_workspace(db_session, owner)
    await ProjectMemberRepository(db_session).add_member(ws.id, member.id)
    app.dependency_overrides[get_current_user] = lambda: member

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/v1/projects")

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    ids = {w["id"] for w in resp.json()}
    assert str(ws.id) in ids
