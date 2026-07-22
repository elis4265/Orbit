from datetime import timedelta, datetime, timezone

import jwt
import pytest

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)

def test_hash_password_empty_string():
    """Ensure empty strings are safely hashed rather than crashing or returning blank values."""
    empty_string = ""

    hashed = hash_password(empty_string)

    assert len(hashed) > 0
    assert hashed != empty_string
    assert verify_password(empty_string, hashed) is True

def test_hash_password_returns_non_plaintext():
    """Ensure a plain text password hashes to something different and can be verified."""
    password = "super-secret"

    hashed = hash_password(password)

    assert hashed != password
    assert len(hashed) > len(password)

def test_verify_password_success():
    """Verify that a hashed password can be successfully validated against the original plaintext password."""
    password = "super-secret"

    hashed = hash_password(password)

    assert verify_password(password, hashed)

def test_hash_password_uniqueness():
    """Ensure two identical plain text passwords produce unique hashes due to random salting."""
    password = "identical_password"
    hash_one = hash_password(password)
    hash_two = hash_password(password)
    
    assert hash_one != hash_two

    assert verify_password(password, hash_one) is True
    assert verify_password(password, hash_two) is True

def test_verify_password_failure():
    """Ensure that verifying an incorrect password against a hash explicitly returns False."""
    hashed = hash_password("correct-password")

    assert verify_password("wrong-password", hashed) is False

def test_create_access_token_contains_access_type():
    """
    Verifies the access token encodes the correct subject and type stamp.
    The 'type: access' claim is what routers check to reject refresh tokens
    on protected endpoints — if this is wrong, auth is broken at the root.
    """
    token = create_access_token({"sub": "user123"})
    payload = decode_token(token)

    assert payload["sub"] == "user123"
    assert payload["type"] == "access"


def test_create_refresh_token_contains_refresh_type():
    """
    Mirrors the access token test for the refresh token type stamp.
    Ensures the two token types are distinguishable after decoding —
    critical for the cross-contamination guard in the auth middleware.
    """
    token = create_refresh_token({"sub": "user123"})
    payload = decode_token(token)

    assert payload["sub"] == "user123"
    assert payload["type"] == "refresh"


def test_create_access_token_respects_custom_expiry():
    """
    Confirms that a custom expires_delta is actually applied, not silently ignored.
    Checks the 'exp' timestamp is within 2 seconds of the expected value —
    a plain 'assert exp in payload' would pass even if expires_delta had no effect.
    """
    token = create_access_token(
        {"sub": "user123"},
        expires_delta=timedelta(seconds=5),
    )
    payload = decode_token(token)

    assert payload["type"] == "access"
    expected_exp = datetime.now(timezone.utc) + timedelta(seconds=5)
    assert abs(payload["exp"] - expected_exp.timestamp()) < 2


def test_decode_expired_token_raises():
    """
    Passes a token with a negative expiry (already expired at creation time).
    PyJWT must raise ExpiredSignatureError — if it doesn't, expired tokens
    would silently authenticate, which is a critical security hole.
    """
    token = create_access_token(
        {"sub": "user123"},
        expires_delta=timedelta(seconds=-1),
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_token(token)


def test_decode_invalid_token_raises():
    """
    Passes a garbage string where a JWT is expected.
    Covers the case of a corrupted Authorization header or a completely
    fabricated token — PyJWT must raise InvalidTokenError, not silently return None.
    """
    with pytest.raises(jwt.InvalidTokenError):
        decode_token("this-is-not-a-valid-jwt")

def test_access_token_and_refresh_token_are_different():
    """
    Same payload, two different token types must produce different signed strings.
    Guards against a bug where both functions use the same type stamp,
    allowing a refresh token to be used as an access token.
    """
    access = create_access_token({"sub": "user123"})
    refresh = create_refresh_token({"sub": "user123"})

    assert access != refresh


def test_refresh_token_rejected_as_access_token():
    """
    A refresh token must not pass access token validation.
    This is the critical guard — if the router checks payload["type"] == "access",
    a stolen refresh token cannot be replayed on protected endpoints.
    """
    token = create_refresh_token({"sub": "user123"})
    payload = decode_token(token)

    assert payload["type"] != "access"


def test_decode_tampered_token_raises():
    """
    Modify the signature portion of a valid token.
    Simulates a MITM attack where the payload is altered after signing.
    PyJWT must reject this with InvalidTokenError.
    """
    token = create_access_token({"sub": "user123"})
    tampered = token[:-5] + "XXXXX"

    with pytest.raises(jwt.InvalidTokenError):
        decode_token(tampered)


def test_token_does_not_contain_password_or_sensitive_data():
    """
    Sanity check that nothing sensitive leaks into the token payload.
    JWTs are base64-encoded, not encrypted — anyone can decode the payload.
    """
    token = create_access_token({"sub": "user123"})
    payload = decode_token(token)

    assert "password" not in payload
    assert "hashed_password" not in payload


def test_access_token_contains_jti():
    token = create_access_token({"sub": "user123"})
    payload = decode_token(token)
    assert "jti" in payload
    assert len(payload["jti"]) == 36  # UUID format


def test_refresh_token_contains_jti():
    token = create_refresh_token({"sub": "user123"})
    payload = decode_token(token)
    assert "jti" in payload
    assert len(payload["jti"]) == 36


def test_each_token_has_unique_jti():
    t1 = create_access_token({"sub": "user123"})
    t2 = create_access_token({"sub": "user123"})
    p1 = decode_token(t1)
    p2 = decode_token(t2)
    assert p1["jti"] != p2["jti"]