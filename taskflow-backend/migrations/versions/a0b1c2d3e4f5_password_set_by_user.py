"""Track whether the user ever chose their password (SSO set-password UX)

Google-SSO signup generates a random password the user never saw — the
change-password form's current-password gate is a dead end for them. This
flag lets the UI offer "Set a password" (email-code flow) instead.

Backfill caveat: pre-existing SSO accounts are indistinguishable from
password accounts, so everyone starts at true; they can still use
forgot-password, which flips the flag correctly.

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-07-12
"""
from alembic import op
import sqlalchemy as sa


revision = 'a0b1c2d3e4f5'
down_revision = 'f9a0b1c2d3e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('password_set_by_user', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_set_by_user')
