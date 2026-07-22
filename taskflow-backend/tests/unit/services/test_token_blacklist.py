import pytest
from unittest.mock import AsyncMock

from app.services.token_blacklist import blacklist_token, is_blacklisted


@pytest.fixture
def mock_redis():
    r = AsyncMock()
    r.set = AsyncMock()
    r.exists = AsyncMock(return_value=0)
    return r


@pytest.mark.asyncio
async def test_blacklist_token_sets_key_with_ttl(mock_redis):
    await blacklist_token(mock_redis, "test-jti", 300)
    mock_redis.set.assert_called_once_with("blacklist:test-jti", "1", ex=300)


@pytest.mark.asyncio
async def test_is_blacklisted_returns_false_when_not_in_redis(mock_redis):
    mock_redis.exists = AsyncMock(return_value=0)
    result = await is_blacklisted(mock_redis, "unknown-jti")
    assert result is False


@pytest.mark.asyncio
async def test_is_blacklisted_returns_true_when_in_redis(mock_redis):
    mock_redis.exists = AsyncMock(return_value=1)
    result = await is_blacklisted(mock_redis, "revoked-jti")
    assert result is True


@pytest.mark.asyncio
async def test_blacklist_uses_correct_prefix(mock_redis):
    await blacklist_token(mock_redis, "abc-123", 60)
    call_args = mock_redis.set.call_args
    assert call_args[0][0] == "blacklist:abc-123"


@pytest.mark.asyncio
async def test_is_blacklisted_checks_correct_prefix(mock_redis):
    await is_blacklisted(mock_redis, "abc-123")
    mock_redis.exists.assert_called_once_with("blacklist:abc-123")
