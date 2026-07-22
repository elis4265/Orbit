from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# 1. Spin up the asynchronous SQLAlchemy engine using the modern asyncpg dialect
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,       # only logs SQL in development
    future=True
)

# 2. Instantiate a thread-safe factory optimized for handling async HTTP request lifecycles
async_session_local = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,  # Prevents SQLAlchemy from making redundant database queries after a commit
    class_=AsyncSession
)

# 3. Unified structural base for all declarative ORM database models
class Base(DeclarativeBase):
    pass

# 4. FastAPI Dependency Injection to handle clean, isolated database sessions per incoming request
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_local() as session:
        try:
            yield session
            await session.commit()  # Automatically save changes if the endpoint code executes successfully
        except Exception:
            await session.rollback() # Instantly roll back any partial database data writes if an error spikes
            raise
        finally:
            await session.close()    # Always release the database connection back to the engine pool