"""Impact method: task.business_value (1-5)

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'a2b3c4d5e6f7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('business_value', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'business_value')
