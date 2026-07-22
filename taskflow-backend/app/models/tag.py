import uuid
from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import String, Enum, ForeignKey, DateTime, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class TagVisibility(PyEnum):
    private = "private"
    workspace = "workspace"


class Tag(TimestampMixin, Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#7c6af7")
    visibility: Mapped[TagVisibility] = mapped_column(
        Enum(TagVisibility, name="tag_visibility"),
        nullable=False,
        default=TagVisibility.workspace,
    )

    __table_args__ = (
        UniqueConstraint("project_id", "name", name="uq_tag_project_name"),
        Index("idx_tags_project_id", "project_id"),
    )
