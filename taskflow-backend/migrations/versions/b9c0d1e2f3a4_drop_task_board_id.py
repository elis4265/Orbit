"""Drop dead tasks.board_id — tasks are project-scoped; boards are admin-filtered views (DD-043)

The column was added in a3b7c1d2e4f5 but never mapped in the ORM, never written,
and never filtered on. Boards scope sprints and carry a filter_config; they do
not own tasks.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = 'b9c0d1e2f3a4'
down_revision = 'a8b9c0d1e2f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Defensive: dev DBs have drifted (a later migration already replaced the index
    # when renaming workspace→project). IF EXISTS makes this land from any state.
    op.execute("DROP INDEX IF EXISTS idx_tasks_board_status_position")
    op.execute("ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_board_id")
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS board_id")


def downgrade() -> None:
    op.add_column('tasks', sa.Column('board_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_board_id', 'tasks', 'boards', ['board_id'], ['id'], ondelete='CASCADE'
    )
    op.create_index('idx_tasks_board_status_position', 'tasks', ['board_id', 'status', 'position'])
