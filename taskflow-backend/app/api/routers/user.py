import uuid
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, status
from fastapi.responses import StreamingResponse
import io

import redis.asyncio as aioredis
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.limiter import limiter
from app.core.security import hash_password, verify_password
from app.database import get_db_session
from app.models.api_token import ApiToken
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, RegisterResponse
from app.schemas.user import UserResponse, UserProfileUpdate
from app.schemas.task import TaskResponse
from app.repositories.user import UserRepository
from app.repositories.task import TaskRepository
from app.api.dependencies import get_current_user, get_redis, get_user_repository, get_task_repository
from app.core.storage import upload_file, download_file, delete_file
from app.core.logging import get_logger
from app.services.email import send_password_changed_email
from app.services.token_blacklist import revoke_sessions_issued_before_now

router = APIRouter(prefix="/users", tags=["Users"])
logger = get_logger("users")


@router.post("/me/change-password", response_model=RegisterResponse)
@limiter.limit("5/hour")
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
    redis: aioredis.Redis = Depends(get_redis),
    session: AsyncSession = Depends(get_db_session),
):
    """Logged-in password change, gated by the current password (a hijacked
    session cannot rotate the owner out). All other sessions are revoked via
    the auth_invalid_before gate (REQ-154). API tokens survive unless the
    caller opts into purging them."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        # Same wording for wrong password as login — no oracle beyond the rate limit.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect.")

    await user_repo.update(current_user, {
        "hashed_password": hash_password(payload.new_password),
        "password_set_by_user": True,
    })

    tokens_revoked = False
    if payload.revoke_api_tokens:
        await session.execute(sa_delete(ApiToken).where(ApiToken.user_id == current_user.id))
        await session.commit()
        tokens_revoked = True

    try:
        await revoke_sessions_issued_before_now(
            redis, str(current_user.id), settings.refresh_token_expire_days * 86400
        )
    except Exception as exc:
        # Redis down must not block the change itself; sessions then age out normally.
        logger.error("change_password_session_revoke_failed", user_id=str(current_user.id), error=str(exc))

    try:
        await send_password_changed_email(current_user.email, tokens_revoked)
    except Exception as exc:
        logger.error("change_password_email_failed", user_id=str(current_user.id), error=str(exc))

    logger.info("password_changed", user_id=str(current_user.id), tokens_revoked=tokens_revoked)
    return RegisterResponse(message="Password changed. Sign in again with your new password.")


@router.get("/me/tasks", response_model=List[TaskResponse])
async def my_tasks(
    facet: Literal["assigned", "created", "watching"] = Query(default="assigned"),
    current_user: User = Depends(get_current_user),
    task_repo: TaskRepository = Depends(get_task_repository),
):
    """REQ-142 My Work: the caller's tasks across all accessible projects."""
    return await task_repo.get_user_tasks(current_user.id, facet)

_AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_AVATAR_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@router.patch("/me", response_model=UserResponse)
async def update_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
):
    updates: dict = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        return current_user

    if "username" in updates and updates["username"] != current_user.username:
        existing = await user_repo.get_by_username(updates["username"])
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken.")

    updated = await user_repo.update(current_user, updates)
    return updated


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
):
    if file.content_type not in _AVATAR_ALLOWED_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unsupported image type.")

    data = await file.read()
    if len(data) > _AVATAR_MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Avatar must be under 5 MB.")

    # Delete old avatar if one exists
    if current_user.avatar_key:
        await delete_file(current_user.avatar_key)

    ext = (file.content_type or "image/jpeg").split("/")[-1]
    key = f"avatars/{current_user.id}/{uuid.uuid4()}.{ext}"
    await upload_file(key, data, file.content_type or "image/jpeg")

    updated = await user_repo.update(current_user, {"avatar_key": key})
    logger.info("avatar_uploaded", user_id=str(current_user.id), key=key)
    return updated


@router.delete("/me/avatar", response_model=UserResponse)
async def delete_avatar(
    current_user: User = Depends(get_current_user),
    user_repo: UserRepository = Depends(get_user_repository),
):
    if current_user.avatar_key:
        await delete_file(current_user.avatar_key)
    updated = await user_repo.update(current_user, {"avatar_key": None})
    return updated


@router.get("/{user_id}/avatar")
async def get_avatar(
    user_id: uuid.UUID,
    user_repo: UserRepository = Depends(get_user_repository),
):
    user = await user_repo.get(user_id)
    if not user or not user.avatar_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No avatar set.")

    data = await download_file(user.avatar_key)
    ext = user.avatar_key.rsplit(".", 1)[-1] if "." in user.avatar_key else "jpeg"
    content_type = f"image/{ext}"
    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
