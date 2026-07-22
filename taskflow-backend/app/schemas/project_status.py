import uuid
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field

from app.models.task import IssueType


class ProjectStatusCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#6b7280", pattern=r"^#[0-9a-fA-F]{6}$")
    category: str = Field(..., pattern=r"^(unstarted|started|completed|cancelled)$")
    is_default: bool = False
    issue_type: Optional[IssueType] = None
    wip_limit: Optional[int] = Field(None, ge=1)


class ProjectStatusUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    category: Optional[str] = Field(None, pattern=r"^(unstarted|started|completed|cancelled)$")
    position: Optional[int] = Field(None, ge=0)
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    issue_type: Optional[IssueType] = None
    wip_limit: Optional[int] = Field(None, ge=1)
    allow_on_create: Optional[bool] = None


class ProjectStatusResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    color: str
    position: int
    category: str
    is_default: bool
    is_active: bool
    allow_on_create: bool = False
    wip_limit: Optional[int] = None
    created_at: datetime
    issue_type: Optional[IssueType] = None

    model_config = {"from_attributes": True}


class StatusReorderRequest(BaseModel):
    ordered_ids: List[uuid.UUID]


class TransitionRuleCreate(BaseModel):
    from_status_id: uuid.UUID
    to_status_id: uuid.UUID
    require_role: Optional[str] = None
    issue_type: Optional[IssueType] = None


class TransitionRuleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    from_status_id: uuid.UUID
    to_status_id: uuid.UUID
    require_role: Optional[str]
    is_active: bool
    issue_type: Optional[IssueType] = None

    model_config = {"from_attributes": True}


class ProjectModeUpdate(BaseModel):
    mode: str = Field(..., pattern=r"^(open|guided|enforced)$")
    enforce_block_links: Optional[bool] = None


class EstimationMethodUpdate(BaseModel):
    estimation_method: str = Field(..., pattern=r"^(none|story_points|flow|baseline|impact)$")


class CreationPolicyUpdate(BaseModel):
    creation_status_policy: str = Field(..., pattern=r"^(any|initial|curated)$")
