import pytest
import jwt
from unittest.mock import AsyncMock, MagicMock
from datetime import timedelta

from app.services.auth import AuthService
from app.core.config import settings
from app.models.user import User


@pytest.fixture
def mock_user_repo():
    return MagicMock()


@pytest.fixture
def auth_service(mock_user_repo):
    return AuthService(user_repo=mock_user_repo)


def test_password_hashing_and_verification():
    password = "SuperSecretPassword123"
    hashed = AuthService.hash_password(password)

    assert hashed != password
    assert "argon2id" in hashed
    assert AuthService.verify_password(hashed, password) is True
    assert AuthService.verify_password(hashed, "WrongPassword") is False


def test_jwt_generation_contains_correct_payload(auth_service):
    user_id = "00000000-0000-0000-0000-000000000001"
    token_data = {"sub": user_id}

    token = auth_service.create_access_token(data=token_data, expires_delta=timedelta(minutes=15))

    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    assert payload.get("sub") == user_id
    assert payload.get("type") == "access"
    assert "exp" in payload


@pytest.mark.asyncio
async def test_authenticate_user_success(auth_service, mock_user_repo):
    plain_password = "my-password"
    hashed_password = AuthService.hash_password(plain_password)

    mock_user = User(
        id="00000000-0000-0000-0000-000000000001",
        email="dev@taskflow.io",
        hashed_password=hashed_password,
        is_verified=True,
        is_active=True,  # model default applies at INSERT, not construction (REQ-155)
    )

    mock_user_repo.get_by_email = AsyncMock(return_value=mock_user)

    user = await auth_service.authenticate_user("dev@taskflow.io", plain_password)

    assert user is not None
    assert user.email == "dev@taskflow.io"
    mock_user_repo.get_by_email.assert_called_once_with("dev@taskflow.io")