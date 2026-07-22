"""Logged-in password change (REQ-154 follow-up) — current-password gate,
session revocation, and the per-event API-token purge checkbox on both the
change and reset flows."""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_redis
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.models.api_token import ApiToken


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


async def _login(ac: AsyncClient, email: str, password: str) -> str:
    resp = await ac.post("/api/v1/auth/login", data={"username": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_change_password_full_flow(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_verify(ac, db_session, "changer@taskflow.io", "OldPassword1")
        token = await _login(ac, "changer@taskflow.io", "OldPassword1")

        resp = await ac.post("/api/v1/users/me/change-password", headers=_auth(token), json={
            "current_password": "OldPassword1", "new_password": "NewPassword2",
        })
        assert resp.status_code == 200

        old = await ac.post("/api/v1/auth/login", data={"username": "changer@taskflow.io", "password": "OldPassword1"})
        assert old.status_code == 401
        new = await ac.post("/api/v1/auth/login", data={"username": "changer@taskflow.io", "password": "NewPassword2"})
        assert new.status_code == 200


@pytest.mark.asyncio
async def test_change_password_wrong_current_401(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_verify(ac, db_session, "wrongcur@taskflow.io", "OldPassword1")
        token = await _login(ac, "wrongcur@taskflow.io", "OldPassword1")

        resp = await ac.post("/api/v1/users/me/change-password", headers=_auth(token), json={
            "current_password": "NotThePassword9", "new_password": "NewPassword2",
        })
        assert resp.status_code == 401
        # Password unchanged
        ok = await ac.post("/api/v1/auth/login", data={"username": "wrongcur@taskflow.io", "password": "OldPassword1"})
        assert ok.status_code == 200


@pytest.mark.asyncio
async def test_change_password_weak_new_422(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_verify(ac, db_session, "weaknew@taskflow.io", "OldPassword1")
        token = await _login(ac, "weaknew@taskflow.io", "OldPassword1")
        resp = await ac.post("/api/v1/users/me/change-password", headers=_auth(token), json={
            "current_password": "OldPassword1", "new_password": "weak",
        })
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_change_password_requires_auth(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/v1/users/me/change-password", json={
            "current_password": "OldPassword1", "new_password": "NewPassword2",
        })
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_api_tokens_survive_by_default(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "keeptok@taskflow.io", "OldPassword1")
        token = await _login(ac, "keeptok@taskflow.io", "OldPassword1")
        created = await ac.post("/api/v1/users/me/tokens", headers=_auth(token),
                                json={"name": "ci", "scope": "read"})
        assert created.status_code in (200, 201)

        resp = await ac.post("/api/v1/users/me/change-password", headers=_auth(token), json={
            "current_password": "OldPassword1", "new_password": "NewPassword2",
        })
        assert resp.status_code == 200

        rows = (await db_session.execute(
            select(ApiToken).where(ApiToken.user_id == user.id)
        )).scalars().all()
        assert len(rows) == 1  # survives — checkbox was off


@pytest.mark.asyncio
async def test_api_tokens_purged_on_optin(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "purgetok@taskflow.io", "OldPassword1")
        token = await _login(ac, "purgetok@taskflow.io", "OldPassword1")
        created = await ac.post("/api/v1/users/me/tokens", headers=_auth(token),
                                json={"name": "ci", "scope": "read"})
        assert created.status_code in (200, 201)

        resp = await ac.post("/api/v1/users/me/change-password", headers=_auth(token), json={
            "current_password": "OldPassword1", "new_password": "NewPassword2",
            "revoke_api_tokens": True,
        })
        assert resp.status_code == 200

        rows = (await db_session.execute(
            select(ApiToken).where(ApiToken.user_id == user.id)
        )).scalars().all()
        assert rows == []


@pytest.mark.asyncio
async def test_reset_flow_purges_tokens_on_optin(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "resettok@taskflow.io", "OldPassword1")
        token = await _login(ac, "resettok@taskflow.io", "OldPassword1")
        created = await ac.post("/api/v1/users/me/tokens", headers=_auth(token),
                                json={"name": "ci", "scope": "read"})
        assert created.status_code in (200, 201)

        await ac.post("/api/v1/auth/forgot-password", json={"email": "resettok@taskflow.io"})
        pr = (await db_session.execute(
            select(PasswordReset)
            .where(PasswordReset.user_id == user.id, PasswordReset.used == False)  # noqa: E712
            .order_by(PasswordReset.created_at.desc())
        )).scalars().first()

        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "resettok@taskflow.io", "code": pr.code,
            "new_password": "NewPassword2", "revoke_api_tokens": True,
        })
        assert resp.status_code == 200

        rows = (await db_session.execute(
            select(ApiToken).where(ApiToken.user_id == user.id)
        )).scalars().all()
        assert rows == []


@pytest.mark.asyncio
async def test_password_set_by_user_flag_lifecycle(db_session):
    """SSO accounts start with password_set_by_user=False; the reset flow
    (their 'Set a password' UX) flips it true. Registered accounts start true."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Registered account → flag true, visible via /auth/me
        await _register_and_verify(ac, db_session, "flagreg@taskflow.io", "OldPassword1")
        token = await _login(ac, "flagreg@taskflow.io", "OldPassword1")
        me = await ac.get("/api/v1/auth/me", headers=_auth(token))
        assert me.json()["password_set_by_user"] is True

        # Simulated SSO account (random unseen password, flag false)
        sso = (await db_session.execute(select(User).where(User.email == "flagreg@taskflow.io"))).scalars().first()
        sso.password_set_by_user = False
        await db_session.commit()

        # Set-a-password path = reset flow → flag flips true
        await ac.post("/api/v1/auth/forgot-password", json={"email": "flagreg@taskflow.io"})
        pr = (await db_session.execute(
            select(PasswordReset)
            .where(PasswordReset.user_id == sso.id, PasswordReset.used == False)  # noqa: E712
            .order_by(PasswordReset.created_at.desc())
        )).scalars().first()
        resp = await ac.post("/api/v1/auth/reset-password", json={
            "email": "flagreg@taskflow.io", "code": pr.code, "new_password": "NewPassword2",
        })
        assert resp.status_code == 200

        token = await _login(ac, "flagreg@taskflow.io", "NewPassword2")
        me = await ac.get("/api/v1/auth/me", headers=_auth(token))
        assert me.json()["password_set_by_user"] is True


@pytest.mark.asyncio
async def test_refresh_token_invalidated_after_change(db_session):
    fake_redis = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake_redis
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            await _register_and_verify(ac, db_session, "chsessions@taskflow.io", "OldPassword1")
            login = await ac.post("/api/v1/auth/login", data={"username": "chsessions@taskflow.io", "password": "OldPassword1"})
            token = login.json()["access_token"]
            refresh_cookie = login.cookies["refresh_token"]

            resp = await ac.post("/api/v1/users/me/change-password", headers=_auth(token), json={
                "current_password": "OldPassword1", "new_password": "NewPassword2",
            })
            assert resp.status_code == 200

            resp = await ac.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh_cookie})
            assert resp.status_code == 401
    finally:
        app.dependency_overrides.pop(get_redis, None)
