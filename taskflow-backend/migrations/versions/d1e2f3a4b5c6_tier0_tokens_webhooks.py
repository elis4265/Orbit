"""Tier 0: api_tokens (REQ-143) + outbound_webhooks (REQ-144); new-project hide-done default (REQ-145)

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = 'd1e2f3a4b5c6'
down_revision = 'c0d1e2f3a4b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'api_tokens',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True, index=True),
        sa.Column('prefix', sa.String(20), nullable=False),
        sa.Column('scope', sa.String(10), nullable=False, server_default='read'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        'outbound_webhooks',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('project_id', sa.Uuid(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('url', sa.String(2000), nullable=False),
        sa.Column('secret', sa.String(100), nullable=False),
        sa.Column('events', sa.JSON(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('format', sa.String(10), nullable=False, server_default='json'),
        sa.Column('last_status', sa.Integer(), nullable=True),
        sa.Column('last_delivery_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_table('outbound_webhooks')
    op.drop_table('api_tokens')
