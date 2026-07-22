import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.audit_log import AuditLogService


@pytest.fixture
def repo():
    r = MagicMock()
    r.log = AsyncMock()
    return r


@pytest.fixture
def svc(repo):
    return AuditLogService(repo)


WS = uuid.uuid4()
ACTOR = uuid.uuid4()
BOARD = uuid.uuid4()
USER = uuid.uuid4()


@pytest.mark.asyncio
async def test_log_workspace_created(svc, repo):
    await svc.log_workspace_created(WS, ACTOR, "alice", "My WS")
    repo.log.assert_awaited_once()
    call = repo.log.call_args.kwargs
    assert call["action"] == "workspace.created"
    assert call["entity_type"] == "workspace"
    assert call["entity_name"] == "My WS"


@pytest.mark.asyncio
async def test_log_workspace_renamed(svc, repo):
    await svc.log_workspace_renamed(WS, ACTOR, "alice", "Old", "New")
    call = repo.log.call_args.kwargs
    assert call["action"] == "workspace.renamed"
    assert call["meta"] == {"old_name": "Old", "new_name": "New"}
    assert call["entity_name"] == "New"


@pytest.mark.asyncio
async def test_log_workspace_deleted(svc, repo):
    await svc.log_workspace_deleted(WS, ACTOR, "alice", "My WS")
    call = repo.log.call_args.kwargs
    assert call["action"] == "workspace.deleted"
    assert call["entity_name"] == "My WS"


@pytest.mark.asyncio
async def test_log_board_created(svc, repo):
    await svc.log_board_created(WS, ACTOR, "alice", BOARD, "Sprint 1")
    call = repo.log.call_args.kwargs
    assert call["action"] == "board.created"
    assert call["entity_type"] == "board"
    assert call["entity_id"] == str(BOARD)
    assert call["entity_name"] == "Sprint 1"


@pytest.mark.asyncio
async def test_log_board_renamed(svc, repo):
    await svc.log_board_renamed(WS, ACTOR, "alice", BOARD, "Old", "New")
    call = repo.log.call_args.kwargs
    assert call["action"] == "board.renamed"
    assert call["meta"] == {"old_name": "Old", "new_name": "New"}


@pytest.mark.asyncio
async def test_log_board_deleted(svc, repo):
    await svc.log_board_deleted(WS, ACTOR, "alice", BOARD, "Sprint 1")
    call = repo.log.call_args.kwargs
    assert call["action"] == "board.deleted"


@pytest.mark.asyncio
async def test_log_member_invited(svc, repo):
    await svc.log_member_invited(WS, ACTOR, "alice", "bob@example.com")
    call = repo.log.call_args.kwargs
    assert call["action"] == "member.invited"
    assert call["entity_type"] == "member"
    assert call["entity_name"] == "bob@example.com"
    assert call["meta"] == {"email": "bob@example.com"}


@pytest.mark.asyncio
async def test_log_member_joined(svc, repo):
    await svc.log_member_joined(WS, USER, "bob")
    call = repo.log.call_args.kwargs
    assert call["action"] == "member.joined"
    assert call["entity_id"] == str(USER)
    assert call["entity_name"] == "bob"


@pytest.mark.asyncio
async def test_log_member_removed(svc, repo):
    await svc.log_member_removed(WS, ACTOR, "alice", USER, "bob")
    call = repo.log.call_args.kwargs
    assert call["action"] == "member.removed"
    assert call["entity_id"] == str(USER)
    assert call["entity_name"] == "bob"


@pytest.mark.asyncio
async def test_log_member_role_changed(svc, repo):
    await svc.log_member_role_changed(WS, ACTOR, "alice", USER, "bob", "member", "admin")
    call = repo.log.call_args.kwargs
    assert call["action"] == "member.role_changed"
    assert call["meta"] == {"old_role": "member", "new_role": "admin"}


@pytest.mark.asyncio
async def test_get_workspace_audit_delegates_to_repo(svc, repo):
    repo.get_workspace_audit = AsyncMock(return_value=([], 0, None))
    result = await svc.get_workspace_audit(WS, limit=10, offset=0)
    repo.get_workspace_audit.assert_awaited_once()
    assert result == ([], 0, None)
