"""add role column to workspace_members

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-13

"""
from alembic import op
import sqlalchemy as sa

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'workspace_members',
        sa.Column('role', sa.String(20), nullable=False, server_default='member'),
    )


def downgrade() -> None:
    op.drop_column('workspace_members', 'role')
