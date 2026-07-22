"""REQ-150 — Google SSO: token exchange, signup-on-first-login, rejections."""
import uuid

import pytest
import respx
from httpx import AsyncClient, ASGITransport, Response as HttpxResponse

from app.main import app
from app.core.config import settings
from app.repositories.user import UserRepository

pytestmark = pytest.mark.integration

TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture(autouse=True)
def _google_configured():
    old = settings.google_oauth_client_id
    settings.google_oauth_client_id = "orbit-test-client"
    yield
    settings.google_oauth_client_id = old


@pytest.mark.asyncio
@respx.mock
async def test_google_login_creates_user_and_issues_tokens(db_session):
    email = f"g_{uuid.uuid4().hex[:6]}@gmail.com"
    respx.get(TOKENINFO).mock(return_value=HttpxResponse(200, json={
        "aud": "orbit-test-client", "email": email, "email_verified": "true",
        "given_name": "Grumpy", "family_name": "Engineer",
    }))
    async with _client() as ac:
        res = await ac.post("/api/v1/auth/google", json={"credential": "fake-jwt"})
        assert res.status_code == 200
        assert res.json()["access_token"]

    user = await UserRepository(db_session).get_by_email(email)
    assert user is not None
    assert user.is_verified is True
    assert user.first_name == "Grumpy"

    # second login: same user, no duplicate
    async with _client() as ac:
        assert (await ac.post("/api/v1/auth/google", json={"credential": "fake-jwt"})).status_code == 200


@pytest.mark.asyncio
@respx.mock
async def test_google_login_rejects_wrong_audience_and_unverified(db_session):
    respx.get(TOKENINFO).mock(return_value=HttpxResponse(200, json={
        "aud": "someone-else", "email": "x@gmail.com", "email_verified": "true",
    }))
    async with _client() as ac:
        assert (await ac.post("/api/v1/auth/google", json={"credential": "j"})).status_code == 401

    respx.get(TOKENINFO).mock(return_value=HttpxResponse(200, json={
        "aud": "orbit-test-client", "email": "x@gmail.com", "email_verified": "false",
    }))
    async with _client() as ac:
        assert (await ac.post("/api/v1/auth/google", json={"credential": "j"})).status_code == 401


@pytest.mark.asyncio
async def test_google_login_503_when_unconfigured(db_session):
    settings.google_oauth_client_id = None
    async with _client() as ac:
        assert (await ac.post("/api/v1/auth/google", json={"credential": "j"})).status_code == 503
        providers = (await ac.get("/api/v1/auth/providers")).json()
        assert providers["google_client_id"] is None
