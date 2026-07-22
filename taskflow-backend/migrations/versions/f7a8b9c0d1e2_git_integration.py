"""Git integration: vcs_connections, task_dev_links, vcs_events + task ref uniqueness

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'f7a8b9c0d1e2'
down_revision = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'vcs_connections',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('project_id', postgresql.UUID(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('repo_identifier', sa.String(length=255), nullable=False),
        sa.Column('base_url', sa.String(length=255), nullable=True),
        sa.Column('installation_id', sa.String(length=255), nullable=True),
        sa.Column('refresh_token_encrypted', sa.Text(), nullable=True),
        sa.Column('webhook_secret', sa.String(length=255), nullable=False),
        sa.Column('settings', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        'task_dev_links',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('task_id', postgresql.UUID(), sa.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('connection_id', postgresql.UUID(), sa.ForeignKey('vcs_connections.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=False),
        sa.Column('number', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(length=500), nullable=False, server_default=''),
        sa.Column('url', sa.String(length=1000), nullable=False, server_default=''),
        sa.Column('state', sa.String(length=20), nullable=False, server_default='open'),
        sa.Column('author_login', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('task_id', 'kind', 'external_id', name='uq_dev_link_identity'),
    )

    op.create_table(
        'vcs_events',
        sa.Column('id', postgresql.UUID(), primary_key=True),
        sa.Column('connection_id', postgresql.UUID(), sa.ForeignKey('vcs_connections.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('provider', sa.String(length=20), nullable=False),
        sa.Column('delivery_id', sa.String(length=255), nullable=False),
        sa.Column('event_type', sa.String(length=50), nullable=False),
        sa.Column('received_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('processed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('note', sa.Text(), nullable=True),
        sa.UniqueConstraint('connection_id', 'delivery_id', name='uq_vcs_event_delivery'),
    )

    op.create_unique_constraint('uq_task_project_sequence', 'tasks', ['project_id', 'sequence_number'])


def downgrade() -> None:
    op.drop_constraint('uq_task_project_sequence', 'tasks', type_='unique')
    op.drop_table('vcs_events')
    op.drop_table('task_dev_links')
    op.drop_table('vcs_connections')
