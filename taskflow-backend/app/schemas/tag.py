import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator

from app.models.tag import TagVisibility

_DEFAULT_COLORS = [
    "#7c6af7", "#ef4444", "#f97316", "#eab308",
    "#22c55e", "#06b6d4", "#3b82f6", "#a855f7",
]


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: Optional[str] = None
    visibility: TagVisibility = TagVisibility.workspace

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not (len(v) == 7 and v.startswith("#")):
            raise ValueError("color must be a 7-character hex string like #7c6af7")
        return v


class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = None
    visibility: Optional[TagVisibility] = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not (len(v) == 7 and v.startswith("#")):
            raise ValueError("color must be a 7-character hex string like #7c6af7")
        return v


class TagResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    color: str
    visibility: TagVisibility
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
