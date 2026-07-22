"""Task templates table

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'e6f7a8b9c0d1'
down_revision = 'd5e6f7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'task_templates',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('project_id', postgresql.UUID(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('issue_type', sa.String(length=30), nullable=True),
        sa.Column('priority_id', postgresql.UUID(), sa.ForeignKey('priority_scheme_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=True),
        sa.Column('tag_ids', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_table('task_templates')
