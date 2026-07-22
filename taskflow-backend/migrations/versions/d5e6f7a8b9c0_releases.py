"""Releases table + tasks.release_id

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'd5e6f7a8b9c0'
down_revision = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'releases',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('project_id', postgresql.UUID(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='planned'),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('release_date', sa.Date(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column('tasks', sa.Column('release_id', postgresql.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_release_id', 'tasks', 'releases', ['release_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_tasks_release_id', 'tasks', ['release_id'])


def downgrade() -> None:
    op.drop_index('ix_tasks_release_id', table_name='tasks')
    op.drop_constraint('fk_tasks_release_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'release_id')
    op.drop_table('releases')
