"""Integration tests for VCS connection CRUD + dev-links read.

Also closes the loop: a connection created via the API (with its generated
secret) drives the inbound webhook and the resulting dev-link is readable.
"""
import hashlib
import hmac
import json
import uuid

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.core.config import settings
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.services.vcs import oauth

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    s = uuid.uuid4().hex[:6]
    user = await UserRepository(db_session).create({
        "email": f"vc_{s}@test.io", "hashed_password": "h", "username": f"vc_{s}",
        "first_name": "V", "last_name": "C", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "VC", "name": "VC Proj", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Main", "project_id": project.id})
    return user, project, board


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_connection_crud(seeded, db_session):
    user, project, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/vcs-connections"
            created = await ac.post(base, json={"provider": "github", "repo_identifier": "o/r"})
            assert created.status_code == 201
            body = created.json()
            assert body["webhook_secret"]  # returned once
            assert body["webhook_url"].endswith(f"/vcs/github/webhook/{body['id']}")

            lst = await ac.get(base)
            assert lst.status_code == 200 and len(lst.json()) == 1
            assert "webhook_secret" not in lst.json()[0]  # not exposed on list

            upd = await ac.patch(f"{base}/{body['id']}", json={"settings": {"pr_merged": "in_progress"}})
            assert upd.status_code == 200 and upd.json()["settings"]["pr_merged"] == "in_progress"

            assert (await ac.delete(f"{base}/{body['id']}")).status_code == 204
            assert (await ac.get(base)).json() == []

            # unsupported provider rejected
            assert (await ac.post(base, json={"provider": "svn", "repo_identifier": "x"})).status_code == 422
            assert (await ac.patch(f"{base}/{uuid.uuid4()}", json={"settings": {}})).status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_providers_endpoint(seeded, db_session, monkeypatch):
    user, project, board = seeded
    monkeypatch.setattr(settings, "github_oauth_client_id", "cid")
    monkeypatch.setattr(settings, "encryption_key", Fernet.generate_key().decode())
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            r = (await ac.get("/api/v1/integrations/providers")).json()
            assert r["encryption_configured"] is True
            assert r["providers"]["github"]["device_flow"] is True
            assert r["providers"]["bitbucket"]["auth"] == "token"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_device_flow_connects_and_stores_token(seeded, db_session, monkeypatch):
    user, project, board = seeded
    monkeypatch.setattr(settings, "github_oauth_client_id", "cid")
    monkeypatch.setattr(settings, "encryption_key", Fernet.generate_key().decode())

    async def fake_start(provider):
        return {"device_code": "DC", "user_code": "WX-YZ",
                "verification_uri": "https://github.com/login/device", "interval": 5, "expires_in": 900}

    async def fake_poll(provider, device_code):
        assert device_code == "DC"
        return {"status": "ok", "access_token": "gho_secret", "refresh_token": None}

    monkeypatch.setattr(oauth, "start_device_flow", fake_start)
    monkeypatch.setattr(oauth, "poll_device_flow", fake_poll)

    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/vcs-connections"
            conn = (await ac.post(base, json={"provider": "github", "repo_identifier": "o/r"})).json()
            assert conn["connected"] is False

            started = (await ac.post(f"{base}/{conn['id']}/device/start")).json()
            assert started["user_code"] == "WX-YZ"

            polled = await ac.post(f"{base}/{conn['id']}/device/poll", json={"device_code": started["device_code"]})
            assert polled.status_code == 200 and polled.json()["status"] == "connected"

            lst = (await ac.get(base)).json()
            assert lst[0]["connected"] is True            # stored, encrypted
            assert "webhook_secret" not in lst[0]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_bitbucket_token_stored_on_create(seeded, db_session, monkeypatch):
    user, project, board = seeded
    monkeypatch.setattr(settings, "encryption_key", Fernet.generate_key().decode())
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/vcs-connections"
            created = await ac.post(base, json={
                "provider": "bitbucket", "repo_identifier": "o/r", "token": "bb_app_pw"})
            assert created.status_code == 201 and created.json()["connected"] is True
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_created_connection_drives_webhook_and_dev_links(seeded, db_session):
    user, project, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/vcs-connections"
            conn = (await ac.post(base, json={"provider": "github", "repo_identifier": "o/r"})).json()
            secret = conn["webhook_secret"]

            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks",
                json={"title": "loop"})).json()
            ref = f"VC-{task['sequence_number']}"

            payload = {"action": "opened", "pull_request": {
                "id": 1, "number": 9, "title": f"Fix {ref}", "body": "",
                "html_url": "https://github.com/o/r/pull/9", "merged": False,
                "head": {"ref": "feat/x"}, "user": {"login": "octocat"}}}
            raw = json.dumps(payload).encode()
            sig = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
            r = await ac.post(f"/api/v1/vcs/github/webhook/{conn['id']}", content=raw, headers={
                "X-GitHub-Event": "pull_request", "X-GitHub-Delivery": uuid.uuid4().hex,
                "X-Hub-Signature-256": sig, "Content-Type": "application/json"})
            assert r.status_code == 200 and r.json()["linked"] == 1

            links = (await ac.get(
                f"/api/v1/projects/{project.id}/tasks/{task['id']}/dev-links")).json()
            assert len(links) == 1
            assert links[0]["kind"] == "pr" and links[0]["number"] == 9
            assert links[0]["url"].endswith("/pull/9")
            # repo context for multi-repo disambiguation
            assert links[0]["provider"] == "github" and links[0]["repo_identifier"] == "o/r"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
