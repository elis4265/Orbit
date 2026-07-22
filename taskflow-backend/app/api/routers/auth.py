import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
import jwt
import redis.asyncio as aioredis

from app.schemas.auth import (
    UserRegister,
    VerifyEmailRequest,
    ResendVerificationRequest,
    RegisterResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.schemas.token import TokenResponse
from app.schemas.user import UserResponse
from app.services.auth import AuthService, UnverifiedUserError
from app.services.token_blacklist import (
    blacklist_token,
    is_blacklisted,
    revoke_sessions_issued_before_now,
    sessions_invalid_before,
)
from app.services.email import send_verification_email, send_password_reset_email, send_password_changed_email
from app.api.dependencies import (
    get_auth_service,
    get_current_user,
    get_redis,
    get_user_repository,
    get_email_verification_repository,
    get_password_reset_repository,
    get_project_member_service,
)
from app.repositories.user import UserRepository
from app.repositories.email_verification import EmailVerificationRepository
from app.repositories.password_reset import PasswordResetRepository
from app.models.user import User
from app.models.email_verification import EmailVerification
from app.models.password_reset import PasswordReset
from app.core.security import create_access_token, create_refresh_token, decode_token
from app.core.config import settings
from app.core.limiter import limiter
from app.core.logging import get_logger
from app.services.project_member import ProjectMemberService

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = get_logger("auth")

_REFRESH_COOKIE = "refresh_token"
_COOKIE_MAX_AGE = settings.refresh_token_expire_days * 86400


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=token,
        httponly=True,
        secure=settings.environment != "development",
        samesite="strict",
        max_age=_COOKIE_MAX_AGE,
        path="/api/v1/auth",
    )


async def _blacklist_jwt(token: str, redis: aioredis.Redis) -> None:
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        if jti:
            exp = payload.get("exp", 0)
            ttl = max(int(exp - datetime.now(timezone.utc).timestamp()), 1)
            await blacklist_token(redis, jti, ttl)
    except Exception:
        pass


def _issue_tokens(response: Response, user_id: str) -> TokenResponse:
    payload = {"sub": user_id}
    access_token = create_access_token(payload)
    refresh_token = create_refresh_token(payload)
    _set_refresh_cookie(response, refresh_token)
    return TokenResponse(access_token=access_token, token_type="bearer")


# ── Google SSO (REQ-150) ──────────────────────────────────────────────────────

@router.get("/providers")
async def auth_providers() -> dict:
    """Which SSO providers are configured — the login page renders real buttons only for these."""
    return {"google_client_id": settings.google_oauth_client_id}


@router.post("/google", response_model=TokenResponse)
async def google_login(
    body: dict,
    response: Response,
    user_repo: UserRepository = Depends(get_user_repository),
):
    """Exchange a Google Identity Services ID token for Orbit tokens.
    Verified via Google's tokeninfo endpoint; audience must match our client id."""
    import secrets as _secrets

    import httpx

    from app.core.security import hash_password

    if not settings.google_oauth_client_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Google SSO is not configured.")
    credential = body.get("credential")
    if not credential:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Missing credential.")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo", params={"id_token": credential}, timeout=10.0
        )
    if resp.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential.")
    info = resp.json()
    if info.get("aud") != settings.google_oauth_client_id:
        logger.warning("google_login_rejected", reason="aud_mismatch")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential.")
    if info.get("email_verified") not in ("true", True):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account email is not verified.")

    email = info["email"].lower()
    user = await user_repo.get_by_email(email)
    if user is not None and not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential.")
    if user is None:
        base = email.split("@")[0][:24] or "user"
        username = base
        if await user_repo.get_by_username(username):
            username = f"{base}_{_secrets.token_hex(2)}"
        user = await user_repo.create({
            "email": email,
            "hashed_password": hash_password(_secrets.token_urlsafe(32)),
            "username": username,
            "first_name": info.get("given_name"),
            "last_name": info.get("family_name"),
            "is_verified": True,  # Google already verified the address
            "password_set_by_user": False,  # random unseen password — drives "Set a password" UX
        })
        logger.info("google_signup", email=email)
    return _issue_tokens(response, str(user.id))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/hour")
async def register_user(
    request: Request,
    response: Response,
    payload: UserRegister,
    auth_service: AuthService = Depends(get_auth_service),
    user_repo: UserRepository = Depends(get_user_repository),
    ev_repo: EmailVerificationRepository = Depends(get_email_verification_repository),
    member_svc: ProjectMemberService = Depends(get_project_member_service),
):
    # Validate invite token before creating the user
    if payload.invite_token is not None:
        invite_meta = await member_svc.get_metadata(payload.invite_token)
        if invite_meta["expired"] or invite_meta["used"]:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite is expired or already used.")

    existing = await user_repo.get_by_email(payload.email)
    if existing:
        if existing.is_verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists.")
        username_owner = await user_repo.get_by_username(payload.username)
        if username_owner and username_owner.id != existing.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken.")
        await user_repo.delete(existing)
    else:
        if await user_repo.get_by_username(payload.username):
            raise HTTPException(status.HTTP_409_CONFLICT, "Username is already taken.")

    is_invite = payload.invite_token is not None
    if is_invite:
        # Invite proves inbox ownership already, so the password is set now and
        # the account is usable immediately.
        hashed = auth_service.hash_password(payload.password)
    else:
        # Standard flow: no usable credential exists until /verify-email. Store
        # an unguessable placeholder so a pre-verification row can never carry
        # an attacker-chosen password (account pre-hijacking).
        hashed = auth_service.hash_password(secrets.token_urlsafe(32))
    user = await user_repo.create({
        "email": payload.email,
        "username": payload.username,
        "first_name": payload.first_name,
        "last_name": payload.last_name,
        "hashed_password": hashed,
        "is_verified": is_invite,
        "password_set_by_user": is_invite,
    })

    if payload.invite_token is not None:
        project_id = await member_svc.accept(payload.invite_token, user)
        logger.info("register_invite_success", email=payload.email, project_id=str(project_id))
        tokens = _issue_tokens(response, str(user.id))
        return RegisterResponse(project_id=str(project_id), access_token=tokens.access_token)

    code = EmailVerification.generate_code()
    await ev_repo.create({
        "user_id": user.id,
        "code": code,
        "expires_at": EmailVerification.make_expiry(),
    })
    await send_verification_email(payload.email, code)
    logger.info("register_success", email=payload.email, username=payload.username)
    return RegisterResponse(message="Verification code sent. Check your email.")


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("5/hour")
async def verify_email(
    request: Request,
    payload: VerifyEmailRequest,
    response: Response,
    user_repo: UserRepository = Depends(get_user_repository),
    ev_repo: EmailVerificationRepository = Depends(get_email_verification_repository),
):
    user = await user_repo.get_by_email(payload.email)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid email or code.")

    ev = await ev_repo.get_valid_code(user.id, payload.code)
    if not ev:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification code.")

    from app.core.security import hash_password

    await ev_repo.update(ev, {"used": True})
    # Set the account password now — inbox ownership is proven — overwriting the
    # placeholder from /register. Any password present before this point could
    # only have been set by someone who had not proven ownership of the inbox.
    await user_repo.update(user, {
        "hashed_password": hash_password(payload.new_password),
        "is_verified": True,
        "password_set_by_user": True,
    })

    logger.info("email_verified", user_id=str(user.id))
    return _issue_tokens(response, str(user.id))


@router.post("/resend-verification", response_model=RegisterResponse)
@limiter.limit("5/hour")
async def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    user_repo: UserRepository = Depends(get_user_repository),
    ev_repo: EmailVerificationRepository = Depends(get_email_verification_repository),
):
    user = await user_repo.get_by_email(payload.email)
    if not user:
        # Don't reveal whether the email exists
        return RegisterResponse(message="If that email is registered, a new code has been sent.")
    if user.is_verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Account is already verified.")

    await ev_repo.invalidate_all_for_user(user.id)
    code = EmailVerification.generate_code()
    await ev_repo.create({
        "user_id": user.id,
        "code": code,
        "expires_at": EmailVerification.make_expiry(),
    })

    await send_verification_email(payload.email, code)
    logger.info("verification_resent", email=payload.email)
    return RegisterResponse(message="If that email is registered, a new code has been sent.")


# ── Password reset (REQ-154) ──────────────────────────────────────────────────

_GENERIC_RESET_MESSAGE = "If that email is registered, a reset code has been sent."


@router.post("/forgot-password", response_model=RegisterResponse)
@limiter.limit("5/hour")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    user_repo: UserRepository = Depends(get_user_repository),
    pr_repo: PasswordResetRepository = Depends(get_password_reset_repository),
):
    user = await user_repo.get_by_email(payload.email)
    if not user:
        # Don't reveal whether the email exists
        return RegisterResponse(message=_GENERIC_RESET_MESSAGE)

    await pr_repo.invalidate_all_for_user(user.id)
    code = PasswordReset.generate_code()
    await pr_repo.create({
        "user_id": user.id,
        "code": code,
        "expires_at": PasswordReset.make_expiry(),
    })
    await send_password_reset_email(payload.email, code)
    logger.info("password_reset_requested", user_id=str(user.id))
    return RegisterResponse(message=_GENERIC_RESET_MESSAGE)


@router.post("/reset-password", response_model=RegisterResponse)
@limiter.limit("5/hour")
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    user_repo: UserRepository = Depends(get_user_repository),
    pr_repo: PasswordResetRepository = Depends(get_password_reset_repository),
    redis: aioredis.Redis = Depends(get_redis),
):
    from app.core.security import hash_password

    user = await user_repo.get_by_email(payload.email)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid email or code.")

    pr = await pr_repo.get_valid_code(user.id, payload.code)
    if not pr:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset code.")

    await pr_repo.update(pr, {"used": True})
    await user_repo.update(user, {
        "hashed_password": hash_password(payload.new_password),
        "password_set_by_user": True,
    })

    # Recovery lever: purge PATs an attacker may have planted (opt-in checkbox).
    tokens_revoked = False
    if payload.revoke_api_tokens:
        from sqlalchemy import delete as sa_delete
        from app.models.api_token import ApiToken
        await user_repo.session.execute(sa_delete(ApiToken).where(ApiToken.user_id == user.id))
        await user_repo.session.commit()
        tokens_revoked = True

    try:
        await send_password_changed_email(user.email, tokens_revoked)
    except Exception as exc:
        logger.error("password_reset_email_notify_failed", user_id=str(user.id), error=str(exc))

    # Revoke refresh tokens issued before now — /refresh compares their iat.
    try:
        await revoke_sessions_issued_before_now(
            redis, str(user.id), settings.refresh_token_expire_days * 86400
        )
    except Exception as exc:
        # Redis down must not block the reset itself; sessions then age out normally.
        logger.error("password_reset_session_revoke_failed", user_id=str(user.id), error=str(exc))

    logger.info("password_reset_success", user_id=str(user.id))
    return RegisterResponse(message="Password updated. You can now sign in.")


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    auth_service: AuthService = Depends(get_auth_service),
):
    logger.info("login_attempt", email=form_data.username, content_type=request.headers.get("content-type"))
    try:
        user = await auth_service.authenticate_user(form_data.username, form_data.password)
    except UnverifiedUserError:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email not verified. Check your inbox for the verification code.",
        )

    if not user:
        logger.warning("login_failure", email=form_data.username)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    logger.info("login_success", user_id=str(user.id), email=user.email)
    return _issue_tokens(response, str(user.id))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    response: Response,
    redis: aioredis.Redis = Depends(get_redis),
):
    refresh_token = request.cookies.get(_REFRESH_COOKIE)
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token.")

    try:
        payload = decode_token(refresh_token)
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token.")

    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token type.")

    jti = payload.get("jti")
    if jti and await is_blacklisted(redis, jti):
        logger.warning("token_rejected", reason="blacklisted_refresh", jti=jti)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token has been revoked.")

    # REQ-154/155: tokens issued before a password reset or deactivation are dead.
    invalid_before = await sessions_invalid_before(redis, payload["sub"])
    if invalid_before is not None and payload.get("iat", 0) < invalid_before:
        logger.warning("token_rejected", reason="issued_before_revocation", user_id=payload.get("sub"))
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token has been revoked.")

    if jti:
        exp = payload.get("exp", 0)
        ttl = max(int(exp - datetime.now(timezone.utc).timestamp()), 1)
        await blacklist_token(redis, jti, ttl)

    user_payload = {"sub": payload["sub"]}
    new_access = create_access_token(user_payload)
    new_refresh = create_refresh_token(user_payload)
    _set_refresh_cookie(response, new_refresh)

    logger.info("token_refreshed", user_id=payload.get("sub"))
    return {"access_token": new_access, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    redis: aioredis.Redis = Depends(get_redis),
    current_user: User = Depends(get_current_user),
):
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        await _blacklist_jwt(auth_header[7:], redis)

    refresh_token = request.cookies.get(_REFRESH_COOKIE)
    if refresh_token:
        await _blacklist_jwt(refresh_token, redis)

    response.delete_cookie(_REFRESH_COOKIE, path="/api/v1/auth")
    logger.info("logout", user_id=str(current_user.id))
