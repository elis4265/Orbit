"""add project key and task sequence number

Revision ID: v1w2x3y4z5a6
Revises: u1v2w3x4y5z0
Create Date: 2026-06-17

"""
from alembic import op
import sqlalchemy as sa

revision = 'v1w2x3y4z5a6'
down_revision = 'u1v2w3x4y5z0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add key to projects (nullable first for backfill)
    op.add_column('projects', sa.Column('key', sa.String(6), nullable=True))
    op.add_column('projects', sa.Column('next_sequence', sa.Integer(), nullable=False, server_default='1'))

    # 2. Add sequence_number to tasks (nullable first for backfill)
    op.add_column('tasks', sa.Column('sequence_number', sa.Integer(), nullable=True))

    # 3. Backfill project keys: first letter of each space-separated word (alpha words only),
    #    capped at 6 chars; single-word names use first 4 alpha chars. Uppercase.
    op.execute("""
        UPDATE projects
        SET key = UPPER(
            CASE
                WHEN (
                    SELECT COUNT(*)
                    FROM regexp_split_to_table(
                        regexp_replace(name, '[^a-zA-Z ]', '', 'g'), '\\s+'
                    ) AS w
                    WHERE w <> '' AND w ~ '^[a-zA-Z]'
                ) > 1
                THEN LEFT(
                    (
                        SELECT string_agg(LEFT(w, 1), '' ORDER BY ord)
                        FROM (
                            SELECT w, row_number() OVER () AS ord
                            FROM regexp_split_to_table(
                                regexp_replace(name, '[^a-zA-Z ]', '', 'g'), '\\s+'
                            ) AS w
                            WHERE w <> '' AND w ~ '^[a-zA-Z]'
                        ) words
                    ), 6
                )
                ELSE LEFT(regexp_replace(name, '[^a-zA-Z]', '', 'g'), 4)
            END
        )
    """)

    # 4. Handle key uniqueness: append numeric suffix for collisions
    op.execute("""
        WITH duplicates AS (
            SELECT id, key,
                   ROW_NUMBER() OVER (PARTITION BY key ORDER BY created_at) AS rn
            FROM projects
        )
        UPDATE projects p
        SET key = LEFT(d.key, 5) || d.rn::text
        FROM duplicates d
        WHERE p.id = d.id AND d.rn > 1
    """)

    # 5. Backfill task sequence_numbers per project (ordered by created_at)
    op.execute("""
        UPDATE tasks t
        SET sequence_number = sub.rn
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) AS rn
            FROM tasks
        ) sub
        WHERE t.id = sub.id
    """)

    # 6. Set next_sequence = max(sequence_number) + 1 per project
    op.execute("""
        UPDATE projects p
        SET next_sequence = COALESCE(
            (SELECT MAX(t.sequence_number) + 1 FROM tasks t WHERE t.project_id = p.id),
            1
        )
    """)

    # 7. Enforce NOT NULL now that backfill is done
    op.alter_column('projects', 'key', nullable=False)
    op.alter_column('tasks', 'sequence_number', nullable=False)

    op.create_index('ix_projects_key', 'projects', ['key'])


def downgrade() -> None:
    op.drop_index('ix_projects_key', table_name='projects')
    op.drop_column('projects', 'key')
    op.drop_column('projects', 'next_sequence')
    op.drop_column('tasks', 'sequence_number')
