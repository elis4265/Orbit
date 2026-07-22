"""Per-provider inbound webhook signature verification. Pure / DB-free.

All comparisons are constant-time (hmac.compare_digest). A missing secret or
header always fails closed.
"""
import hashlib
import hmac


def _hmac_sha256_hex(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_github(secret: str, body: bytes, header: str | None) -> bool:
    """GitHub: X-Hub-Signature-256 = 'sha256=<hex>' HMAC-SHA256 over the raw body."""
    if not secret or not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + _hmac_sha256_hex(secret, body)
    return hmac.compare_digest(expected, header)


def verify_gitlab(secret: str, header_token: str | None) -> bool:
    """GitLab: X-Gitlab-Token is a shared secret compared verbatim."""
    if not secret or not header_token:
        return False
    return hmac.compare_digest(secret, header_token)


def verify_bitbucket(secret: str, body: bytes, header: str | None) -> bool:
    """Bitbucket has no native signature header → we HMAC-SHA256 the body with the
    connection secret (raw hex in X-Hub-Signature, documented limitation)."""
    if not secret or not header:
        return False
    expected = _hmac_sha256_hex(secret, body)
    candidate = header[len("sha256="):] if header.startswith("sha256=") else header
    return hmac.compare_digest(expected, candidate)
