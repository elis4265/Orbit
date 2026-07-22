import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_redis
from app.core.security import create_refresh_token, decode_token
from app.models.user import User
from app.models.email_verification import EmailVerification


# ─── helpers ────────────────────────────────────────────────────────────────

async def _register_and_login(ac: AsyncClient, db_session, email: str, password: str, username: str | None = None):
    """Register, verify email, then login. Returns the login response."""
    _username = username or email.split("@")[0].replace(".", "_")
    await ac.post("/api/v1/auth/register", json={
        "email": email, "username": _username, "password": password,
        "first_name": "Test", "last_name": "User",
    })

    # Read the verification code directly from the test DB
    user = (await db_session.execute(select(User).where(User.email == email))).scalars().first()
    ev = (await db_session.execute(
        select(EmailVerification)
        .where(EmailVerification.user_id == user.id, EmailVerification.used == False)  # noqa: E712
        .order_by(EmailVerification.created_at.desc())
    )).scalars().first()
    await ac.post("/api/v1/auth/verify-email", json={"email": email, "code": ev.code, "new_password": password})

    return await ac.post("/api/v1/auth/login", data={"username": email, "password": password})


# ─── register / login ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auth_lifecycle_register_and_login(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        reg_response = await ac.post("/api/v1/auth/register", json={
            "email": "pipeline@taskflow.io",
            "username": "pipeline",
            "password": "SuperSecurePassword123",
            "first_name": "Test",
            "last_name": "User",
        })
        assert reg_response.status_code == 201

        user = (await db_session.execute(select(User).where(User.email == "pipeline@taskflow.io"))).scalars().first()
        ev = (await db_session.execute(
            select(EmailVerification).where(EmailVerification.user_id == user.id)
        )).scalars().first()
        await ac.post("/api/v1/auth/verify-email", json={"email": "pipeline@taskflow.io", "code": ev.code, "new_password": "SuperSecurePassword123"})

        login_response = await ac.post(
            "/api/v1/auth/login",
            data={"username": "pipeline@taskflow.io", "password": "SuperSecurePassword123"},
        )
        assert login_response.status_code == 200
        token_data = login_response.json()
        assert "access_token" in token_data
        assert token_data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_sets_refresh_cookie(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await _register_and_login(ac, db_session, "cookie@taskflow.io", "Password123!")
        assert resp.status_code == 200
        assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_login(ac, db_session, "wrong@taskflow.io", "CorrectHorse99")
        resp = await ac.post("/api/v1/auth/login", data={"username": "wrong@taskflow.io", "password": "BadPassword"})
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_duplicate_register_returns_400(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Register and verify so the account is verified (re-registration of unverified is allowed by design)
        await _register_and_login(ac, db_session, "dup@taskflow.io", "Password123!", username="dup1")
        resp = await ac.post("/api/v1/auth/register", json={"email": "dup@taskflow.io", "username": "dup2", "password": "Password123!", "first_name": "Test", "last_name": "User"})
        assert resp.status_code == 400


# ─── /refresh ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refresh_issues_new_access_token(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.set = AsyncMock()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await _register_and_login(ac, db_session, "refresh@taskflow.io", "Password123!")
        old_access = login_resp.json()["access_token"]

        with patch("app.api.routers.auth.get_redis", return_value=lambda: mock_redis):
            with patch("app.api.dependencies.get_redis", return_value=lambda: mock_redis):
                refresh_resp = await ac.post(
                    "/api/v1/auth/refresh",
                    cookies={"refresh_token": login_resp.cookies["refresh_token"]},
                )

    assert refresh_resp.status_code == 200
    new_access = refresh_resp.json()["access_token"]
    assert new_access != old_access
    assert decode_token(new_access)["type"] == "access"


@pytest.mark.asyncio
async def test_refresh_without_cookie_returns_401(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("app.api.routers.auth.get_redis", return_value=lambda: mock_redis):
            resp = await ac.post("/api/v1/auth/refresh")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_access_token_as_cookie_returns_401(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await _register_and_login(ac, db_session, "badcookie@taskflow.io", "Password123!")
        access_token = login_resp.json()["access_token"]

        with patch("app.api.routers.auth.get_redis", return_value=lambda: mock_redis):
            resp = await ac.post("/api/v1/auth/refresh", cookies={"refresh_token": access_token})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_blacklisted_token_returns_401(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=1)
    app.dependency_overrides[get_redis] = lambda: mock_redis

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login_resp = await _register_and_login(ac, db_session, "revoked@taskflow.io", "Password123!")
            refresh_cookie = login_resp.cookies["refresh_token"]

            resp = await ac.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_cookie})
        assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_redis, None)


@pytest.mark.asyncio
async def test_refresh_rotates_cookie(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.set = AsyncMock()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await _register_and_login(ac, db_session, "rotate@taskflow.io", "Password123!")
        old_refresh = login_resp.cookies["refresh_token"]

        with patch("app.api.routers.auth.get_redis", return_value=lambda: mock_redis):
            with patch("app.api.dependencies.get_redis", return_value=lambda: mock_redis):
                refresh_resp = await ac.post("/api/v1/auth/refresh", cookies={"refresh_token": old_refresh})

    assert refresh_resp.status_code == 200
    new_refresh = refresh_resp.cookies.get("refresh_token")
    assert new_refresh is not None
    assert new_refresh != old_refresh


# ─── /logout ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_logout_returns_204(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.set = AsyncMock()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await _register_and_login(ac, db_session, "logout@taskflow.io", "Password123!")
        access_token = login_resp.json()["access_token"]

        with patch("app.api.dependencies.get_redis", return_value=lambda: mock_redis):
            resp = await ac.post(
                "/api/v1/auth/logout",
                headers={"Authorization": f"Bearer {access_token}"},
                cookies={"refresh_token": login_resp.cookies["refresh_token"]},
            )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_logout_blacklists_access_token_jti(db_session):
    blacklisted_jtis: list[str] = []

    async def fake_set(key: str, value: str, ex: int):
        blacklisted_jtis.append(key)

    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.set = AsyncMock(side_effect=fake_set)
    app.dependency_overrides[get_redis] = lambda: mock_redis

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login_resp = await _register_and_login(ac, db_session, "blacklist@taskflow.io", "Password123!")
            access_token = login_resp.json()["access_token"]
            access_jti = decode_token(access_token)["jti"]

            await ac.post(
                "/api/v1/auth/logout",
                headers={"Authorization": f"Bearer {access_token}"},
                cookies={"refresh_token": login_resp.cookies["refresh_token"]},
            )

        assert any(access_jti in k for k in blacklisted_jtis)
    finally:
        app.dependency_overrides.pop(get_redis, None)


@pytest.mark.asyncio
async def test_logout_without_token_returns_401(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/logout")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_clears_refresh_cookie(db_session):
    mock_redis = AsyncMock()
    mock_redis.exists = AsyncMock(return_value=0)
    mock_redis.set = AsyncMock()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await _register_and_login(ac, db_session, "clearcookie@taskflow.io", "Password123!")
        access_token = login_resp.json()["access_token"]

        with patch("app.api.dependencies.get_redis", return_value=lambda: mock_redis):
            resp = await ac.post(
                "/api/v1/auth/logout",
                headers={"Authorization": f"Bearer {access_token}"},
                cookies={"refresh_token": login_resp.cookies["refresh_token"]},
            )

    set_cookie_header = resp.headers.get("set-cookie", "")
    assert "refresh_token" in set_cookie_header
