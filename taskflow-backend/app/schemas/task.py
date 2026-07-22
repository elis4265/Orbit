import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from app.models.task import TaskStatus, IssueType, SeverityLevel
from app.schemas.tag import TagResponse


# REQ-157: bulk edit schemas live in routers/bulk_edit.py (BulkEditRequest) —
# the old repo-level BulkTaskUpdate pair was removed with the silent endpoint.


class TaskReorderItem(BaseModel):
    id: uuid.UUID
    position: int = Field(..., ge=0)
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None


class TaskReorderRequest(BaseModel):
    tasks: List[TaskReorderItem]


# --- Subtask Schemas ---
class SubTaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class SubTaskCreate(SubTaskBase):
    pass


class SubTaskResponse(SubTaskBase):
    id: uuid.UUID
    task_id: Optional[uuid.UUID]  # = Task.parent_id (via @property on Task)
    is_completed: bool             # = Task.status == 'done' (via @property on Task)
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Core Task Schemas ---
class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None)
    status: TaskStatus = Field(default=TaskStatus.todo)
    issue_type: IssueType = Field(default=IssueType.task)
    priority_id: Optional[uuid.UUID] = None
    position: int = Field(default=0, ge=0)
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    assignee_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    custom_status_id: Optional[uuid.UUID] = None
    severity: Optional[SeverityLevel] = None
    estimate: Optional[int] = Field(None, ge=0)
    business_value: Optional[int] = Field(None, ge=1, le=5)
    custom_fields: Optional[dict] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    """Discrete field updates or drag-and-drop. description owned by Hocuspocus (DD-021)."""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[TaskStatus] = None
    issue_type: Optional[IssueType] = None
    priority_id: Optional[uuid.UUID] = None
    position: Optional[int] = Field(None, ge=0)
    grid_x: Optional[int] = None
    grid_y: Optional[int] = None
    start_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    assignee_id: Optional[uuid.UUID] = None
    parent_id: Optional[uuid.UUID] = None
    sprint_id: Optional[uuid.UUID] = None
    release_id: Optional[uuid.UUID] = None
    custom_status_id: Optional[uuid.UUID] = None
    severity: Optional[SeverityLevel] = None
    estimate: Optional[int] = Field(None, ge=0)
    business_value: Optional[int] = Field(None, ge=1, le=5)
    custom_fields: Optional[dict] = None
    version: int = Field(..., ge=1)


class ParentTaskInfo(BaseModel):
    id: uuid.UUID
    title: str
    issue_type: IssueType
    status: TaskStatus
    sequence_number: int = 0

    model_config = ConfigDict(from_attributes=True)


class TaskMoveRequest(BaseModel):
    target_project_id: uuid.UUID


class TaskResponse(TaskBase):
    id: uuid.UUID
    project_id: uuid.UUID
    sprint_id: Optional[uuid.UUID] = None
    release_id: Optional[uuid.UUID] = None
    sequence_number: int = 1
    project_key: str = ""
    version: int
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    sub_tasks: List[SubTaskResponse] = Field(default=[])
    tags: List[TagResponse] = Field(default=[])
    parent: Optional[ParentTaskInfo] = None

    model_config = ConfigDict(from_attributes=True)


