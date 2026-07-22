import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    # UUID primary key — more secure than auto-increment integers because
    # sequential IDs let attackers enumerate resources (/users/1, /users/2...)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_verified: Mapped[bool] = mapped_column(default=False, nullable=False)
    # REQ-155: instance admin. is_superuser gates /admin/* only — never project RBAC.
    # is_active=False blocks every auth path; reversible, preserves all FKs.
    is_superuser: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    # False only for SSO-created accounts (random unseen password) until they
    # set one via the reset/change flows — drives the "Set a password" UX.
    password_set_by_user: Mapped[bool] = mapped_column(default=True, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    avatar_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # One user owns many projects.
    # `passive_deletes=True` allows the database's ON DELETE CASCADE
    # constraint to handle dependent row removal.
    projects: Mapped[list["Project"]] = relationship(
        "Project",
        back_populates="owner",
        # HW-18 added projects.default_assignee_id, a second FK to users.id, so the
        # ownership join must be stated explicitly.
        foreign_keys="Project.owner_id",
        lazy="noload",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
