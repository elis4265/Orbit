import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CycleConfigUpdate(BaseModel):
    enabled: bool = True
    duration_weeks: int = Field(2, ge=1, le=8)
    cooldown_days: int = Field(0, ge=0, le=7)
    start_anchor: date
    upcoming_count: int = Field(2, ge=1, le=15)


class CycleConfigResponse(BaseModel):
    project_id: uuid.UUID
    enabled: bool
    duration_weeks: int
    cooldown_days: int
    start_anchor: date
    upcoming_count: int

    model_config = ConfigDict(from_attributes=True)
