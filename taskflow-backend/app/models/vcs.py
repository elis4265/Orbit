"""Git-integration persistence: connections, dev-links, processed-event log.

See docs/git-integration-requirements.md. A connection binds one project to one
repo; dev-links are the outbound "Development" panel; vcs_events deduplicates
inbound webhook deliveries (idempotency) and doubles as an audit trail.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class VcsConnection(Base):
    """One (project, repo) link. provider ∈ github|gitlab|bitbucket."""

    __tablename__ = "vcs_connections"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    repo_identifier: Mapped[str] = mapped_column(String(255), nullable=False)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # GitHub App install id (mint tokens on demand); GitLab/Bitbucket refresh token (encrypted).
    installation_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    # event→status-category mapping overrides (see DEFAULT_MAPPING)
    settings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow(),
    )

    __table_args__ = (
        Index("idx_vcs_connections_project", "project_id"),
    )


class TaskDevLink(Base):
    """A branch/commit/PR linked to a task — the outbound Development panel."""

    __tablename__ = "task_dev_links"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vcs_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # branch|commit|pr
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    url: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    author_login: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.utcnow(), onupdate=lambda: datetime.utcnow(),
    )

    __table_args__ = (
        UniqueConstraint("task_id", "kind", "external_id", name="uq_dev_link_identity"),
        Index("idx_task_dev_links_task", "task_id"),
    )


class VcsEvent(Base):
    """Processed-delivery log for idempotency + audit. Dup (connection, delivery) = no-op."""

    __tablename__ = "vcs_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vcs_connections.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    delivery_id: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.utcnow()
    )
    processed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("connection_id", "delivery_id", name="uq_vcs_event_delivery"),
    )
