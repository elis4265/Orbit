import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.services.project_member import ProjectMemberService
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole


# ─── fixtures ────────────────────────────────────────────────────────────────

def make_workspace(owner_id=None):
    ws = MagicMock(spec=Project)
    ws.id = uuid.uuid4()
    ws.owner_id = owner_id or uuid.uuid4()
    ws.name = "Test Workspace"
    return ws


def make_member(project_id, user_id, role: MemberRole):
    m = MagicMock(spec=ProjectMember)
    m.project_id = project_id
    m.user_id = user_id
    m.role = role
    return m


@pytest.fixture
def member_repo():
    return MagicMock()


@pytest.fixture
def service(member_repo):
    return ProjectMemberService(
        member_repo=member_repo,
        invite_repo=AsyncMock(),
        user_repo=AsyncMock(),
        project_repo=AsyncMock(),
    )


# ─── promote_role ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_promote_member_to_admin(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    existing = make_member(ws.id, target_id, MemberRole.member)
    member_repo.get_membership = AsyncMock(return_value=existing)
    member_repo.get_admin_count = AsyncMock(return_value=1)
    member_repo.update_role = AsyncMock(return_value=existing)

    result = await service.promote_role(ws, target_id, MemberRole.admin, actor_id=uuid.uuid4())

    member_repo.update_role.assert_called_once_with(ws.id, target_id, MemberRole.admin)


@pytest.mark.asyncio
async def test_demote_member_to_viewer(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    existing = make_member(ws.id, target_id, MemberRole.member)
    member_repo.get_membership = AsyncMock(return_value=existing)
    member_repo.get_admin_count = AsyncMock(return_value=2)
    member_repo.update_role = AsyncMock(return_value=existing)

    await service.promote_role(ws, target_id, MemberRole.viewer, actor_id=uuid.uuid4())

    member_repo.update_role.assert_called_once_with(ws.id, target_id, MemberRole.viewer)


@pytest.mark.asyncio
async def test_demote_last_admin_raises_last_admin(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    existing = make_member(ws.id, target_id, MemberRole.admin)
    member_repo.get_membership = AsyncMock(return_value=existing)
    member_repo.get_admin_count = AsyncMock(return_value=1)

    with pytest.raises(HTTPException) as exc_info:
        # actor is owner so it gets past the INSUFFICIENT_ROLE guard
        await service.promote_role(ws, target_id, MemberRole.member, actor_id=ws.owner_id)

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "LAST_ADMIN"


@pytest.mark.asyncio
async def test_admin_cannot_demote_another_admin(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    actor_id = uuid.uuid4()  # admin, not the owner
    existing = make_member(ws.id, target_id, MemberRole.admin)
    member_repo.get_membership = AsyncMock(return_value=existing)

    with pytest.raises(HTTPException) as exc_info:
        await service.promote_role(ws, target_id, MemberRole.member, actor_id=actor_id)

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "INSUFFICIENT_ROLE"


@pytest.mark.asyncio
async def test_promote_nonexistent_member_raises_404(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    member_repo.get_membership = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc_info:
        await service.promote_role(ws, target_id, MemberRole.admin, actor_id=uuid.uuid4())

    assert exc_info.value.status_code == 404


# ─── remove_member ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_remove_member_success(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    existing = make_member(ws.id, target_id, MemberRole.member)
    member_repo.get_membership = AsyncMock(return_value=existing)
    member_repo.get_admin_count = AsyncMock(return_value=2)
    member_repo.remove_member = AsyncMock()

    await service.remove_member(ws, target_id, actor_id=uuid.uuid4())

    member_repo.remove_member.assert_called_once_with(ws.id, target_id)


@pytest.mark.asyncio
async def test_remove_last_admin_raises_last_admin(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    existing = make_member(ws.id, target_id, MemberRole.admin)
    member_repo.get_membership = AsyncMock(return_value=existing)
    member_repo.get_admin_count = AsyncMock(return_value=1)

    with pytest.raises(HTTPException) as exc_info:
        # actor is owner so it gets past the INSUFFICIENT_ROLE guard
        await service.remove_member(ws, target_id, actor_id=ws.owner_id)

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "LAST_ADMIN"


@pytest.mark.asyncio
async def test_admin_cannot_remove_another_admin(service, member_repo):
    ws = make_workspace()
    target_id = uuid.uuid4()
    actor_id = uuid.uuid4()  # admin, not the owner
    existing = make_member(ws.id, target_id, MemberRole.admin)
    member_repo.get_membership = AsyncMock(return_value=existing)

    with pytest.raises(HTTPException) as exc_info:
        await service.remove_member(ws, target_id, actor_id=actor_id)

    assert exc_info.value.status_code == 403
    assert exc_info.value.code == "INSUFFICIENT_ROLE"


@pytest.mark.asyncio
async def test_remove_owner_raises_400(service, member_repo):
    owner_id = uuid.uuid4()
    ws = make_workspace(owner_id=owner_id)
    member_repo.get_membership = AsyncMock(return_value=None)  # owner has no row

    with pytest.raises(HTTPException) as exc_info:
        await service.remove_member(ws, owner_id, actor_id=uuid.uuid4())

    assert exc_info.value.status_code == 400


# ─── is_admin helper ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_owner_is_always_admin(service, member_repo):
    owner_id = uuid.uuid4()
    ws = make_workspace(owner_id=owner_id)
    member_repo.get_membership = AsyncMock(return_value=None)

    result = await service.get_user_role(ws, owner_id)

    assert result == MemberRole.admin


@pytest.mark.asyncio
async def test_member_role_returned(service, member_repo):
    ws = make_workspace()
    user_id = uuid.uuid4()
    membership = make_member(ws.id, user_id, MemberRole.viewer)
    member_repo.get_membership = AsyncMock(return_value=membership)

    result = await service.get_user_role(ws, user_id)

    assert result == MemberRole.viewer


@pytest.mark.asyncio
async def test_non_member_returns_none(service, member_repo):
    ws = make_workspace()
    user_id = uuid.uuid4()
    member_repo.get_membership = AsyncMock(return_value=None)

    result = await service.get_user_role(ws, user_id)

    assert result is None
