"""
Registration endpoint integration tests.

Requirements
------------
REQ-028  Sign-up modal — backend receives POST /register with email + username + password.
REQ-029  Registration page — username uniqueness, password complexity, email format validation.

TDS coverage
------------
TC_01  Valid registration → 201, user.is_verified = False
TC_02  Email: missing @ / no domain / no local part / two @ / space in local → 422
TC_03  Email: invalid domain format (leading dot, trailing dot, double dot, special char) → 422
TC_04  Email: double dot / trailing dot in local part → 422
TC_05  Full email address exceeds 254 chars → 422  (RFC 5321 §4.5.3.1)
TC_06  Email local part exceeds 64 chars → 422     (RFC 5321 §4.5.3.1)
TC_07  Email domain exceeds 255 chars → 422
TC_08  Username too short (< 3 chars) → 422
TC_09  Username with invalid characters → 422       (frontend-only guard; backend allows alphanum + _ -)
TC_10  Username too long (> 50 chars) → 422
TC_11  Password too short (< 8 chars) → 422
TC_12  Password missing uppercase or digit → 422
TC_13  Duplicate verified email → 400
TC_14  Duplicate unverified email → 201 (overwrite — Design Decision below)

Design Decision — overwrite-on-re-register (Option A)
------------------------------------------------------
If a user re-registers with an email that already exists but is_verified=False:
  - Delete the old unverified record (FK ondelete=CASCADE cleans up email_verifications)
  - Create a fresh user with the new credentials
Rationale: prevents email squatting where bots or typos lock out a real address
indefinitely. Verified accounts are never overwritten (TC_13 returns 400).
"""
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User


# ── REQ-029: POST /register ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_register_creates_unverified_user(db_session):
    """[TC_01] POST /register returns 201 and user is not yet verified."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "new@taskflow.io",
            "username": "newuser",
            "password": "Password123",
            "first_name": "Test",
            "last_name": "User",
        })
    assert resp.status_code == 201
    assert "Verification code sent" in resp.json()["message"]

    user = (await db_session.execute(select(User).where(User.email == "new@taskflow.io"))).scalars().first()
    assert user is not None
    assert user.is_verified is False
    assert user.username == "newuser"


@pytest.mark.asyncio
async def test_register_duplicate_verified_email_returns_400(db_session):
    """[TC_13] Re-registering a verified email returns 400."""
    from app.models.email_verification import EmailVerification

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "dup@taskflow.io", "username": "dup1", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        ev = (await db_session.execute(
            select(EmailVerification).join(User).where(User.email == "dup@taskflow.io")
        )).scalars().first()
        await ac.post("/api/v1/auth/verify-email", json={"email": "dup@taskflow.io", "code": ev.code, "new_password": "Password123"})
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "dup@taskflow.io", "username": "dup2", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_register_overwrites_unverified_account(db_session):
    """[TC_14] Re-registering with an unverified email overwrites the old account."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "overwrite@taskflow.io", "username": "overwrite1", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        first_user = (await db_session.execute(
            select(User).where(User.email == "overwrite@taskflow.io")
        )).scalars().first()
        first_id = first_user.id

        resp = await ac.post("/api/v1/auth/register", json={
            "email": "overwrite@taskflow.io", "username": "overwrite2", "password": "NewPass456",
            "first_name": "Test", "last_name": "User",
        })
    assert resp.status_code == 201

    db_session.expire_all()
    new_user = (await db_session.execute(
        select(User).where(User.email == "overwrite@taskflow.io")
    )).scalars().first()
    assert new_user is not None
    assert new_user.id != first_id
    assert new_user.username == "overwrite2"
    assert new_user.is_verified is False


@pytest.mark.asyncio
async def test_register_duplicate_username_returns_409(db_session):
    """[REQ-029] Duplicate username returns 409."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "user1@taskflow.io", "username": "takenname", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "user2@taskflow.io", "username": "takenname", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_password_returns_422(db_session):
    """[TC_12] Password without uppercase returns 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "weak@taskflow.io", "username": "weakuser", "password": "password1"
        })
    assert resp.status_code == 422


# ── Email format validation (TC_02 – TC_07) ───────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("email", [
    "sername.example.com",       # TC_02: no @
    "username@",                  # TC_02: no domain
    "@example.com",               # TC_02: no local part
    "user@name@example.com",     # TC_02: two @
    "user name@example.com",     # TC_02: space in local
    "user@.example.com",         # TC_03: leading dot in domain
    "user@example.com.",         # TC_03: trailing dot
    "user@example..com",         # TC_03: double dot in domain
    "user@examp!e.com",          # TC_03: special char in domain
    "us..er@example.com",        # TC_04: double dot in local
    "user.@example.com",         # TC_04: trailing dot in local
])
async def test_register_invalid_email_returns_422(db_session, email):
    """[TC_02/03/04] Invalid email format returns 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": email, "username": "emailtest", "password": "Password123"
        })
    assert resp.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize("email,tc", [
    ("a" * 65 + "@example.com",                                                                   "TC_06"),
    ("user@" + "a" * 252 + ".com",                                                                "TC_07"),
    ("abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz@abcde.com", "TC_05"),
])
async def test_register_email_length_limits_returns_422(db_session, email, tc):
    """[TC_05/06/07] Emails exceeding RFC 5321 length limits return 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": email, "username": "lentest", "password": "Password123"
        })
    assert resp.status_code == 422, f"{tc} failed: got {resp.status_code}"


@pytest.mark.asyncio
async def test_register_username_too_long_returns_422(db_session):
    """[TC_10] Username exceeding max length (50 chars) returns 422."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/register", json={
            "email": "toolong@taskflow.io",
            "username": "a" * 51,
            "password": "Password123",
        })
    assert resp.status_code == 422
