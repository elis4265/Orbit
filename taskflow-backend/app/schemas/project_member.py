import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict

from app.models.project_member import MemberRole


class InviteCreate(BaseModel):
    email: EmailStr


class InviteMetadataResponse(BaseModel):
    project_id: uuid.UUID
    workspace_name: str
    email: str
    expired: bool
    used: bool
    # HW-23: lets the invite page route registered invitees to Sign in
    user_exists: bool


class InviteResponse(BaseModel):
    id: uuid.UUID
    token: uuid.UUID
    project_id: uuid.UUID
    email: str
    used: bool
    expires_at: datetime
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MemberResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    avatar_url: str | None = None
    initials: str = ''
    joined_at: datetime | None = None
    role: str = MemberRole.member

    model_config = ConfigDict(from_attributes=True)


class PromoteRoleRequest(BaseModel):
    role: MemberRole
