"""add comments and comment_history tables, extend attachments

Revision ID: h8c9d0e1f2g3
Revises: g7b8c9d0e1f2
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "h8c9d0e1f2g3"
down_revision = "g7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "comment_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("comment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("edited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Make task_id nullable and add comment_id to attachments
    op.alter_column("attachments", "task_id", nullable=True)
    op.add_column("attachments", sa.Column(
        "comment_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("comments.id", ondelete="CASCADE"), nullable=True
    ))
    op.create_index("ix_attachments_comment_id", "attachments", ["comment_id"])
    op.create_check_constraint(
        "ck_attachments_one_parent",
        "attachments",
        "num_nonnulls(task_id, comment_id) = 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_attachments_one_parent", "attachments", type_="check")
    op.drop_index("ix_attachments_comment_id", table_name="attachments")
    op.drop_column("attachments", "comment_id")
    op.alter_column("attachments", "task_id", nullable=False)
    op.drop_table("comment_history")
    op.drop_table("comments")
