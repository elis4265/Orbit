from datetime import timedelta
from typing import Optional

from app.models.user import User
from app.repositories.user import UserRepository
from app.core.security import create_access_token as _create_access_token, hash_password, verify_password


class UnverifiedUserError(Exception):
    pass


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    @staticmethod
    def hash_password(password: str) -> str:
        return hash_password(password)

    @staticmethod
    def verify_password(hashed_password: str, plain_password: str) -> bool:
        return verify_password(plain_password, hashed_password)

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        return _create_access_token(data, expires_delta)

    async def authenticate_user(self, email: str, plain_password: str) -> Optional[User]:
        user = await self.user_repo.get_by_email(email)
        if not user:
            return None
        if not self.verify_password(user.hashed_password, plain_password):
            return None
        # Deactivated accounts get the same 401 as a wrong password — no status leak.
        if not user.is_active:
            return None
        if not user.is_verified:
            raise UnverifiedUserError()
        return user
