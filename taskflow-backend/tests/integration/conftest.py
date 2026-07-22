import pytest
from app.main import app
from app.api.dependencies import get_db_session, get_redis


@pytest.fixture(autouse=True)
def _override_get_db(db_session):
    """Route all app DB calls through the test session so seeded data is visible."""
    async def _get_db():
        yield db_session

    app.dependency_overrides[get_db_session] = _get_db
    yield
    app.dependency_overrides.pop(get_db_session, None)


class FakeRedis:
    """Dict-backed stand-in covering blacklist + auth_invalid_before usage."""

    def __init__(self):
        self.store = {}

    async def set(self, key, value, ex=None):
        self.store[key] = str(value)

    async def get(self, key):
        return self.store.get(key)

    async def exists(self, key):
        return 1 if key in self.store else 0


@pytest.fixture(autouse=True)
def _hermetic_redis():
    """Every authenticated request hits the token blacklist through get_redis.
    Without this override the suite silently depends on a LIVE local Redis
    (the dev docker-compose stack!) — 36 tests failed with ConnectionRefused
    whenever that stack was down. Tests needing specific redis behavior
    override get_redis themselves, which shadows this default."""
    fake = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_redis, None)
