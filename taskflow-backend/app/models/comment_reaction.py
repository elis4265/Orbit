import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Curated set (Linear-style picker) — free-form emoji is rejected (REQ-162).
REACTION_EMOJIS: tuple[str, ...] = ("👍", "👎", "❤️", "🎉", "👀", "🚀", "😄", "🤔")

# Canonical names for the defaults (Teams model): a project CustomEmote with the
# same name replaces that default in the picker. Order mirrors REACTION_EMOJIS.
DEFAULT_EMOTE_NAMES: dict[str, str] = {
    "thumbsup": "👍",
    "thumbsdown": "👎",
    "heart": "❤️",
    "tada": "🎉",
    "eyes": "👀",
    "rocket": "🚀",
    "smile": "😄",
    "thinking": "🤔",
}


class CommentReaction(Base):
    __tablename__ = "comment_reactions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    comment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # Unicode emoji from the curated set, or ':name:' referencing a CustomEmote.
    emoji: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", "emoji", name="uq_comment_reaction"),
    )
