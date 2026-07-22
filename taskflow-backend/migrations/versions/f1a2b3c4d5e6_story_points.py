"""Story Points: project.estimation_method, task.estimate, sprint.committed_points

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'f1a2b3c4d5e6'
down_revision = 'e0f1a2b3c4d5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('estimation_method', sa.String(length=20), nullable=False, server_default='none'))
    op.add_column('tasks', sa.Column('estimate', sa.Integer(), nullable=True))
    op.add_column('sprints', sa.Column('committed_points', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('sprints', 'committed_points')
    op.drop_column('tasks', 'estimate')
    op.drop_column('projects', 'estimation_method')
