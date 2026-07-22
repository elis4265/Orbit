"""REQ-155 — instance admin: superuser promotion, user management, deactivation gates."""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_redis
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.services.instance_admin import promote_superuser


class FakeRedis:
    def __init__(self):
        self.store = {}

    async def set(self, key, value, ex=None):
        self.store[key] = str(value)

    async def get(self, key):
        return self.store.get(key)

    async def exists(self, key):
        return 1 if key in self.store else 0


@pytest.fixture(autouse=True)
def _fake_redis():
    """Every authenticated request hits the blacklist check — no live Redis locally."""
    fake = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_redis, None)


async def _register_and_verify(ac: AsyncClient, db_session, email: str, password: str = "Password123"):
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


async def _login_token(ac: AsyncClient, email: str, password: str = "Password123") -> str:
    resp = await ac.post("/api/v1/auth/login", data={"username": email, "password": password})
    return resp.json()["access_token"]


async def _make_superuser(ac: AsyncClient, db_session, email: str):
    user = await _register_and_verify(ac, db_session, email)
    await promote_superuser(db_session, email)
    await db_session.commit()
    token = await _login_token(ac, email)
    return user, {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_promote_superuser_is_idempotent_and_tolerates_unknown_email(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        user = await _register_and_verify(ac, db_session, "boss@taskflow.io")
        assert user.is_superuser is False

        await promote_superuser(db_session, "boss@taskflow.io")
        await promote_superuser(db_session, "boss@taskflow.io")  # idempotent
        await db_session.refresh(user)
        assert user.is_superuser is True

        # Unknown email: no crash, no user created
        await promote_superuser(db_session, "nobody@taskflow.io")


@pytest.mark.asyncio
async def test_admin_endpoints_403_for_regular_users(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_verify(ac, db_session, "pleb@taskflow.io")
        token = await _login_token(ac, "pleb@taskflow.io")
        headers = {"Authorization": f"Bearer {token}"}

        assert (await ac.get("/api/v1/admin/users", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_admin_lists_and_searches_users(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        _, headers = await _make_superuser(ac, db_session, "admin@taskflow.io")
        await _register_and_verify(ac, db_session, "alice@taskflow.io")
        await _register_and_verify(ac, db_session, "bob@taskflow.io")

        resp = await ac.get("/api/v1/admin/users", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        emails = [u["email"] for u in body["users"]]
        assert {"admin@taskflow.io", "alice@taskflow.io", "bob@taskflow.io"} <= set(emails)
        assert body["total"] >= 3

        resp = await ac.get("/api/v1/admin/users?q=alice", headers=headers)
        assert [u["email"] for u in resp.json()["users"]] == ["alice@taskflow.io"]


@pytest.mark.asyncio
async def test_deactivation_kills_all_auth_paths(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        _, headers = await _make_superuser(ac, db_session, "admin2@taskflow.io")
        victim = await _register_and_verify(ac, db_session, "victim@taskflow.io")

        login = await ac.post("/api/v1/auth/login", data={"username": "victim@taskflow.io", "password": "Password123"})
        victim_token = login.json()["access_token"]
        victim_cookie = login.cookies["refresh_token"]

        # PAT issued while active
        pat_resp = await ac.post(
            "/api/v1/users/me/tokens", json={"name": "t", "scope": "write"},
            headers={"Authorization": f"Bearer {victim_token}"},
        )
        pat = pat_resp.json()["token"]

        resp = await ac.patch(
            f"/api/v1/admin/users/{victim.id}", json={"is_active": False}, headers=headers
        )
        assert resp.status_code == 200

        # Existing access token dies on next request
        me = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {victim_token}"})
        assert me.status_code == 401
        # PAT dies
        me_pat = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {pat}"})
        assert me_pat.status_code == 401
        # Password login rejected
        relog = await ac.post("/api/v1/auth/login", data={"username": "victim@taskflow.io", "password": "Password123"})
        assert relog.status_code == 401
        # Refresh rejected
        refreshed = await ac.post("/api/v1/auth/refresh", cookies={"refresh_token": victim_cookie})
        assert refreshed.status_code == 401

        # Reactivate → login works again
        resp = await ac.patch(
            f"/api/v1/admin/users/{victim.id}", json={"is_active": True}, headers=headers
        )
        assert resp.status_code == 200
        relog = await ac.post("/api/v1/auth/login", data={"username": "victim@taskflow.io", "password": "Password123"})
        assert relog.status_code == 200


@pytest.mark.asyncio
async def test_superuser_cannot_deactivate_self(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        admin, headers = await _make_superuser(ac, db_session, "admin3@taskflow.io")
        resp = await ac.patch(
            f"/api/v1/admin/users/{admin.id}", json={"is_active": False}, headers=headers
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_reset_password_creates_code(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        _, headers = await _make_superuser(ac, db_session, "admin4@taskflow.io")
        target = await _register_and_verify(ac, db_session, "forgetful@taskflow.io")

        resp = await ac.post(f"/api/v1/admin/users/{target.id}/reset-password", headers=headers)
        assert resp.status_code == 200

        pr = (await db_session.execute(
            select(PasswordReset).where(PasswordReset.user_id == target.id, PasswordReset.used == False)  # noqa: E712
        )).scalars().first()
        assert pr is not None

        # The emitted code completes the normal REQ-154 flow
        done = await ac.post("/api/v1/auth/reset-password", json={
            "email": "forgetful@taskflow.io", "code": pr.code, "new_password": "NewPassword2",
        })
        assert done.status_code == 200


@pytest.mark.asyncio
async def test_superuser_flag_never_grants_project_access(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        _, headers = await _make_superuser(ac, db_session, "admin5@taskflow.io")
        pleb = await _register_and_verify(ac, db_session, "owner@taskflow.io")
        pleb_token = await _login_token(ac, "owner@taskflow.io")

        proj = await ac.post(
            "/api/v1/projects", json={"name": "Private"},
            headers={"Authorization": f"Bearer {pleb_token}"},
        )
        project_id = proj.json()["id"]

        # Superuser is not a member — project reads must 403/404, not leak
        resp = await ac.get(f"/api/v1/projects/{project_id}/tasks", headers=headers)
        assert resp.status_code in (403, 404)
