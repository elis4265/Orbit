"""add task_links table

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None


def upgrade():
    # DO block: safe if type already exists (e.g. from a previous partial run)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE link_type AS ENUM ('blocks', 'depends_on', 'duplicates', 'relates_to');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    # Raw SQL so we never hit SQLAlchemy's _on_table_create which ignores create_type=False
    # on the asyncpg dialect and tries to CREATE TYPE a second time.
    op.execute("""
        CREATE TABLE IF NOT EXISTS task_links (
            id          UUID        NOT NULL,
            source_id   UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            target_id   UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            link_type   link_type   NOT NULL,
            created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
            created_at  TIMESTAMPTZ NOT NULL,
            CONSTRAINT pk_task_links PRIMARY KEY (id),
            CONSTRAINT uq_task_links_pair_type UNIQUE (source_id, target_id, link_type)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_links_source_id ON task_links (source_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_links_target_id ON task_links (target_id)")


def downgrade():
    op.drop_index('ix_task_links_target_id', 'task_links')
    op.drop_index('ix_task_links_source_id', 'task_links')
    op.drop_table('task_links')
    op.execute("DROP TYPE link_type")
