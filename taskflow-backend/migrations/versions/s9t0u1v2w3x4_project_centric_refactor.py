"""project-centric refactor: workspace→project, drop tasks.board_id, add capabilities

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Rename tables ─────────────────────────────────────────────────────
    op.rename_table("workspaces", "projects")
    op.rename_table("workspace_members", "project_members")
    op.rename_table("workspace_invites", "project_invites")

    # ── 2. Add new columns to projects ───────────────────────────────────────
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS capabilities JSONB")
    op.execute("ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'open'")

    # ── 3. Rename workspace_id → project_id on all referencing tables ─────────
    op.execute("ALTER TABLE boards RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE sprints RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE project_members RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE project_invites RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE tags RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE notification_preferences RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE notifications RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE activities RENAME COLUMN workspace_id TO project_id")
    op.execute("ALTER TABLE audit_log RENAME COLUMN workspace_id TO project_id")

    # tasks: rename workspace_id → project_id, then drop board_id
    op.execute("ALTER TABLE tasks RENAME COLUMN workspace_id TO project_id")

    # ── 4. Drop board_id from tasks (drops index + FK automatically) ──────────
    op.execute("DROP INDEX IF EXISTS idx_tasks_board_status_position")
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS board_id")

    # ── 5. New index on tasks for project-scoped queries ─────────────────────
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_tasks_project_status_position
        ON tasks (project_id, status, position)
    """)

    # ── 6. Add columns to boards ──────────────────────────────────────────────
    op.execute("ALTER TABLE boards ADD COLUMN IF NOT EXISTS filter_config JSONB")
    op.execute("ALTER TABLE boards ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT true")

    # ── 7. Rename stale indexes ───────────────────────────────────────────────
    op.execute("ALTER INDEX IF EXISTS idx_activities_ws_created RENAME TO idx_activities_proj_created")
    op.execute("ALTER INDEX IF EXISTS idx_audit_log_ws_created RENAME TO idx_audit_log_proj_created")
    op.execute("ALTER INDEX IF EXISTS idx_sprints_workspace_board RENAME TO idx_sprints_project_board")
    op.execute("ALTER INDEX IF EXISTS idx_tags_workspace_id RENAME TO idx_tags_project_id")

    # Rename unique constraint on tags (cosmetic)
    op.execute("""
        ALTER TABLE tags
        RENAME CONSTRAINT uq_tag_workspace_name TO uq_tag_project_name
    """)


def downgrade() -> None:
    # Reverse unique constraint rename on tags
    op.execute("""
        ALTER TABLE tags
        RENAME CONSTRAINT uq_tag_project_name TO uq_tag_workspace_name
    """)

    # Reverse index renames
    op.execute("ALTER INDEX IF EXISTS idx_tags_project_id RENAME TO idx_tags_workspace_id")
    op.execute("ALTER INDEX IF EXISTS idx_sprints_project_board RENAME TO idx_sprints_workspace_board")
    op.execute("ALTER INDEX IF EXISTS idx_audit_log_proj_created RENAME TO idx_audit_log_ws_created")
    op.execute("ALTER INDEX IF EXISTS idx_activities_proj_created RENAME TO idx_activities_ws_created")

    # Remove boards columns
    op.execute("ALTER TABLE boards DROP COLUMN IF EXISTS is_default")
    op.execute("ALTER TABLE boards DROP COLUMN IF EXISTS filter_config")

    # Restore tasks.board_id (data is lost — downgrade is destructive)
    op.execute("DROP INDEX IF EXISTS idx_tasks_project_status_position")
    op.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS board_id UUID")
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_tasks_board_status_position
        ON tasks (board_id, status, position)
    """)

    # Rename project_id → workspace_id
    op.execute("ALTER TABLE tasks RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE audit_log RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE activities RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE notifications RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE notification_preferences RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE tags RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE project_invites RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE project_members RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE sprints RENAME COLUMN project_id TO workspace_id")
    op.execute("ALTER TABLE boards RENAME COLUMN project_id TO workspace_id")

    # Remove projects columns
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS mode")
    op.execute("ALTER TABLE projects DROP COLUMN IF EXISTS capabilities")

    # Rename tables back
    op.rename_table("project_invites", "workspace_invites")
    op.rename_table("project_members", "workspace_members")
    op.rename_table("projects", "workspaces")
