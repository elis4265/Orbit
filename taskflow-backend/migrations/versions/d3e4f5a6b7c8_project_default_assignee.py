"""HW-18: per-project default assignee for newly created tasks

Two columns on `projects`:
  default_assignee_mode  'unassigned' | 'creator' | 'member'  (NOT NULL, default 'unassigned')
  default_assignee_id    users.id, nullable, ON DELETE SET NULL — only read when mode='member'

Existing rows get 'unassigned' via the server_default, so behaviour is unchanged
for every project that predates this migration.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-21
"""
from alembic import op
import sqlalchemy as sa


revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column(
            'default_assignee_mode',
            sa.String(length=20),
            nullable=False,
            server_default='unassigned',
        ),
    )
    op.add_column(
        'projects',
        sa.Column('default_assignee_id', sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        'fk_projects_default_assignee_id_users',
        'projects',
        'users',
        ['default_assignee_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_projects_default_assignee_id_users', 'projects', type_='foreignkey')
    op.drop_column('projects', 'default_assignee_id')
    op.drop_column('projects', 'default_assignee_mode')
