import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


class PriorityScheme(TimestampMixin, Base):
    """Global reusable priority scheme, or a project-forked private copy when project_id is set."""

    __tablename__ = "priority_schemes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # NULL → global scheme; set → private fork belonging to this project
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )

    items: Mapped[list["PrioritySchemeItem"]] = relationship(
        "PrioritySchemeItem",
        back_populates="scheme",
        order_by="PrioritySchemeItem.position",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class PrioritySchemeItem(TimestampMixin, Base):
    """One priority level within a scheme."""

    __tablename__ = "priority_scheme_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    scheme_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("priority_schemes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#888888")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    scheme: Mapped["PriorityScheme"] = relationship(
        "PriorityScheme", back_populates="items", lazy="noload"
    )
