import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class WorkLogCreate(BaseModel):
    minutes: int = Field(..., gt=0, le=24 * 60)
    note: Optional[str] = Field(None, max_length=500)
    spent_on: Optional[date] = None


class WorkLogResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    minutes: int
    note: Optional[str] = None
    spent_on: date
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkLogListResponse(BaseModel):
    entries: List[WorkLogResponse]
    total_minutes: int


class TimeReportRow(BaseModel):
    user_id: Optional[uuid.UUID] = None
    total_minutes: int


class TimeReportResponse(BaseModel):
    rows: List[TimeReportRow]
    total_minutes: int
