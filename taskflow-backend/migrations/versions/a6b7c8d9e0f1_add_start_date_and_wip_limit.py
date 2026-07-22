"""add start_date to tasks and wip_limit to project_statuses

Revision ID: a6b7c8d9e0f1
Revises: z5a6b7c8d9e0
Create Date: 2026-06-18 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a6b7c8d9e0f1'
down_revision = 'z5a6b7c8d9e0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('start_date', sa.DateTime(timezone=True), nullable=True))
    op.add_column('project_statuses', sa.Column('wip_limit', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('project_statuses', 'wip_limit')
    op.drop_column('tasks', 'start_date')
