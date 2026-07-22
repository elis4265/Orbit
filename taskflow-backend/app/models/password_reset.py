import secrets
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

RESET_CODE_TTL_MINUTES = 15


class PasswordReset(Base):
    """Single-use emailed reset code (REQ-154). Mirrors EmailVerification."""

    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(6), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    @staticmethod
    def generate_code() -> str:
        return f"{secrets.randbelow(10 ** 6):06d}"

    @staticmethod
    def make_expiry() -> datetime:
        return datetime.now(timezone.utc) + timedelta(minutes=RESET_CODE_TTL_MINUTES)
