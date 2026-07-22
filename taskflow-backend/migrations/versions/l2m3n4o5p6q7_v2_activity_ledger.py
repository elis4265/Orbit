"""V2 centralized activity ledger — replace task_activity with activities

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-06-14
"""
from alembic import op
import sqlalchemy as sa

revision = "l2m3n4o5p6q7"
down_revision = "k1l2m3n4o5p6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "activities",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=True),
        sa.Column("entity_name", sa.String(100), nullable=True),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("field", sa.String(50), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_activities_ws_created", "activities", ["workspace_id", "created_at"])
    op.create_index("idx_activities_entity", "activities", ["entity_type", "entity_id", "created_at"])
    op.create_index("idx_activities_actor", "activities", ["actor_id", "created_at"])

    # Data migration: existing task_activity rows become entity_type='task' rows
    op.execute(sa.text("""
        INSERT INTO activities
            (entity_type, entity_id, entity_name, workspace_id,
             actor_id, actor_name, action, field, old_value, new_value, meta, created_at)
        SELECT
            'task', task_id, task_title, workspace_id,
            actor_id, actor_name, action, field, old_value, new_value,
            meta::json, created_at
        FROM task_activity
        ORDER BY created_at
    """))

    op.drop_index("idx_task_activity_task_created", table_name="task_activity")
    op.drop_index("idx_task_activity_ws_created", table_name="task_activity")
    op.drop_table("task_activity")


def downgrade() -> None:
    op.create_table(
        "task_activity",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("task_id", sa.UUID(), nullable=True),
        sa.Column("task_title", sa.String(100), nullable=True),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("actor_name", sa.String(100), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("field", sa.String(50), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_task_activity_task_created", "task_activity", ["task_id", "created_at"])
    op.create_index("idx_task_activity_ws_created", "task_activity", ["workspace_id", "created_at"])

    op.execute(sa.text("""
        INSERT INTO task_activity
            (id, task_id, task_title, workspace_id,
             actor_id, actor_name, action, field, old_value, new_value, meta, created_at)
        SELECT
            gen_random_uuid(), entity_id, entity_name, workspace_id,
            actor_id, actor_name, action, field, old_value, new_value,
            meta::json, created_at
        FROM activities
        WHERE entity_type = 'task'
        ORDER BY created_at
    """))

    op.drop_index("idx_activities_actor", table_name="activities")
    op.drop_index("idx_activities_entity", table_name="activities")
    op.drop_index("idx_activities_ws_created", table_name="activities")
    op.drop_table("activities")
