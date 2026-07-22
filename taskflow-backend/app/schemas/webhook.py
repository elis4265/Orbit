import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

WebhookEvent = Literal[
    "task.created", "task.updated", "task.completed", "task.deleted",
    "comment.created", "sprint.closed",
]


WebhookFormat = Literal["json", "slack", "discord"]


class WebhookCreate(BaseModel):
    url: str = Field(..., min_length=1, max_length=2000, pattern=r"^https?://.+")
    events: List[WebhookEvent] = Field(..., min_length=1)
    format: WebhookFormat = "json"


class WebhookUpdate(BaseModel):
    url: Optional[str] = Field(None, min_length=1, max_length=2000, pattern=r"^https?://.+")
    events: Optional[List[WebhookEvent]] = Field(None, min_length=1)
    enabled: Optional[bool] = None
    format: Optional[WebhookFormat] = None


class WebhookResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    url: str
    events: List[str]
    enabled: bool
    format: str = "json"
    last_status: Optional[int] = None
    last_delivery_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WebhookCreated(WebhookResponse):
    """Returned only at creation — the sole time the signing secret is visible."""
    secret: str
