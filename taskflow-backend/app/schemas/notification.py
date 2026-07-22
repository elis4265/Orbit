import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationType


class NotificationResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    task_id: Optional[uuid.UUID]
    type: NotificationType
    read: bool
    payload: dict
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationPreferencesResponse(BaseModel):
    on_comment: bool
    on_mention: bool
    on_status_change: bool
    on_assignee_change: bool
    on_priority_change: bool
    on_due_date_approaching: bool
    on_task_deleted: bool
    due_date_reminder_hours: int
    email_enabled: bool

    model_config = ConfigDict(from_attributes=True)


class NotificationPreferencesUpdate(BaseModel):
    on_comment: bool = True
    on_mention: bool = True
    on_status_change: bool = True
    on_assignee_change: bool = True
    on_priority_change: bool = True
    on_due_date_approaching: bool = True
    on_task_deleted: bool = True
    due_date_reminder_hours: int = 24
    email_enabled: bool = False


class WatcherResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: Optional[str]

    model_config = ConfigDict(from_attributes=True)
