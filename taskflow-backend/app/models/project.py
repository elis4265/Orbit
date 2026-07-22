import uuid

from sqlalchemy import JSON, String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    key: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    next_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    capabilities: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    enforce_block_links: Mapped[bool] = mapped_column(nullable=False, default=False)
    # Task-creation policy: 'any' (Linear) | 'initial' (Jira default Create
    # transition — new tasks land on the default unstarted status) | 'curated'
    # (only statuses with allow_on_create). Mode switch resets it to the
    # mode's default (Enforced → 'initial', others → 'any').
    creation_status_policy: Mapped[str] = mapped_column(String(10), nullable=False, default="any")
    # Estimation/measurement method (see docs/estimation-methods.md). 'none' = off.
    estimation_method: Mapped[str] = mapped_column(String(20), nullable=False, default="none")
    # Days after which completed tasks leave the default board view; NULL = never (REQ-138).
    hide_done_after_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # REQ-161: days after completion before auto-archive; NULL = manual archive only.
    auto_archive_after_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    priority_scheme_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("priority_schemes.id", ondelete="SET NULL"), nullable=True
    )
    # HW-18: default assignee for newly created tasks. Applied in TaskService.create_task
    # (the single choke point for UI/API/PAT/CSV/Trello/Jira/recurring creation).
    #   'unassigned' (default) — leave assignee_id null
    #   'creator'              — assign whoever created the task
    #   'member'               — assign default_assignee_id
    # An explicit assignee on the create payload always wins over the default.
    default_assignee_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="unassigned", default="unassigned"
    )
    # Only meaningful when default_assignee_mode == 'member'. SET NULL covers user
    # deletion; ProjectMemberService.remove_member covers membership removal.
    default_assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # foreign_keys pinned: default_assignee_id is a second FK to users.id (HW-18).
    owner: Mapped["User"] = relationship(
        "User", back_populates="projects", foreign_keys=[owner_id]
    )
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="project", lazy="noload"
    )
