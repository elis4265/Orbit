import uuid
from datetime import datetime
from pydantic import BaseModel

from app.models.task_link import LinkType


class TaskLinkCreate(BaseModel):
    target_id: uuid.UUID
    link_type: LinkType


class LinkedTaskInfo(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    # HW-22: linked issues are shown by key ("HW-22"), not title alone — people
    # recall tasks by number. Defaults cover the deleted-task placeholder.
    sequence_number: int = 0
    project_key: str = ""

    model_config = {"from_attributes": True}


class TaskLinkResponse(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    target_id: uuid.UUID
    link_type: str
    display_type: str
    linked_task: LinkedTaskInfo
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskSearchResult(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    board_id: uuid.UUID | None = None
    sequence_number: int = 0
    project_id: uuid.UUID | None = None
    project_key: str = ""

    model_config = {"from_attributes": True}
