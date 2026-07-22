import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Release(Base):
    """A shippable target (= Jira version / fixVersion). Tasks link via task.release_id."""

    __tablename__ = "releases"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # planned | released | archived
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="planned")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # target / ship date — drives the roadmap timeline bar
    release_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )

    __table_args__ = (
        Index("idx_releases_project", "project_id"),
    )
