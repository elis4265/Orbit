"""add_username_and_email_verification

Revision ID: b2c3d4e5f6a7
Revises: a3b7c1d2e4f5
Create Date: 2026-06-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a3b7c1d2e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # username: nullable so existing users aren't broken
    op.add_column('users', sa.Column('username', sa.String(50), nullable=True))
    op.create_index('ix_users_username', 'users', ['username'], unique=True)

    # is_verified: server_default true so existing users remain verified
    op.add_column('users', sa.Column(
        'is_verified', sa.Boolean(), nullable=False, server_default='true'
    ))

    op.create_table(
        'email_verifications',
        sa.Column('id', sa.Uuid(), primary_key=True),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('code', sa.String(6), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_email_verifications_user_id', 'email_verifications', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_email_verifications_user_id', table_name='email_verifications')
    op.drop_table('email_verifications')
    op.drop_column('users', 'is_verified')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_column('users', 'username')
