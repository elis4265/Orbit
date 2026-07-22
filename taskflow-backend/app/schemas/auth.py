import re
import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class UserRegister(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    password: str | None = Field(None, min_length=8, max_length=100)
    invite_token: uuid.UUID | None = None

    @field_validator("email")
    @classmethod
    def email_rfc5321_length(cls, v: str) -> str:
        local = v.split("@")[0]
        if len(local) > 64:
            raise ValueError("Email local part must not exceed 64 characters (RFC 5321).")
        if len(v) > 254:
            raise ValueError("Email address must not exceed 254 characters (RFC 5321).")
        return v

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str | None) -> str | None:
        return v if v is None else _check_password_complexity(v)

    @model_validator(mode="after")
    def password_required_for_invite(self) -> "UserRegister":
        if self.invite_token is not None and not self.password:
            raise ValueError("Password is required when joining via an invite.")
        return self


def _check_password_complexity(v: str) -> str:
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"\d", v):
        raise ValueError("Password must contain at least one digit.")
    return v


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=100)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8, max_length=100)
    revoke_api_tokens: bool = False

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class ChangePasswordRequest(BaseModel):
    """Logged-in password change — gated by the current password."""
    current_password: str = Field(..., min_length=1, max_length=100)
    new_password: str = Field(..., min_length=8, max_length=100)
    revoke_api_tokens: bool = False

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        return _check_password_complexity(v)


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class RegisterResponse(BaseModel):
    message: str = ""
    expires_in_minutes: int = 15
    project_id: str | None = None
    access_token: str | None = None
