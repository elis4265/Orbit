"""add task_activity table

Revision ID: k1l2m3n4o5p6
Revises: j0e1f2g3h4i5
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = "k1l2m3n4o5p6"
down_revision = "j0e1f2g3h4i5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text("SELECT to_regclass('public.task_activity')")
    ).scalar()
    if exists:
        return

    op.create_table(
        "task_activity",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("task_title", sa.String(100), nullable=True),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("field", sa.String(50), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_task_activity_task_created", "task_activity", ["task_id", "created_at"])
    op.create_index("idx_task_activity_ws_created", "task_activity", ["workspace_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_task_activity_ws_created", table_name="task_activity")
    op.drop_index("idx_task_activity_task_created", table_name="task_activity")
    op.drop_table("task_activity")
