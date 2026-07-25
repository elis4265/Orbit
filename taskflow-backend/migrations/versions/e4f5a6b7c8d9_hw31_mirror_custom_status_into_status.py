"""HW-31: backfill tasks.status from the custom status's category

In guided/enforced projects the real status is custom_status_id; the fixed `status`
enum was left frozen at the task's creation value, so the scheduler (overdue reminders),
the blocker gate, stats and the ?status= filter all read a stale value. The write paths
are fixed to mirror going forward; this corrects existing rows.

Scoped to custom_status_id IS NOT NULL — Flow-mode tasks (custom_status_id NULL) keep
their real `status` untouched. Only rows whose status actually differs are updated.
completed_at is left alone (already category-consistent). Bare enum literals let Postgres
cast to the status enum type regardless of its name.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-25
"""
from alembic import op


revision = 'e4f5a6b7c8d9'
down_revision = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # completed + cancelled categories → done
    op.execute("""
        UPDATE tasks t SET status = 'done'
        FROM project_statuses ps
        WHERE t.custom_status_id = ps.id
          AND ps.category IN ('completed', 'cancelled')
          AND t.status <> 'done'
    """)
    # started → in_progress
    op.execute("""
        UPDATE tasks t SET status = 'in_progress'
        FROM project_statuses ps
        WHERE t.custom_status_id = ps.id
          AND ps.category = 'started'
          AND t.status <> 'in_progress'
    """)
    # unstarted → todo
    op.execute("""
        UPDATE tasks t SET status = 'todo'
        FROM project_statuses ps
        WHERE t.custom_status_id = ps.id
          AND ps.category = 'unstarted'
          AND t.status <> 'todo'
    """)


def downgrade() -> None:
    # No-op: the pre-migration `status` values were stale/incorrect and are not
    # recoverable (nor desirable). The mirrored value is the correct state.
    pass
