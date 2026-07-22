import uuid
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class AutomationRuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    trigger: Literal[
        "task_created", "status_changed",
        "pr_opened", "pr_merged", "pr_closed", "branch_created", "commit_pushed",
    ]
    trigger_config: Optional[dict] = None
    conditions: Optional[list[dict]] = None
    actions: list[dict] = Field(..., min_length=1)
    enabled: bool = True


class AutomationRuleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    trigger: Optional[str] = None
    trigger_config: Optional[dict] = None
    conditions: Optional[list[dict]] = None
    actions: Optional[list[dict]] = None
    enabled: Optional[bool] = None
    position: Optional[int] = None


class AutomationRuleResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    trigger: str
    trigger_config: Optional[dict] = None
    conditions: Optional[list[dict]] = None
    actions: list[dict]
    enabled: bool
    position: int

    model_config = ConfigDict(from_attributes=True)
