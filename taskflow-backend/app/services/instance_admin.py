"""REQ-155 — instance admin: superuser promotion + user administration queries."""
import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.user import User

logger = get_logger("instance_admin")


async def promote_superuser(session: AsyncSession, email: str) -> None:
    """Idempotently grant is_superuser to the user with `email`. Unknown email is a no-op
    (the operator may set ORBIT_SUPERUSER_EMAIL before registering the account)."""
    result = await session.execute(select(User).where(User.email == email.lower()))
    user = result.scalars().first()
    if user is None:
        logger.warning("superuser_email_not_found", email=email)
        return
    if not user.is_superuser:
        user.is_superuser = True
        await session.flush()
        logger.info("superuser_promoted", user_id=str(user.id), email=email)


async def list_users(
    session: AsyncSession, q: str | None = None, limit: int = 50, offset: int = 0
) -> tuple[list[User], int]:
    filters = []
    if q:
        pattern = f"%{q}%"
        filters.append(or_(User.email.ilike(pattern), User.username.ilike(pattern)))

    total = (await session.execute(
        select(func.count()).select_from(User).where(*filters)
    )).scalar_one()
    users = (await session.execute(
        select(User).where(*filters).order_by(User.created_at).limit(limit).offset(offset)
    )).scalars().all()
    return list(users), total


async def set_user_active(session: AsyncSession, user_id: uuid.UUID, is_active: bool) -> User | None:
    user = await session.get(User, user_id)
    if user is None:
        return None
    user.is_active = is_active
    await session.flush()
    logger.info("user_active_changed", user_id=str(user_id), is_active=is_active)
    return user
