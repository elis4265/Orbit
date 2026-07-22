"""Task archive (REQ-161)

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa


revision = 'd7e8f9a0b1c2'
down_revision = 'c6d7e8f9a0b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('projects', sa.Column('auto_archive_after_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('projects', 'auto_archive_after_days')
    op.drop_column('tasks', 'archived_at')
