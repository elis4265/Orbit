"""REQ-155 — instance admin schemas."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    is_verified: bool
    is_active: bool
    is_superuser: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminUserListResponse(BaseModel):
    users: list[AdminUserResponse]
    total: int


class AdminUserUpdate(BaseModel):
    is_active: bool
