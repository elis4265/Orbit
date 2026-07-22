import uuid
from typing import Optional
from pydantic import BaseModel


class TokenResponse(BaseModel):
    """Standard payload returned to users upon successful authentication."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # seconds — matches ACCESS_TOKEN_EXPIRE_MINUTES=15


class TokenData(BaseModel):
    """Internal structural verification object for unpacked JWT payloads."""
    sub: Optional[str] = None  # Holds the stringified User UUID
    type: Optional[str] = None # Holds token usage intent ('access' or 'refresh')