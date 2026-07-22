import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

_STATUS = r"^(planned|released|archived)$"


class ReleaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    status: str = Field(default="planned", pattern=_STATUS)
    start_date: Optional[date] = None
    release_date: Optional[date] = None


class ReleaseUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern=_STATUS)
    start_date: Optional[date] = None
    release_date: Optional[date] = None
    position: Optional[int] = Field(None, ge=0)


class ReleaseResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str] = None
    status: str
    start_date: Optional[date] = None
    release_date: Optional[date] = None
    position: int = 0
    created_at: datetime
    # Progress rollup (computed in the service, not stored).
    total_tasks: int = 0
    done_tasks: int = 0
    progress_pct: int = 0

    model_config = ConfigDict(from_attributes=True)


class ReleaseShipRequest(BaseModel):
    # what to do with unfinished tasks: keep them, send to backlog, or move to another release
    unfinished_action: str = Field(default="keep", pattern=r"^(keep|backlog|move)$")
    target_release_id: Optional[uuid.UUID] = None


class ReleaseShipResponse(BaseModel):
    id: uuid.UUID
    status: str
    total_tasks: int
    done_tasks: int
    incomplete_tasks: int
    clean: bool
