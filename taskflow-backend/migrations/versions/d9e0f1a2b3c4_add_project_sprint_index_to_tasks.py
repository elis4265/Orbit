"""add composite index (project_id, sprint_id) to tasks

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-06-19
"""
from alembic import op

revision = 'd9e0f1a2b3c4'
down_revision = 'c8d9e0f1a2b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('idx_tasks_project_sprint', 'tasks', ['project_id', 'sprint_id'])


def downgrade() -> None:
    op.drop_index('idx_tasks_project_sprint', table_name='tasks')
