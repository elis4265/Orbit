"""
Email confirmation / verification integration tests.

Requirements
------------
REQ-030  Verification page — 6 digit inputs, countdown, resend button.
REQ-031  POST /verify-email validates code and issues tokens.
         POST /resend-verification invalidates old codes and sends a new one.
         POST /login rejects unverified users with 401 (unverified non-invite
         accounts have no password set until verification, so login fails the
         password check with 401).

TDS coverage
------------
TC_15  Correct code → 200 with access_token; user.is_verified = True
TC_16  Wrong code → 400
TC_17  Expired code → 400
TC_18  Code from different account → 400
TC_19  Old code rejected after resend
TC_20  Non-digit / fewer-than-6 digits → no submit  (frontend only; backend rejects via Field min_length=6)
TC_21  Brute-force: 10 wrong attempts within 5/hour limit → 429 on 6th+

Design Decision — verify-email rate limit (5/hour)
---------------------------------------------------
A 6-digit numeric code has 10^6 permutations. At 5 guesses/hour, an exhaustive
brute force would take ~200,000 hours. Combined with the 15-minute code expiry,
the effective window is ≈1.25 codes (15 min / 12 min per guess at 5/hour),
making brute force economically infeasible without also breaking rate limiting.
"""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.models.user import User
from app.models.email_verification import EmailVerification


async def _get_code(db_session, email: str) -> str:
    """Return the latest unused verification code for a user, read directly from DB."""
    user = (await db_session.execute(select(User).where(User.email == email))).scalars().first()
    ev = (
        await db_session.execute(
            select(EmailVerification)
            .where(EmailVerification.user_id == user.id, EmailVerification.used == False)  # noqa: E712
            .order_by(EmailVerification.created_at.desc())
        )
    ).scalars().first()
    return ev.code


# ── REQ-031: POST /verify-email ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_email_success(db_session):
    """[TC_15] Correct code verifies user and issues tokens."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "verify@taskflow.io", "username": "verifyuser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        code = await _get_code(db_session, "verify@taskflow.io")
        resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": "verify@taskflow.io", "code": code, "new_password": "Password123"
        })
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    user = (await db_session.execute(select(User).where(User.email == "verify@taskflow.io"))).scalars().first()
    assert user.is_verified is True


@pytest.mark.asyncio
async def test_verify_email_wrong_code_returns_400(db_session):
    """[TC_16] Wrong code returns 400."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "wrong@taskflow.io", "username": "wronguser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": "wrong@taskflow.io", "code": "000000", "new_password": "Password123"
        })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_email_expired_code_returns_400(db_session):
    """[TC_17] Expired code returns 400."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "expired@taskflow.io", "username": "expireduser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })

    user = (await db_session.execute(select(User).where(User.email == "expired@taskflow.io"))).scalars().first()
    ev = (await db_session.execute(
        select(EmailVerification).where(EmailVerification.user_id == user.id)
    )).scalars().first()
    ev.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": "expired@taskflow.io", "code": ev.code, "new_password": "Password123"
        })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_email_cross_account_code_returns_400(db_session):
    """[TC_18] Code from account A cannot verify account B."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "cross_a@taskflow.io", "username": "crossusera", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        await ac.post("/api/v1/auth/register", json={
            "email": "cross_b@taskflow.io", "username": "crossuserb", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        code_a = await _get_code(db_session, "cross_a@taskflow.io")
        resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": "cross_b@taskflow.io", "code": code_a, "new_password": "Password123"
        })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_email_old_code_invalid_after_resend(db_session):
    """[TC_19] Old code is rejected after resend — resend invalidates all prior codes."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "resendold@taskflow.io", "username": "resendolduser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        old_code = await _get_code(db_session, "resendold@taskflow.io")
        await ac.post("/api/v1/auth/resend-verification", json={"email": "resendold@taskflow.io"})
        resp = await ac.post("/api/v1/auth/verify-email", json={
            "email": "resendold@taskflow.io", "code": old_code, "new_password": "Password123"
        })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_email_brute_force_rate_limited(db_session):
    """[TC_21] Repeated wrong codes hit the 5/hour rate limit → 429 on 6th attempt and beyond."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "brute@taskflow.io", "username": "bruteuser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        last_resp = None
        for _ in range(10):
            last_resp = await ac.post("/api/v1/auth/verify-email", json={
                "email": "brute@taskflow.io", "code": "000000", "new_password": "Password123"
            })
    assert last_resp.status_code == 429


# ── REQ-031: POST /resend-verification ───────────────────────────────────────

@pytest.mark.asyncio
async def test_resend_verification_sends_new_code(db_session):
    """[REQ-031] Resend replaces old code with a new one."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "resend@taskflow.io", "username": "resenduser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        old_code = await _get_code(db_session, "resend@taskflow.io")
        resp = await ac.post("/api/v1/auth/resend-verification", json={"email": "resend@taskflow.io"})
        assert resp.status_code == 200

        new_code = await _get_code(db_session, "resend@taskflow.io")
        assert new_code != old_code


@pytest.mark.asyncio
async def test_resend_verification_already_verified_returns_400(db_session):
    """[REQ-031] Resend for already-verified account returns 400."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "verified2@taskflow.io", "username": "verified2", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        code = await _get_code(db_session, "verified2@taskflow.io")
        await ac.post("/api/v1/auth/verify-email", json={"email": "verified2@taskflow.io", "code": code, "new_password": "Password123"})
        resp = await ac.post("/api/v1/auth/resend-verification", json={"email": "verified2@taskflow.io"})
    assert resp.status_code == 400


# ── Login guard ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_login_unverified_user_returns_401(db_session):
    """[REQ-029] Login before email verification returns 401.

    Unverified non-invite accounts have no password set until verification
    (registration stores an unguessable placeholder hash), so the login attempt
    fails the password check first and returns 401 rather than the old 403.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.post("/api/v1/auth/register", json={
            "email": "unverified@taskflow.io", "username": "unverifieduser", "password": "Password123",
            "first_name": "Test", "last_name": "User",
        })
        resp = await ac.post("/api/v1/auth/login", data={
            "username": "unverified@taskflow.io", "password": "Password123"
        })
    assert resp.status_code == 401
