import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ProjectBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class ProjectCreate(ProjectBase):
    # Workflow mode chosen at creation (first-run modal / API). Regression note:
    # the create endpoint silently dropped this field until 2026-07-12.
    mode: str = Field("open", pattern=r"^(open|guided|enforced)$")


class ProjectUpdate(BaseModel):
    """Partial update: rename and/or board-cleanup setting (REQ-138) / auto-archive (REQ-161)
    / default assignee (HW-18)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    hide_done_after_days: Optional[int] = Field(None, ge=1, le=365)
    auto_archive_after_days: Optional[int] = Field(None, ge=1, le=365)
    # HW-18. Membership of default_assignee_id is validated in ProjectService.
    default_assignee_mode: Optional[str] = Field(
        None, pattern=r"^(unassigned|creator|member)$"
    )
    default_assignee_id: Optional[uuid.UUID] = None


class ProjectResponse(ProjectBase):
    id: uuid.UUID
    owner_id: uuid.UUID
    key: str
    mode: str = "open"
    enforce_block_links: bool = False
    creation_status_policy: str = "any"
    estimation_method: str = "none"
    hide_done_after_days: Optional[int] = None
    auto_archive_after_days: Optional[int] = None
    default_assignee_mode: str = "unassigned"
    default_assignee_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
