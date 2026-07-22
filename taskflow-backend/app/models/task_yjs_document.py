import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TaskYjsDocument(Base):
    """Collaborative description document (Yjs binary). Written by Hocuspocus
    (node, raw pg); the backend only copies rows on task clone (REQ-156).
    Mirrors migration g7b8c9d0e1f2 exactly."""

    __tablename__ = "task_yjs_documents"

    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True
    )
    ydoc: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
