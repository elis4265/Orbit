"""Custom fields: custom_fields table + tasks.custom_fields JSONB

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'b3c4d5e6f7a8'
down_revision = 'a2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'custom_fields',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('project_id', postgresql.UUID(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=60), nullable=False),
        sa.Column('field_type', sa.String(length=20), nullable=False),
        sa.Column('options', postgresql.JSONB(), nullable=True),
        sa.Column('required', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
    )
    op.add_column('tasks', sa.Column('custom_fields', postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('tasks', 'custom_fields')
    op.drop_table('custom_fields')
