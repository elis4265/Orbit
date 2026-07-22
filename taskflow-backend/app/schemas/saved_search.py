import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class SavedSearchCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    filters: list[dict[str, Any]] = Field(default_factory=list)


class SavedSearchUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    filters: list[dict[str, Any]] | None = None


class SavedSearchResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    name: str
    filters: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
