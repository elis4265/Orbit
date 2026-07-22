import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CustomField(Base):
    """Admin-defined custom field on tasks (Guided/Enforced modes).

    Values live in `tasks.custom_fields` JSONB keyed by str(field id). Field
    types: text | number | date | select | checkbox. `options` holds the choice
    list for `select`. `required` is enforced (block save) only in Enforced mode.
    """
    __tablename__ = "custom_fields"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False)
    options: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # for select
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
