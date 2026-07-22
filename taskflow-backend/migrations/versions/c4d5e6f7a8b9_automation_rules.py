"""Automation rules table

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'c4d5e6f7a8b9'
down_revision = 'b3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'automation_rules',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('project_id', postgresql.UUID(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('trigger', sa.String(length=30), nullable=False),
        sa.Column('trigger_config', postgresql.JSONB(), nullable=True),
        sa.Column('conditions', postgresql.JSONB(), nullable=True),
        sa.Column('actions', postgresql.JSONB(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_table('automation_rules')
