import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, ForeignKey, Enum, Index, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationType(PyEnum):
    comment_added = "comment_added"
    mentioned = "mentioned"
    status_changed = "status_changed"
    assignee_changed = "assignee_changed"
    priority_changed = "priority_changed"
    task_deleted = "task_deleted"
    due_date_approaching = "due_date_approaching"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type"), nullable=False
    )
    read: Mapped[bool] = mapped_column(default=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("idx_notifications_user_read", "user_id", "read"),
        Index("idx_notifications_user_created", "user_id", "created_at"),
    )
