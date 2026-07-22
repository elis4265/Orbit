import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class PriorityItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: str = Field(default="#888888", pattern=r"^#[0-9A-Fa-f]{6}$")


class PriorityItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    color: Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class PriorityItemReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]


class PriorityItemResponse(BaseModel):
    id: uuid.UUID
    scheme_id: uuid.UUID
    name: str
    color: str
    position: int

    model_config = ConfigDict(from_attributes=True)


class PrioritySchemeResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_default: bool
    project_id: Optional[uuid.UUID]
    items: list[PriorityItemResponse] = []

    model_config = ConfigDict(from_attributes=True)


class AssignSchemeRequest(BaseModel):
    scheme_id: uuid.UUID
