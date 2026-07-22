"""add project statuses and transition rules

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-06-17 00:00:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision: str = "t0u1v2w3x4y5"
down_revision: Union[str, None] = "s9t0u1v2w3x4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DEFAULT_STATUSES = [
    {"name": "To Do",       "color": "#6b7280", "category": "unstarted",  "position": 0, "is_default": True},
    {"name": "In Progress", "color": "#7c6af7", "category": "started",    "position": 1, "is_default": False},
    {"name": "Done",        "color": "#22c55e", "category": "completed",  "position": 2, "is_default": False},
]


def upgrade() -> None:
    op.create_table(
        "project_statuses",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("color", sa.String(7), nullable=False, server_default="#6b7280"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "name", name="uq_project_status_name"),
    )
    op.create_index("ix_project_statuses_project_id", "project_statuses", ["project_id"])

    op.create_table(
        "project_transition_rules",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column("project_id", pg.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status_id", pg.UUID(as_uuid=True), sa.ForeignKey("project_statuses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_status_id", pg.UUID(as_uuid=True), sa.ForeignKey("project_statuses.id", ondelete="CASCADE"), nullable=False),
        sa.Column("require_role", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.UniqueConstraint("project_id", "from_status_id", "to_status_id", name="uq_transition_rule"),
    )
    op.create_index("ix_project_transition_rules_project_id", "project_transition_rules", ["project_id"])

    # Seed default Open-mode statuses for all existing projects
    conn = op.get_bind()
    projects = conn.execute(sa.text("SELECT id FROM projects")).fetchall()
    for (project_id,) in projects:
        for s in _DEFAULT_STATUSES:
            conn.execute(
                sa.text(
                    "INSERT INTO project_statuses (id, project_id, name, color, position, category, is_default, is_active) "
                    "VALUES (:id, :project_id, :name, :color, :position, :category, :is_default, true)"
                ),
                {
                    "id": uuid.uuid4(),
                    "project_id": project_id,
                    "name": s["name"],
                    "color": s["color"],
                    "position": s["position"],
                    "category": s["category"],
                    "is_default": s["is_default"],
                },
            )


def downgrade() -> None:
    op.drop_table("project_transition_rules")
    op.drop_index("ix_project_statuses_project_id", table_name="project_statuses")
    op.drop_table("project_statuses")
