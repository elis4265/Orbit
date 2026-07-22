import uuid
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TaskTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    issue_type: Optional[str] = Field(None, pattern=r"^(epic|story|task|bug)$")
    priority_id: Optional[uuid.UUID] = None
    severity: Optional[str] = Field(None, pattern=r"^(low|medium|high|critical)$")
    tag_ids: list[uuid.UUID] = Field(default_factory=list)


class TaskTemplateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    title: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    issue_type: Optional[str] = Field(None, pattern=r"^(epic|story|task|bug)$")
    priority_id: Optional[uuid.UUID] = None
    severity: Optional[str] = Field(None, pattern=r"^(low|medium|high|critical)$")
    tag_ids: Optional[list[uuid.UUID]] = None
    position: Optional[int] = Field(None, ge=0)


class TaskTemplateResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    title: Optional[str] = None
    description: Optional[str] = None
    issue_type: Optional[str] = None
    priority_id: Optional[uuid.UUID] = None
    severity: Optional[str] = None
    tag_ids: list[uuid.UUID] = Field(default_factory=list)
    position: int = 0

    model_config = ConfigDict(from_attributes=True)
