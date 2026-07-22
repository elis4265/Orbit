"""add custom_status_id to tasks

Revision ID: u1v2w3x4y5z0
Revises: t0u1v2w3x4y5
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'u1v2w3x4y5z0'
down_revision = 't0u1v2w3x4y5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column(
        'custom_status_id',
        sa.UUID(as_uuid=True),
        sa.ForeignKey('project_statuses.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('ix_tasks_custom_status_id', 'tasks', ['custom_status_id'])

    # Backfill: map each task's status enum → matching project_status by category
    op.execute("""
        UPDATE tasks t
        SET custom_status_id = (
            SELECT ps.id
            FROM project_statuses ps
            WHERE ps.project_id = t.project_id
              AND ps.category = CASE t.status::text
                  WHEN 'todo'        THEN 'unstarted'
                  WHEN 'in_progress' THEN 'started'
                  WHEN 'done'        THEN 'completed'
                  ELSE 'unstarted'
              END
            ORDER BY ps.position
            LIMIT 1
        )
        WHERE t.custom_status_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_tasks_custom_status_id', table_name='tasks')
    op.drop_column('tasks', 'custom_status_id')
