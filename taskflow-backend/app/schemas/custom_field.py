import uuid
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CustomFieldCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    field_type: Literal["text", "number", "date", "select", "checkbox"]
    options: Optional[list[str]] = None  # required for 'select'
    required: bool = False


class CustomFieldUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=60)
    options: Optional[list[str]] = None
    required: Optional[bool] = None
    position: Optional[int] = None


class CustomFieldResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    field_type: str
    options: Optional[list[str]] = None
    required: bool
    position: int

    model_config = ConfigDict(from_attributes=True)
