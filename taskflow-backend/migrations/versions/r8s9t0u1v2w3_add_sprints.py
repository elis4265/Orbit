"""add sprints table and sprint_id on tasks

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa

revision = "r8s9t0u1v2w3"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS sprints (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            goal TEXT,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'planned',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_sprints_workspace_board
        ON sprints (workspace_id, board_id)
    """)
    op.execute("""
        ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS sprint_id UUID
        REFERENCES sprints(id) ON DELETE SET NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS sprint_id")
    op.execute("DROP TABLE IF EXISTS sprints")
