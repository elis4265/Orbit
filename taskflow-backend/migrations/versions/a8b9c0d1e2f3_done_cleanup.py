"""Done column cleanup: tasks.completed_at + projects.hide_done_after_days (REQ-137/138)

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = 'a8b9c0d1e2f3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('projects', sa.Column('hide_done_after_days', sa.Integer(), nullable=True))
    # Best-effort backfill: existing done tasks get updated_at as completion time.
    op.execute("UPDATE tasks SET completed_at = updated_at WHERE status = 'done'")


def downgrade() -> None:
    op.drop_column('projects', 'hide_done_after_days')
    op.drop_column('tasks', 'completed_at')
