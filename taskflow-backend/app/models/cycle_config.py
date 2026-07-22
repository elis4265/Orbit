import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CycleConfig(Base):
    """Per-project automated-cycle settings for Flow (open) mode.

    One row per project. The scheduler reads enabled configs and maintains the
    project's current + upcoming cycles (rows in `sprints` with auto_managed=True,
    board_id=NULL), rolling unfinished tasks forward on cycle end.
    """
    __tablename__ = "cycle_configs"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    cooldown_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_anchor: Mapped[date] = mapped_column(Date, nullable=False)
    upcoming_count: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
