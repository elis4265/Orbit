import uuid

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationPreferences(Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )

    on_comment: Mapped[bool] = mapped_column(default=True)
    on_mention: Mapped[bool] = mapped_column(default=True)
    on_status_change: Mapped[bool] = mapped_column(default=True)
    on_assignee_change: Mapped[bool] = mapped_column(default=True)
    on_priority_change: Mapped[bool] = mapped_column(default=True)
    on_due_date_approaching: Mapped[bool] = mapped_column(default=True)
    on_task_deleted: Mapped[bool] = mapped_column(default=True)
    due_date_reminder_hours: Mapped[int] = mapped_column(Integer, default=24)
    email_enabled: Mapped[bool] = mapped_column(default=False)
