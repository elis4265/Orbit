import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict, computed_field

from app.core.config import settings


class UserBase(BaseModel):
    email: EmailStr = Field(..., description="The unique, verified email address of the user.")


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128)


class UserResponse(UserBase):
    id: uuid.UUID
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    is_verified: bool = False
    is_superuser: bool = False  # REQ-155: gates the Instance Admin menu entry only
    # False for SSO accounts until they set a password — drives "Set a password" UX
    password_set_by_user: bool = True
    created_at: datetime
    avatar_key: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[misc]
    @property
    def avatar_url(self) -> str | None:
        if self.avatar_key:
            return f"{settings.base_url}/api/v1/users/{self.id}/avatar"
        return None

    @computed_field  # type: ignore[misc]
    @property
    def initials(self) -> str:
        if self.first_name and self.last_name:
            return (self.first_name[0] + self.last_name[0]).upper()
        if self.username:
            return self.username[0].upper()
        return self.email[0].upper()


class UserProfileUpdate(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)