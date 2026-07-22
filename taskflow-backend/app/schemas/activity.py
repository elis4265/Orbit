import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ActivityResponse(BaseModel):
    id: int
    entity_type: str
    entity_id: uuid.UUID | None
    entity_name: str | None
    project_id: uuid.UUID
    actor_id: uuid.UUID | None
    actor_name: str | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    meta: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedActivityResponse(BaseModel):
    items: list[ActivityResponse]
    total: int
    next_cursor: int | None = None
