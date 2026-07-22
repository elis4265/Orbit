import uuid
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

class BoardBase(BaseModel):
    """Base schema holding shared board parameters."""
    name: str = Field(
        ..., 
        min_length=1, 
        max_length=255, 
        description="The descriptive name of the Kanban board."
    )

class BoardCreate(BoardBase):
    pass


class BoardUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class BoardFilterUpdate(BaseModel):
    """Admin-set board scope filter. None clears it. Shape: {"filters": [...]}."""
    filter_config: dict | None = None


class BoardResponse(BoardBase):
    """Schema for outbound board delivery."""
    id: uuid.UUID
    project_id: uuid.UUID
    filter_config: dict | None = None
    created_at: datetime
    updated_at: datetime

    # Instructs Pydantic to cleanly read standard SQLAlchemy models as dictionaries
    model_config = ConfigDict(from_attributes=True)