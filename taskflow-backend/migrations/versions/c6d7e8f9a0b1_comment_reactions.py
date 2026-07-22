"""Comment reactions (REQ-162)

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-07-10
"""
from alembic import op
import sqlalchemy as sa


revision = 'c6d7e8f9a0b1'
down_revision = 'b5c6d7e8f9a0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'comment_reactions',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('comment_id', sa.Uuid(), sa.ForeignKey('comments.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('emoji', sa.String(16), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.UniqueConstraint('comment_id', 'user_id', 'emoji', name='uq_comment_reaction'),
    )


def downgrade() -> None:
    op.drop_table('comment_reactions')
