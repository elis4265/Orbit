"""Flow-mode automated cycles: nullable sprint board_id, auto_managed flag, cycle_configs

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa


revision = 'e0f1a2b3c4d5'
down_revision = 'd9e0f1a2b3c4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Flow auto-cycles are project-scoped → board_id becomes nullable.
    op.alter_column('sprints', 'board_id', existing_type=sa.dialects.postgresql.UUID(), nullable=True)
    op.add_column('sprints', sa.Column('auto_managed', sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        'cycle_configs',
        sa.Column('project_id', sa.dialects.postgresql.UUID(), sa.ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('duration_weeks', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('cooldown_days', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('start_anchor', sa.Date(), nullable=False),
        sa.Column('upcoming_count', sa.Integer(), nullable=False, server_default='2'),
    )


def downgrade() -> None:
    op.drop_table('cycle_configs')
    op.drop_column('sprints', 'auto_managed')
    op.alter_column('sprints', 'board_id', existing_type=sa.dialects.postgresql.UUID(), nullable=False)
