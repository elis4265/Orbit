import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.task import IssueType


class StatusCategory(str, enum.Enum):
    unstarted = "unstarted"
    started = "started"
    completed = "completed"
    cancelled = "cancelled"


class ProjectStatus(Base):
    __tablename__ = "project_statuses"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6b7280")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # 'curated' creation policy: tasks may be created directly in this status.
    allow_on_create: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    wip_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    issue_type: Mapped[Optional[IssueType]] = mapped_column(
        Enum(IssueType, name="issue_type_scope"),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_project_status_name"),
    )


class ProjectTransitionRule(Base):
    __tablename__ = "project_transition_rules"

    id: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4, primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_statuses.id", ondelete="CASCADE"), nullable=False
    )
    to_status_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_statuses.id", ondelete="CASCADE"), nullable=False
    )
    require_role: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    issue_type: Mapped[Optional[IssueType]] = mapped_column(
        Enum(IssueType, name="issue_type_scope"),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint(
            "project_id", "from_status_id", "to_status_id", "issue_type", name="uq_transition_rule"
        ),
    )
