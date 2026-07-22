import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import String, ForeignKey, DateTime, UniqueConstraint, Enum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class LinkType(PyEnum):
    blocks = "blocks"
    depends_on = "depends_on"
    duplicates = "duplicates"
    relates_to = "relates_to"


INVERSE_LINK_LABEL: dict[str, str] = {
    "blocks": "is_blocked_by",
    "depends_on": "is_depended_on_by",
    "duplicates": "is_duplicated_by",
    "relates_to": "relates_to",
}

LINK_DISPLAY_LABEL: dict[str, str] = {
    "blocks": "Is blocker of",
    "depends_on": "Is dependent on",
    "duplicates": "Is duplicate of",
    "relates_to": "Is related to",
    "is_blocked_by": "Is blocked by",
    "is_depended_on_by": "Is depended on by",
    "is_duplicated_by": "Is duplicated by",
}


class TaskLink(Base):
    __tablename__ = "task_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    link_type: Mapped[str] = mapped_column(
        Enum(LinkType, name="link_type"), nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "link_type", name="uq_task_links_pair_type"),
    )
