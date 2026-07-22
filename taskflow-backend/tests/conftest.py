import os
import socket
import time

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import NullPool
from app.database import Base, engine as app_engine
from app.core.config import settings


def _wait_for_postgres(host: str, port: int, timeout: int = 30) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=1):
                time.sleep(1.5)  # Extra wait for PG to finish initializing
                return
        except OSError:
            time.sleep(0.5)
    raise TimeoutError(f"PostgreSQL at {host}:{port} not ready in {timeout}s")


@pytest.fixture(scope="session")
def database_url() -> str:
    if os.getenv("USE_TESTCONTAINERS") == "0":
        yield settings.database_url
        return

    from testcontainers.postgres import PostgresContainer
    from testcontainers.core.waiting_utils import wait_for_logs

    container = PostgresContainer("postgres:16-alpine")
    container.start()
    wait_for_logs(container, "database system is ready to accept connections", timeout=30)

    host = container.get_container_host_ip()
    port = container.get_exposed_port(5432)
    url = f"postgresql+asyncpg://{container.username}:{container.password}@{host}:{port}/{container.dbname}"

    yield url
    container.stop()


@pytest.fixture(autouse=True, scope="session")
def _no_real_email():
    """Tests must never reach a live email provider — .env may point at a real
    SMTP relay (it did: smtp.gmail.com). Force MailHog unconditionally; Brevo off."""
    settings.brevo_api_key = ""
    settings.smtp_host = os.getenv("TEST_SMTP_HOST", "localhost")
    settings.smtp_port = int(os.getenv("TEST_SMTP_PORT", "1025"))
    settings.smtp_user = ""
    settings.smtp_password = ""
    yield


@pytest.fixture(autouse=True)
def _isolate_rate_limits():
    """Reset in-memory rate limit counters before each test so limits don't accumulate across tests."""
    from app.core.limiter import limiter
    limiter._limiter.storage.reset()
    yield


@pytest_asyncio.fixture(scope="function")
async def db_session(database_url: str):
    engine = create_async_engine(database_url, poolclass=NullPool, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSession(engine, expire_on_commit=False) as session:
        yield session
        await session.rollback()

    # Release the app engine's pooled connections BEFORE drop_all — otherwise their
    # idle/open transactions can block DROP, the teardown silently fails, and rows
    # leak across tests (breaking per-test isolation on a persistent DB).
    await app_engine.dispose()

    from sqlalchemy import text
    async with engine.begin() as conn:
        try:
            await conn.run_sync(Base.metadata.drop_all)
        except Exception:
            # metadata.drop_all can't topo-sort the circular FK between
            # priority_schemes <-> projects. On an ephemeral testcontainer OR a
            # dedicated *_test database, nuke the schema instead. Never touches dev.
            if os.getenv("USE_TESTCONTAINERS") != "0" or database_url.rstrip("/").endswith("_test"):
                await conn.execute(text("DROP SCHEMA public CASCADE"))
                await conn.execute(text("CREATE SCHEMA public"))

    await engine.dispose()
    await app_engine.dispose()
