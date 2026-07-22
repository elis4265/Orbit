"""Personal API tokens (REQ-143). Show-once secrets, SHA-256 at rest (DD-046)."""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db_session
from app.core.errors import AppError
from app.core.security import generate_api_token, hash_api_token
from app.models.api_token import ApiToken
from app.models.user import User
from app.schemas.api_token import ApiTokenCreate, ApiTokenCreated, ApiTokenResponse

router = APIRouter(prefix="/users/me/tokens", tags=["API Tokens"])

_MAX_TOKENS_PER_USER = 20


@router.post("", response_model=ApiTokenCreated, status_code=status.HTTP_201_CREATED)
async def create_token(
    payload: ApiTokenCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    count = len((await session.execute(
        select(ApiToken.id).where(ApiToken.user_id == current_user.id)
    )).all())
    if count >= _MAX_TOKENS_PER_USER:
        raise AppError(400, "TOKEN_LIMIT", f"Maximum {_MAX_TOKENS_PER_USER} API tokens per user.")

    token = generate_api_token()
    row = ApiToken(
        user_id=current_user.id,
        name=payload.name,
        token_hash=hash_api_token(token),
        prefix=token[:14] + "…",
        scope=payload.scope,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return ApiTokenCreated(token=token, **ApiTokenResponse.model_validate(row).model_dump())


@router.get("", response_model=list[ApiTokenResponse])
async def list_tokens(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(ApiToken).where(ApiToken.user_id == current_user.id).order_by(ApiToken.created_at)
    )
    return result.scalars().all()


@router.delete("/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_token(
    token_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(ApiToken).where(ApiToken.id == token_id, ApiToken.user_id == current_user.id)
    )
    row = result.scalars().first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Token not found.")
    await session.delete(row)
    await session.commit()
