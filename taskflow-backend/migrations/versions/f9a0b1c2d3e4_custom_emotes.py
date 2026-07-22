"""Custom reaction emotes (REQ-162 extension)

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa


revision = 'f9a0b1c2d3e4'
down_revision = 'e8f9a0b1c2d3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'custom_emotes',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('project_id', sa.Uuid(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('name', sa.String(32), nullable=False),
        sa.Column('image_key', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(64), nullable=False),
        sa.Column('created_by', sa.Uuid(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('project_id', 'name', name='uq_custom_emote_project_name'),
    )
    # Custom reactions are stored as ':name:' (name ≤ 32) — the old 16-char cap only fit unicode emoji.
    op.alter_column('comment_reactions', 'emoji', type_=sa.String(64), existing_type=sa.String(16))


def downgrade() -> None:
    op.alter_column('comment_reactions', 'emoji', type_=sa.String(16), existing_type=sa.String(64))
    op.drop_table('custom_emotes')
