import uuid

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TaskTemplate(Base):
    """A reusable preset that prefills a new task. Project-scoped, admin-managed."""

    __tablename__ = "task_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Prefill fields — all optional; null/empty = "don't prefill this".
    title: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issue_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    priority_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("priority_scheme_items.id", ondelete="SET NULL"), nullable=True
    )
    severity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Default tags to apply (list of tag id strings).
    tag_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("idx_task_templates_project", "project_id"),
    )
