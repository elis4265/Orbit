"""My Work: tasks.created_by, backfilled from the activity ledger (REQ-142)

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = 'c0d1e2f3a4b5'
down_revision = 'b9c0d1e2f3a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('created_by', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_created_by', 'tasks', 'users', ['created_by'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_tasks_created_by', 'tasks', ['created_by'])
    # Best-effort backfill from task_created activity events.
    op.execute(
        """
        UPDATE tasks SET created_by = a.actor_id
        FROM activities a
        WHERE a.entity_type = 'task'
          AND a.action = 'task_created'
          AND a.entity_id = tasks.id
          AND a.actor_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index('ix_tasks_created_by', table_name='tasks')
    op.drop_constraint('fk_tasks_created_by', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'created_by')
