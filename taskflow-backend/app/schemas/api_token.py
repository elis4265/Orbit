import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ApiTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    scope: Literal["read", "write"] = "read"


class ApiTokenResponse(BaseModel):
    id: uuid.UUID
    name: str
    prefix: str
    scope: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ApiTokenCreated(ApiTokenResponse):
    """Returned only at creation — the sole time the full token is visible."""
    token: str
