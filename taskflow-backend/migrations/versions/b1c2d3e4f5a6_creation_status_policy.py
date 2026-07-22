"""Task-creation status policy per project (Jira Create-transition model)

projects.creation_status_policy: 'any' (Linear) | 'initial' (Jira default —
new tasks land on the default unstarted status) | 'curated' (admin picks
which statuses are valid at creation via project_statuses.allow_on_create).

Backfill: existing Enforced projects get 'initial' (their mode's promise was
already "no skipping steps"); everything else stays 'any'. allow_on_create
defaults to true for unstarted-category statuses, false otherwise.

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa


revision = 'b1c2d3e4f5a6'
down_revision = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column('creation_status_policy', sa.String(10), nullable=False, server_default='any'),
    )
    op.execute("UPDATE projects SET creation_status_policy = 'initial' WHERE mode = 'enforced'")

    op.add_column(
        'project_statuses',
        sa.Column('allow_on_create', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.execute("UPDATE project_statuses SET allow_on_create = true WHERE category = 'unstarted'")


def downgrade() -> None:
    op.drop_column('project_statuses', 'allow_on_create')
    op.drop_column('projects', 'creation_status_policy')
