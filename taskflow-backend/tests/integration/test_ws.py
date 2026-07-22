"""WebSocket integration tests.

Uses starlette TestClient (sync) with monkey-patching for WS router internals.
Runs as regular (non-async) tests — TestClient has its own event loop.
"""
import uuid
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import create_access_token, create_refresh_token


def _valid_token(user_id: str | None = None) -> tuple[str, str]:
    uid = user_id or str(uuid.uuid4())
    return create_access_token({"sub": uid}), uid


def _fake_redis(blacklisted: bool = False) -> MagicMock:
    r = MagicMock()
    r.exists = AsyncMock(return_value=1 if blacklisted else 0)
    return r


def _fake_project(owner_id: str) -> MagicMock:
    p = MagicMock()
    p.owner_id = uuid.UUID(owner_id)
    p.id = uuid.uuid4()
    return p


@contextmanager
def _ws_context(owner_id: str, blacklisted: bool = False, member: bool = False):
    """Patches ProjectRepository.get, ProjectMemberRepository.get_membership and
    redis_client for the WS auth flow."""
    project = _fake_project(owner_id)
    fake_redis = _fake_redis(blacklisted)

    async def fake_repo_get(self, id):
        return project

    async def fake_membership(self, project_id, user_id):
        return MagicMock() if member else None

    from app.repositories.project import ProjectRepository
    from app.repositories.project_member import ProjectMemberRepository
    original_get = ProjectRepository.get
    original_membership = ProjectMemberRepository.get_membership
    ProjectRepository.get = fake_repo_get
    ProjectMemberRepository.get_membership = fake_membership

    with patch("app.api.routers.ws.redis_client", fake_redis):
        try:
            yield project
        finally:
            ProjectRepository.get = original_get
            ProjectMemberRepository.get_membership = original_membership


# ── tests ────────────────────────────────────────────────────────────────────

def test_ws_auth_valid_token_returns_auth_ok():
    token, user_id = _valid_token()

    with _ws_context(user_id) as project:
        with TestClient(app) as client:
            with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                ws.send_json({"type": "auth", "token": token})
                msg = ws.receive_json()

    assert msg["type"] == "auth_ok"
    assert msg["user_id"] == user_id


def test_ws_auth_invalid_token_closes_4001():
    project_id = uuid.uuid4()
    fake_redis = _fake_redis()

    with patch("app.api.routers.ws.redis_client", fake_redis):
        with TestClient(app) as client:
            with pytest.raises(Exception):
                with client.websocket_connect(f"/api/v1/ws/projects/{project_id}") as ws:
                    ws.send_json({"type": "auth", "token": "not.a.real.jwt"})
                    ws.receive_json()


def test_ws_auth_refresh_token_rejected():
    user_id = str(uuid.uuid4())
    refresh = create_refresh_token({"sub": user_id})

    with _ws_context(user_id) as project:
        with TestClient(app) as client:
            with pytest.raises(Exception):
                with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                    ws.send_json({"type": "auth", "token": refresh})
                    ws.receive_json()


def test_ws_auth_blacklisted_token_rejected():
    token, user_id = _valid_token()

    with _ws_context(user_id, blacklisted=True) as project:
        with TestClient(app) as client:
            with pytest.raises(Exception):
                with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                    ws.send_json({"type": "auth", "token": token})
                    ws.receive_json()


def test_ws_non_member_rejected():
    token, user_id = _valid_token()
    different_user = str(uuid.uuid4())

    # project owned by a different user, requester is NOT a member
    with _ws_context(different_user, member=False) as project:
        with TestClient(app) as client:
            with pytest.raises(Exception):
                with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                    ws.send_json({"type": "auth", "token": token})
                    ws.receive_json()


def test_ws_member_allowed():
    token, user_id = _valid_token()
    different_user = str(uuid.uuid4())

    # project owned by someone else, but requester IS a member → allowed
    with _ws_context(different_user, member=True) as project:
        with TestClient(app) as client:
            with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                ws.send_json({"type": "auth", "token": token})
                msg = ws.receive_json()

    assert msg["type"] == "auth_ok"
    assert msg["user_id"] == user_id


def test_ws_ping_returns_pong():
    token, user_id = _valid_token()

    with _ws_context(user_id) as project:
        with TestClient(app) as client:
            with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                ws.send_json({"type": "auth", "token": token})
                assert ws.receive_json()["type"] == "auth_ok"
                ws.send_json({"type": "ping"})
                pong = ws.receive_json()

    assert pong["type"] == "pong"


def test_ws_project_not_found_rejects():
    token, user_id = _valid_token()
    fake_redis = _fake_redis()
    project_id = uuid.uuid4()

    async def repo_returns_none(self, id):
        return None

    from app.repositories.project import ProjectRepository
    original_get = ProjectRepository.get
    ProjectRepository.get = repo_returns_none

    with patch("app.api.routers.ws.redis_client", fake_redis):
        try:
            with TestClient(app) as client:
                with pytest.raises(Exception):
                    with client.websocket_connect(f"/api/v1/ws/projects/{project_id}") as ws:
                        ws.send_json({"type": "auth", "token": token})
                        ws.receive_json()
        finally:
            ProjectRepository.get = original_get


def test_ws_poker_round_trip():
    """Regression guard: the WS route must reach ws_project (not the _handle_poker
    helper) so planning-poker messages broadcast. Catches a misplaced decorator."""
    token, user_id = _valid_token()

    with _ws_context(user_id) as project:
        with TestClient(app) as client:
            with client.websocket_connect(f"/api/v1/ws/projects/{project.id}") as ws:
                ws.send_json({"type": "auth", "token": token})
                assert ws.receive_json()["type"] == "auth_ok"

                task_id = str(uuid.uuid4())
                ws.send_json({"type": "poker.start", "task_id": task_id})
                assert ws.receive_json() == {"type": "poker.started", "task_id": task_id, "by": user_id}

                ws.send_json({"type": "poker.vote", "task_id": task_id, "value": 5})
                voted = ws.receive_json()
                assert voted["type"] == "poker.voted"
                assert voted["voters"] == [user_id]   # the bug showed 0 voters

                ws.send_json({"type": "poker.reveal", "task_id": task_id})
                revealed = ws.receive_json()
                assert revealed["type"] == "poker.revealed"
                assert revealed["votes"] == {user_id: 5}
