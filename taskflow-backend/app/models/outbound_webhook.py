import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OutboundWebhook(Base):
    """Admin-configured outbound webhook (REQ-144). Payloads are HMAC-SHA256-signed
    with `secret`; the secret is shown once at creation (DD-046)."""
    __tablename__ = "outbound_webhooks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url: Mapped[str] = mapped_column(String(2000), nullable=False)
    # Kept server-side in clear: needed to re-derive the HMAC on every delivery.
    secret: Mapped[str] = mapped_column(String(100), nullable=False)
    # Subscribed event names, e.g. ["task.created", "sprint.closed"].
    events: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Delivery shape (REQ-146): 'json' = signed envelope; 'slack'/'discord' = chat message.
    format: Mapped[str] = mapped_column(String(10), nullable=False, default="json")
    last_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
