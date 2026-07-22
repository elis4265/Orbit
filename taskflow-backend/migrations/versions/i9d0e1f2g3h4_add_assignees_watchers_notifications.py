"""add assignee/priority/due_date to tasks, task_watchers, notification_preferences, notifications

Revision ID: i9d0e1f2g3h4
Revises: h8c9d0e1f2g3
Create Date: 2026-06-13
"""
from alembic import op
import sqlalchemy as sa

revision = "i9d0e1f2g3h4"
down_revision = "h8c9d0e1f2g3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Extend tasks table ────────────────────────────────────────────────────
    op.add_column("tasks", sa.Column("priority", sa.Integer(), nullable=False, server_default="3"))
    op.add_column("tasks", sa.Column("due_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "tasks",
        sa.Column(
            "assignee_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # ── task_watchers ─────────────────────────────────────────────────────────
    op.create_table(
        "task_watchers",
        sa.Column("task_id", sa.UUID(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # ── notification_preferences ──────────────────────────────────────────────
    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("on_comment", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("on_mention", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("on_status_change", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("on_assignee_change", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("on_priority_change", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("on_due_date_approaching", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("on_task_deleted", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("due_date_reminder_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("email_enabled", sa.Boolean(), nullable=False, server_default="false"),
    )

    # ── notifications ─────────────────────────────────────────────────────────
    notification_type = sa.Enum(
        "comment_added", "mentioned", "status_changed", "assignee_changed",
        "priority_changed", "task_deleted", "due_date_approaching",
        name="notification_type",
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.UUID(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
        sa.Column("task_id", sa.UUID(), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("type", notification_type, nullable=False),
        sa.Column("read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("payload", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_notifications_user_read", "notifications", ["user_id", "read"])
    op.create_index("idx_notifications_user_created", "notifications", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_notifications_user_created", table_name="notifications")
    op.drop_index("idx_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")
    sa.Enum(name="notification_type").drop(op.get_bind())
    op.drop_table("notification_preferences")
    op.drop_table("task_watchers")
    op.drop_column("tasks", "assignee_id")
    op.drop_column("tasks", "due_date")
    op.drop_column("tasks", "priority")
