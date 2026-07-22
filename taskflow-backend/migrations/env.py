import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import settings so DATABASE_URL comes from .env, never hardcoded
from app.core.config import settings

# Import Base and all models so Alembic's autogenerate can see the full schema.
# If any model is missing here, Alembic silently skips it — no error, just a
# migration that doesn't create that table.
from app.database import Base
from app.models import User, Project, Task  # noqa: F401

# Alembic Config object — gives access to values in alembic.ini
config = context.config

# Wire up Python logging from alembic.ini configuration
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# This is what autogenerate compares against to detect schema changes.
# Without target_metadata, alembic revision --autogenerate produces an empty file.
target_metadata = Base.metadata

# Override the blank sqlalchemy.url from alembic.ini with our settings value
config.set_main_option("sqlalchemy.url", settings.database_url)


def run_migrations_offline() -> None:
    """
    Run migrations without a live DB connection — outputs raw SQL to stdout.
    Useful for reviewing what Alembic will do before touching the database.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Async engine is required because our database layer uses asyncpg.
    Alembic itself is synchronous internally — we bridge that here by
    running the sync migration logic inside an async engine's connect().
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,  # NullPool = no connection reuse during migrations
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for live migration runs — wraps the async runner."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()