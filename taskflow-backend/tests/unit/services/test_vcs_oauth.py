"""Unit tests for OAuth Device Flow (GitHub/GitLab) via respx-mocked HTTP."""
import pytest
import respx

from app.core.config import settings
from app.core.errors import AppError
from app.services.vcs import oauth


@pytest.fixture(autouse=True)
def _configure(monkeypatch):
    monkeypatch.setattr(settings, "github_oauth_client_id", "gh_cid")
    monkeypatch.setattr(settings, "gitlab_oauth_client_id", "gl_cid")
    monkeypatch.setattr(settings, "gitlab_base_url", "https://gitlab.com")


def test_supports_device_flow():
    assert oauth.supports_device_flow("github") is True
    assert oauth.supports_device_flow("gitlab") is True
    assert oauth.supports_device_flow("bitbucket") is False


@respx.mock
async def test_github_start():
    respx.post("https://github.com/login/device/code").respond(json={
        "device_code": "DC", "user_code": "WDJB-MJHT",
        "verification_uri": "https://github.com/login/device", "interval": 5, "expires_in": 900})
    res = await oauth.start_device_flow("github")
    assert res["device_code"] == "DC" and res["user_code"] == "WDJB-MJHT"
    assert res["verification_uri"].endswith("/device")


@respx.mock
async def test_github_poll_pending():
    respx.post("https://github.com/login/oauth/access_token").respond(
        json={"error": "authorization_pending"})
    res = await oauth.poll_device_flow("github", "DC")
    assert res["status"] == "pending" and res["error"] == "authorization_pending"


@respx.mock
async def test_github_poll_success():
    respx.post("https://github.com/login/oauth/access_token").respond(
        json={"access_token": "gho_xyz", "token_type": "bearer"})
    res = await oauth.poll_device_flow("github", "DC")
    assert res["status"] == "ok" and res["access_token"] == "gho_xyz"


@respx.mock
async def test_gitlab_start_uses_base_url():
    route = respx.post("https://gitlab.com/oauth/authorize_device").respond(json={
        "device_code": "GD", "user_code": "ABCD", "verification_uri": "https://gitlab.com/-/device",
        "interval": 5, "expires_in": 600})
    res = await oauth.start_device_flow("gitlab")
    assert route.called and res["user_code"] == "ABCD"


@respx.mock
async def test_gitlab_poll_success_with_refresh():
    respx.post("https://gitlab.com/oauth/token").respond(
        json={"access_token": "glat", "refresh_token": "glrt"})
    res = await oauth.poll_device_flow("gitlab", "GD")
    assert res["status"] == "ok" and res["refresh_token"] == "glrt"


async def test_unconfigured_provider_raises(monkeypatch):
    monkeypatch.setattr(settings, "github_oauth_client_id", None)
    with pytest.raises(AppError):
        await oauth.start_device_flow("github")
