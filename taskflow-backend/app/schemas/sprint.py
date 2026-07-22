import uuid
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


class SprintCompleteRequest(BaseModel):
    """Enforced-mode sprint completion. Forces a decision for incomplete tasks:
    move them to the backlog, an existing sprint, or a freshly created one."""
    incomplete_action: Literal["backlog", "move", "new"]
    target_sprint_id: Optional[uuid.UUID] = None
    new_sprint_name: Optional[str] = Field(None, min_length=1, max_length=100)


class SprintCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    goal: Optional[str] = None
    start_date: date
    end_date: date


class SprintUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    goal: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class SprintResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    board_id: Optional[uuid.UUID]   # NULL for Flow auto-cycles (project-scoped)
    name: str
    goal: Optional[str]
    start_date: date
    end_date: date
    status: str
    committed_points: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
