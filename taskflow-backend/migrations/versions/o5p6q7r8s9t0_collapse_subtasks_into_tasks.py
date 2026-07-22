"""collapse subtasks into tasks via parent_id

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('tasks', sa.Column('parent_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_parent_id', 'tasks', 'tasks',
        ['parent_id'], ['id'], ondelete='CASCADE'
    )
    op.create_index('ix_tasks_parent_id', 'tasks', ['parent_id'])

    op.execute("""
        INSERT INTO tasks (
            id, workspace_id, board_id, parent_id, title, status,
            priority, position, version, created_at, updated_at
        )
        SELECT
            s.id, t.workspace_id, t.board_id, s.task_id, s.title,
            CASE WHEN s.is_completed THEN 'done' ELSE 'todo' END::task_status,
            3, 0, 1, s.created_at, s.created_at
        FROM sub_tasks s
        JOIN tasks t ON t.id = s.task_id
    """)

    op.drop_table('sub_tasks')


def downgrade():
    op.create_table(
        'sub_tasks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('task_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('is_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.execute("""
        INSERT INTO sub_tasks (id, task_id, title, is_completed, created_at)
        SELECT id, parent_id, title, (status = 'done'), created_at
        FROM tasks
        WHERE parent_id IS NOT NULL
    """)
    op.execute("DELETE FROM tasks WHERE parent_id IS NOT NULL")
    op.drop_index('ix_tasks_parent_id', 'tasks')
    op.drop_constraint('fk_tasks_parent_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'parent_id')
