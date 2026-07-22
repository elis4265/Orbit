"""Postgres full-text search replaces Elasticsearch (4 GB prod box — ES doesn't fit)

tasks.search_vector: STORED generated tsvector over title + description,
kept in sync by Postgres itself — no application-side index writes, no drift.
GIN index on search_vector serves websearch_to_tsquery matches; a second GIN
index (gin_trgm_ops) on title serves trigram similarity() for typo tolerance.

pg_trgm is created here but deliberately left in place on downgrade — other
objects may come to depend on it and CREATE EXTENSION IF NOT EXISTS is
idempotent anyway.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = 'c2d3e4f5a6b7'
down_revision = 'b1c2d3e4f5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.add_column(
        'tasks',
        sa.Column(
            'search_vector',
            postgresql.TSVECTOR(),
            sa.Computed(
                "to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))",
                persisted=True,
            ),
            nullable=True,
        ),
    )
    op.create_index(
        'ix_tasks_search_vector', 'tasks', ['search_vector'],
        postgresql_using='gin',
    )
    op.create_index(
        'ix_tasks_title_trgm', 'tasks', ['title'],
        postgresql_using='gin',
        postgresql_ops={'title': 'gin_trgm_ops'},
    )


def downgrade() -> None:
    op.drop_index('ix_tasks_title_trgm', table_name='tasks')
    op.drop_index('ix_tasks_search_vector', table_name='tasks')
    op.drop_column('tasks', 'search_vector')
    # pg_trgm extension intentionally left installed.
