from datetime import datetime, timezone

import redis.asyncio as aioredis

_PREFIX = "blacklist:"
# Tokens issued before this per-user timestamp are rejected on refresh.
# Set by password reset (REQ-154) and account deactivation (REQ-155).
_INVALID_BEFORE_PREFIX = "auth_invalid_before:"


async def blacklist_token(redis: aioredis.Redis, jti: str, ttl_seconds: int) -> None:
    await redis.set(f"{_PREFIX}{jti}", "1", ex=ttl_seconds)


async def is_blacklisted(redis: aioredis.Redis, jti: str) -> bool:
    return await redis.exists(f"{_PREFIX}{jti}") == 1


async def revoke_sessions_issued_before_now(redis: aioredis.Redis, user_id: str, ttl_seconds: int) -> None:
    await redis.set(
        f"{_INVALID_BEFORE_PREFIX}{user_id}",
        str(datetime.now(timezone.utc).timestamp()),
        ex=ttl_seconds,
    )


async def sessions_invalid_before(redis: aioredis.Redis, user_id: str) -> float | None:
    """Tolerant parsing — a mocked/absent redis value must never break refresh."""
    try:
        raw = await redis.get(f"{_INVALID_BEFORE_PREFIX}{user_id}")
        return float(raw) if raw else None
    except (TypeError, ValueError):
        return None
