import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RecurringTaskCreate(BaseModel):
    template_id: uuid.UUID
    cadence: Literal["daily", "weekly", "monthly"]
    weekday: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)

    @model_validator(mode="after")
    def _cadence_params(self):
        if self.cadence == "weekly" and self.weekday is None:
            raise ValueError("weekly cadence requires weekday (0=Mon..6=Sun)")
        if self.cadence == "monthly" and self.day_of_month is None:
            raise ValueError("monthly cadence requires day_of_month (1..31)")
        return self


class RecurringTaskUpdate(BaseModel):
    cadence: Optional[Literal["daily", "weekly", "monthly"]] = None
    weekday: Optional[int] = Field(None, ge=0, le=6)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    enabled: Optional[bool] = None


class RecurringTaskResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    template_id: uuid.UUID
    cadence: str
    weekday: Optional[int] = None
    day_of_month: Optional[int] = None
    next_run_at: date
    enabled: bool
    created_by: Optional[uuid.UUID] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
