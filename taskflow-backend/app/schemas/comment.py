import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class CommentCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Comment content cannot be empty.")
        return v


class CommentUpdate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Comment content cannot be empty.")
        return v


class CommentHistoryResponse(BaseModel):
    id: uuid.UUID
    comment_id: uuid.UUID
    content: str
    edited_by: uuid.UUID | None
    edited_at: datetime

    model_config = {"from_attributes": True}


class ReactionAggregate(BaseModel):
    """REQ-162: one emoji's tally on a comment; `me` = current user reacted."""
    emoji: str
    count: int
    me: bool


class ReactionRequest(BaseModel):
    emoji: str

    @field_validator("emoji")
    @classmethod
    def emoji_curated_or_custom_shape(cls, v: str) -> str:
        # Curated unicode emoji, or ':name:' custom-emote reference. Existence
        # of the custom emote is checked in the router (needs project context).
        from app.models.comment_reaction import REACTION_EMOJIS
        from app.schemas.emote import EMOTE_NAME_RE
        if v in REACTION_EMOJIS:
            return v
        if v.startswith(":") and v.endswith(":") and EMOTE_NAME_RE.match(v[1:-1] or ""):
            return v
        raise ValueError(f"Emoji must be one of {' '.join(REACTION_EMOJIS)} or a ':name:' custom emote.")


class CommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID | None
    content: str
    created_at: datetime
    edited_at: datetime | None
    reactions: list[ReactionAggregate] = []

    model_config = {"from_attributes": True}
