"""REQ-154 — password reset via emailed single-use code (login-page flow)."""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_redis
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset


class FakeRedis:
    """Dict-backed stand-in: set/get/exists cover blacklist + pw-invalidation keys."""

    def __init__(self):
        self.store = {}

    async def set(self, key, value, ex=None):
        self.store[key] = str(value)

    async def get(self, key):
        return self.store.get(key)

    async def exists(self, key):
        return 1 if key in self.store else 0


async def _register_and_verify(ac: AsyncClient, db_session, email: str, password: str):
    username = email.split("@")[0].replace(".", "_")
    await ac.post("/api/v1/auth/register", json={
        "email": email, "username": username, "password": password,
        "first_name": "Test", "last_name": "User",
    })
    user = (await db_session.execute(select(User).where(User.email == email))).scalars().first()
    ev = (await db_session.execute(
        select(EmailVerification)
        .where(EmailVerification.user_id == user.id, EmailVerification.used == False)  # noqa: E712
        .order_by(EmailVerification.created_at.desc())
    )).scalars().first()
    await ac.post("/api/v1/auth/verify-email", json={"email": email, "code": ev.code, "new_password": password})
    return user


async def _latest_reset_code(db_session, user_id) -> PasswordReset | None:
    return (await db_session.execute(
        select(PasswordReset)
        .where(PasswordReset.user_id == user_id, PasswordReset.used == False)  # noqa: E712
        .order_by(PasswordReset.created_at.desc())
    )).scalars().first()


@pytest.mark.asyncio
async def test_forgot_password_full_flow(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "reset@taskflow.io", "OldPassword1")

        resp = await ac.post("/api/v1/auth/forgot-password", json={"email": "reset@taskflow.io"})
        assert resp.status_code == 200

        pr = await _latest_reset_code(db_session, user.id)
        assert pr is not None and len(pr.code) == 6

        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "reset@taskflow.io", "code": pr.code, "new_password": "NewPassword2",
        })
        assert resp.status_code == 200

        old = await ac.post("/api/v1/auth/login", data={"username": "reset@taskflow.io", "password": "OldPassword1"})
        assert old.status_code == 401
        new = await ac.post("/api/v1/auth/login", data={"username": "reset@taskflow.io", "password": "NewPassword2"})
        assert new.status_code == 200


@pytest.mark.asyncio
async def test_forgot_password_unknown_email_no_enumeration(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/forgot-password", json={"email": "ghost@taskflow.io"})
        assert resp.status_code == 200
        # Same generic message as the known-email case; no code row created
        assert "if that email" in resp.json()["message"].lower()
    rows = (await db_session.execute(select(PasswordReset))).scalars().all()
    assert rows == []


@pytest.mark.asyncio
async def test_reset_with_wrong_code_returns_400(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_verify(ac, db_session, "wrongcode@taskflow.io", "OldPassword1")
        await ac.post("/api/v1/auth/forgot-password", json={"email": "wrongcode@taskflow.io"})
        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "wrongcode@taskflow.io", "code": "000000", "new_password": "NewPassword2",
        })
        # 000000 collides with the real code once in 10^6 — regenerate would be flaky theater
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_reset_code_is_single_use(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "singleuse@taskflow.io", "OldPassword1")
        await ac.post("/api/v1/auth/forgot-password", json={"email": "singleuse@taskflow.io"})
        pr = await _latest_reset_code(db_session, user.id)

        first = await ac.post("/api/v1/auth/reset-password", json={
            "email": "singleuse@taskflow.io", "code": pr.code, "new_password": "NewPassword2",
        })
        assert first.status_code == 200
        second = await ac.post("/api/v1/auth/reset-password", json={
            "email": "singleuse@taskflow.io", "code": pr.code, "new_password": "NewPassword3",
        })
        assert second.status_code == 400


@pytest.mark.asyncio
async def test_expired_code_returns_400(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "expired@taskflow.io", "OldPassword1")
        pr = PasswordReset(
            user_id=user.id,
            code="123456",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        db_session.add(pr)
        await db_session.commit()

        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "expired@taskflow.io", "code": "123456", "new_password": "NewPassword2",
        })
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_weak_new_password_returns_422(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "weakpw@taskflow.io", "OldPassword1")
        await ac.post("/api/v1/auth/forgot-password", json={"email": "weakpw@taskflow.io"})
        pr = await _latest_reset_code(db_session, user.id)
        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "weakpw@taskflow.io", "code": pr.code, "new_password": "weak",
        })
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_new_request_invalidates_previous_code(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "rotate@taskflow.io", "OldPassword1")
        await ac.post("/api/v1/auth/forgot-password", json={"email": "rotate@taskflow.io"})
        first = await _latest_reset_code(db_session, user.id)
        await ac.post("/api/v1/auth/forgot-password", json={"email": "rotate@taskflow.io"})

        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "rotate@taskflow.io", "code": first.code, "new_password": "NewPassword2",
        })
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_refresh_token_invalidated_after_reset(db_session):
    fake_redis = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake_redis
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            user = await _register_and_verify(ac, db_session, "sessions@taskflow.io", "OldPassword1")
            login = await ac.post("/api/v1/auth/login", data={"username": "sessions@taskflow.io", "password": "OldPassword1"})
            refresh_cookie = login.cookies["refresh_token"]

            await ac.post("/api/v1/auth/forgot-password", json={"email": "sessions@taskflow.io"})
            pr = await _latest_reset_code(db_session, user.id)
            reset = await ac.post("/api/v1/auth/reset-password", json={
                "email": "sessions@taskflow.io", "code": pr.code, "new_password": "NewPassword2",
            })
            assert reset.status_code == 200

            resp = await ac.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_cookie})
            assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_redis, None)
