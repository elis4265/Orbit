import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DDL, String, Text, ForeignKey, Integer, Enum, Index, DateTime, UniqueConstraint, Computed, event
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.tag import Tag


class TaskStatus(PyEnum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class IssueType(PyEnum):
    epic = "epic"
    story = "story"
    task = "task"
    bug = "bug"


class SeverityLevel(PyEnum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


# YouTrack-style hierarchy: maps a child type → set of allowed parent types.
# Empty frozenset = no parent allowed (epic is always top-level).
ALLOWED_PARENT_TYPES: dict["IssueType", frozenset["IssueType"]] = {
    IssueType.epic:  frozenset(),
    IssueType.story: frozenset({IssueType.epic}),
    IssueType.task:  frozenset({IssueType.story, IssueType.epic}),
    IssueType.bug:   frozenset({IssueType.story, IssueType.epic}),
}


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    title: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status"),
        nullable=False,
        default=TaskStatus.todo,
    )

    issue_type: Mapped[IssueType] = mapped_column(
        Enum(IssueType, name="issue_type"),
        nullable=False,
        default=IssueType.task,
    )

    priority_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("priority_scheme_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Story points (estimation_method='story_points'). Unitless non-negative int.
    estimate: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Human-judged business value 1–5 (estimation_method='impact'). For value÷effort ranking.
    business_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Admin-defined custom field values, keyed by str(custom_field id). Guided/Enforced.
    custom_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    grid_x: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grid_y: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # When the task entered a done/completed state; cleared on leaving it (REQ-137).
    # Drives the hide-done-after-days board filter — never keyed off updated_at.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # REQ-161: archived tasks drop out of lists/search/stats by default; reversible.
    # Distinct from hide-done (REQ-138): hidden tasks still count in stats.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # STORED generated tsvector; deferred so ordinary task queries skip it.
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(
            "to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))",
            persisted=True,
        ),
        nullable=True,
        deferred=True,
    )

    # Optimistic locking. Starts at 1; every successful UPDATE increments by 1.
    # Client must send current version; mismatch → 409 Conflict.
    severity: Mapped[SeverityLevel | None] = mapped_column(
        Enum(SeverityLevel, name="severity_level"),
        nullable=True,
    )

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )

    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Who created the task (REQ-142). Server-set on every creation path; never client-supplied.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    sprint_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Fix version — which release this task ships in (= Jira fixVersion).
    release_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("releases.id", ondelete="SET NULL"), nullable=True, index=True
    )

    custom_status_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_statuses.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Self-referential FK — child tasks point to their parent (DD-027)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )

    project: Mapped["Project"] = relationship("Project", back_populates="tasks", foreign_keys=[project_id])

    # Self-referential relationship: one parent → many children
    sub_tasks: Mapped[list["Task"]] = relationship(
        "Task",
        foreign_keys=[parent_id],
        back_populates="parent",
        lazy="noload",
        cascade="all, delete-orphan",
    )

    parent: Mapped[Optional["Task"]] = relationship(
        "Task",
        foreign_keys=[parent_id],
        back_populates="sub_tasks",
        remote_side=[id],
        lazy="noload",
    )

    tags: Mapped[list["Tag"]] = relationship(
        "Tag",
        secondary="task_tags",
        lazy="noload",
    )

    __table_args__ = (
        Index("idx_tasks_project_status_position", "project_id", "status", "position"),
        # Hardens the human task ref {project.key}-{sequence_number} (REQ-GI-001).
        UniqueConstraint("project_id", "sequence_number", name="uq_task_project_sequence"),
        Index("ix_tasks_search_vector", "search_vector", postgresql_using="gin"),
        Index(
            "ix_tasks_title_trgm", "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    # Backward-compat properties for SubTaskResponse serialization
    @property
    def is_completed(self) -> bool:
        return self.status == TaskStatus.done

    @property
    def project_key(self) -> str:
        return self.project.key if self.project else ""

    @property
    def task_id(self) -> Optional[uuid.UUID]:
        return self.parent_id

    @property
    def project_key(self) -> str:
        return self.project.key if self.project is not None else ""


# pg_trgm must exist before the tasks table (gin_trgm_ops index, similarity()).
# Covers metadata.create_all (test bootstrap); Alembic owns production.
event.listen(
    Task.__table__,
    "before_create",
    DDL("CREATE EXTENSION IF NOT EXISTS pg_trgm"),
)
