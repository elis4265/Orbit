"""add issue_type to tasks

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = "q7r8s9t0u1v2"
down_revision = "p6q7r8s9t0u1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE issue_type AS ENUM ('epic', 'story', 'task', 'bug');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
            issue_type issue_type NOT NULL DEFAULT 'task'
    """)


def downgrade() -> None:
    op.drop_column("tasks", "issue_type")
    op.execute("DROP TYPE issue_type")
