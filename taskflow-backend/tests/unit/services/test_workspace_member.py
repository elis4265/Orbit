"""Unit tests for WorkspaceMemberService."""
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.errors import AppError
from app.models.project_member import MemberRole
from app.services.project_member import ProjectMemberService


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_svc():
    member_repo = MagicMock()
    invite_repo = MagicMock()
    user_repo = MagicMock()
    project_repo = MagicMock()
    for repo in (member_repo, invite_repo, user_repo, project_repo):
        for attr in ("get_membership", "get_pending_for_email", "create", "get_by_token",
                     "get", "get_by_email", "get_members", "add_member", "mark_used",
                     "remove_member", "get_admin_count", "update_role"):
            if hasattr(repo, attr):
                setattr(repo, attr, AsyncMock(return_value=None))
    member_repo.get_membership = AsyncMock(return_value=None)
    member_repo.get_pending_for_email = AsyncMock(return_value=None)
    member_repo.get_members = AsyncMock(return_value=[])
    member_repo.get_admin_count = AsyncMock(return_value=2)
    member_repo.add_member = AsyncMock(return_value=None)
    member_repo.remove_member = AsyncMock(return_value=None)
    member_repo.update_role = AsyncMock(return_value=None)
    invite_repo.get_pending_for_email = AsyncMock(return_value=None)
    invite_repo.get_by_token = AsyncMock(return_value=None)
    invite_repo.mark_used = AsyncMock(return_value=None)
    invite_repo.create = AsyncMock(return_value=MagicMock(token=uuid.uuid4()))
    user_repo.get_by_email = AsyncMock(return_value=None)
    user_repo.get = AsyncMock(return_value=None)
    project_repo.get = AsyncMock(return_value=None)
    svc = ProjectMemberService(member_repo, invite_repo, user_repo, project_repo)
    return svc, member_repo, invite_repo, user_repo, project_repo


def _ws(owner_id=None):
    ws = MagicMock()
    ws.id = uuid.uuid4()
    ws.owner_id = owner_id or uuid.uuid4()
    ws.name = "Test WS"
    return ws


def _user(uid=None):
    u = MagicMock()
    u.id = uid or uuid.uuid4()
    u.email = "user@example.com"
    u.username = "user"
    return u


# ── get_user_role ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_user_role_owner_returns_admin():
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    role = await svc.get_user_role(ws, ws.owner_id)
    assert role == MemberRole.admin


@pytest.mark.asyncio
async def test_get_user_role_non_member_returns_none():
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    member_repo.get_membership = AsyncMock(return_value=None)
    role = await svc.get_user_role(ws, uuid.uuid4())
    assert role is None


@pytest.mark.asyncio
async def test_get_user_role_member_returns_role():
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    m = MagicMock()
    m.role = "member"
    member_repo.get_membership = AsyncMock(return_value=m)
    role = await svc.get_user_role(ws, uuid.uuid4())
    assert role == MemberRole.member


# ── invite ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_invite_raises_400_if_already_member():
    svc, member_repo, invite_repo, user_repo, *_ = _make_svc()
    ws = _ws()
    target = _user()
    user_repo.get_by_email = AsyncMock(return_value=target)
    member_repo.get_membership = AsyncMock(return_value=MagicMock())
    with pytest.raises(HTTPException) as exc:
        await svc.invite(ws, _user(), target.email)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_invite_raises_409_if_pending_invite_exists():
    svc, member_repo, invite_repo, user_repo, *_ = _make_svc()
    ws = _ws()
    user_repo.get_by_email = AsyncMock(return_value=None)
    invite_repo.get_pending_for_email = AsyncMock(return_value=MagicMock())
    with pytest.raises(HTTPException) as exc:
        await svc.invite(ws, _user(), "new@example.com")
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_invite_creates_and_returns_invite():
    svc, member_repo, invite_repo, user_repo, *_ = _make_svc()
    ws = _ws()
    created = MagicMock(token=uuid.uuid4())
    invite_repo.create = AsyncMock(return_value=created)
    user_repo.get_by_email = AsyncMock(return_value=None)
    with patch("app.services.email.send_invite_email", new=AsyncMock()):
        result = await svc.invite(ws, _user(), "new@example.com")
    assert result is created


# ── accept ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_accept_raises_404_if_token_not_found():
    svc, _, invite_repo, *_ = _make_svc()
    invite_repo.get_by_token = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await svc.accept(uuid.uuid4(), _user())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_accept_raises_400_if_expired():
    svc, _, invite_repo, *_ = _make_svc()
    invite = MagicMock()
    invite.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    invite_repo.get_by_token = AsyncMock(return_value=invite)
    with pytest.raises(HTTPException) as exc:
        await svc.accept(uuid.uuid4(), _user())
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_accept_returns_workspace_id_if_already_member():
    svc, member_repo, invite_repo, *_ = _make_svc()
    invite = MagicMock()
    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    invite.project_id = uuid.uuid4()
    invite_repo.get_by_token = AsyncMock(return_value=invite)
    member_repo.get_membership = AsyncMock(return_value=MagicMock())
    result = await svc.accept(uuid.uuid4(), _user())
    assert result == invite.project_id


@pytest.mark.asyncio
async def test_accept_adds_member_and_marks_used():
    svc, member_repo, invite_repo, *_ = _make_svc()
    invite = MagicMock()
    invite.expires_at = datetime.now(timezone.utc) + timedelta(days=1)
    invite.project_id = uuid.uuid4()
    invite.used = False
    invite_repo.get_by_token = AsyncMock(return_value=invite)
    member_repo.get_membership = AsyncMock(return_value=None)
    user = _user()
    result = await svc.accept(uuid.uuid4(), user)
    member_repo.add_member.assert_awaited_once()
    invite_repo.mark_used.assert_awaited_once_with(invite)
    assert result == invite.project_id


# ── list_members ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_members_includes_owner():
    svc, member_repo, _, user_repo, *_ = _make_svc()
    ws = _ws()
    owner = _user(ws.owner_id)
    user_repo.get = AsyncMock(return_value=owner)
    member_repo.get_members = AsyncMock(return_value=[])
    result = await svc.list_members(ws)
    assert any(r["role"] == "owner" for r in result)


@pytest.mark.asyncio
async def test_list_members_includes_non_owner_members():
    svc, member_repo, _, user_repo, *_ = _make_svc()
    ws = _ws()
    owner = _user(ws.owner_id)
    member_uid = uuid.uuid4()
    m = MagicMock()
    m.user_id = member_uid
    m.role = "member"
    m.joined_at = datetime.now(timezone.utc)
    member_user = _user(member_uid)
    member_repo.get_members = AsyncMock(return_value=[m])
    user_repo.get = AsyncMock(side_effect=lambda uid: owner if uid == ws.owner_id else member_user)
    result = await svc.list_members(ws)
    assert len(result) == 2


# ── remove_member ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_remove_member_raises_if_target_is_owner():
    svc, *_ = _make_svc()
    ws = _ws()
    with pytest.raises(AppError) as exc:
        await svc.remove_member(ws, ws.owner_id, uuid.uuid4())
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_remove_member_raises_404_if_not_member():
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    member_repo.get_membership = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await svc.remove_member(ws, uuid.uuid4(), ws.owner_id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_remove_member_succeeds():
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    target_id = uuid.uuid4()
    m = MagicMock()
    m.role = "member"
    member_repo.get_membership = AsyncMock(return_value=m)
    await svc.remove_member(ws, target_id, ws.owner_id)
    member_repo.remove_member.assert_awaited_once_with(ws.id, target_id)


@pytest.mark.asyncio
async def test_remove_member_unassigns_their_tasks():
    """Removing a member clears their assignments — a task assigned to a non-member
    shows a blank avatar to the team while still counting as assigned in filters."""
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    target = uuid.uuid4()
    member_repo.get_membership = AsyncMock(return_value=MagicMock(role=MemberRole.member.value))
    svc.task_repo = MagicMock()
    svc.task_repo.unassign_all_for_user = AsyncMock(return_value=3)

    await svc.remove_member(ws, target, ws.owner_id)

    svc.task_repo.unassign_all_for_user.assert_awaited_once_with(ws.id, target)


@pytest.mark.asyncio
async def test_remove_member_without_task_repo_still_works():
    """task_repo is optional — older constructions must not break."""
    svc, member_repo, *_ = _make_svc()
    ws = _ws()
    member_repo.get_membership = AsyncMock(return_value=MagicMock(role=MemberRole.member.value))
    svc.task_repo = None
    await svc.remove_member(ws, uuid.uuid4(), ws.owner_id)
