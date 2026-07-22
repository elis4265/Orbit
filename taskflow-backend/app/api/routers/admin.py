"""REQ-155 — instance admin endpoints. Superuser-only (get_superuser, DD-048)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_db_session, get_password_reset_repository, get_redis, get_superuser
from app.core.config import settings
from app.core.logging import get_logger
from app.models.password_reset import PasswordReset
from app.models.user import User
from app.repositories.password_reset import PasswordResetRepository
from app.schemas.admin import AdminUserListResponse, AdminUserResponse, AdminUserUpdate
from app.services.email import send_password_reset_email
from app.services.instance_admin import list_users, set_user_active
from app.services.token_blacklist import revoke_sessions_issued_before_now

router = APIRouter(prefix="/admin", tags=["Instance Admin"])
logger = get_logger("instance_admin")


@router.get("/users", response_model=AdminUserListResponse)
async def admin_list_users(
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _admin: User = Depends(get_superuser),
    session: AsyncSession = Depends(get_db_session),
):
    users, total = await list_users(session, q, limit, offset)
    return AdminUserListResponse(
        users=[AdminUserResponse.model_validate(u) for u in users], total=total
    )


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def admin_set_user_active(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    admin: User = Depends(get_superuser),
    session: AsyncSession = Depends(get_db_session),
    redis: aioredis.Redis = Depends(get_redis),
):
    if user_id == admin.id and not payload.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot deactivate your own account.")

    user = await set_user_active(session, user_id, payload.is_active)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")
    await session.commit()

    if not payload.is_active:
        # Kill outstanding refresh tokens; access tokens die on next request via is_active.
        try:
            await revoke_sessions_issued_before_now(
                redis, str(user_id), settings.refresh_token_expire_days * 86400
            )
        except Exception as exc:
            logger.error("deactivation_session_revoke_failed", user_id=str(user_id), error=str(exc))

    logger.info("admin_user_active_set", actor=str(admin.id), user_id=str(user_id), is_active=payload.is_active)
    return user


@router.post("/users/{user_id}/reset-password")
async def admin_trigger_password_reset(
    user_id: uuid.UUID,
    admin: User = Depends(get_superuser),
    session: AsyncSession = Depends(get_db_session),
    pr_repo: PasswordResetRepository = Depends(get_password_reset_repository),
):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found.")

    await pr_repo.invalidate_all_for_user(user.id)
    code = PasswordReset.generate_code()
    await pr_repo.create({
        "user_id": user.id,
        "code": code,
        "expires_at": PasswordReset.make_expiry(),
    })
    await send_password_reset_email(user.email, code)
    logger.info("admin_password_reset_triggered", actor=str(admin.id), user_id=str(user_id))
    return {"message": f"Reset code sent to {user.email}."}
