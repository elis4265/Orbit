"""add named priorities

Revision ID: z5a6b7c8d9e0
Revises: x3y4z5a6b7c8
Create Date: 2026-06-18 00:00:00.000000

Creates priority_schemes and priority_scheme_items tables.
Adds priority_scheme_id to projects and priority_id (UUID FK) to tasks,
replacing the old integer priority column.

Default scheme "Orbit Default" with 5 levels is seeded inline.
Existing integer priorities (1-5) are migrated to named levels.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 'z5a6b7c8d9e0'
down_revision = 'x3y4z5a6b7c8'
branch_labels = None
depends_on = None

# Fixed UUIDs so the migration is deterministic and repeatable.
_DEFAULT_SCHEME_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
_ITEM_IDS = [
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567891', 'Show-stopper', '#FF0000', 0),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567892', 'Critical',     '#FF6B00', 1),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567893', 'Major',        '#FFC200', 2),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567894', 'Minor',        '#0066CC', 3),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567895', 'Trivial',      '#888888', 4),
]
# Map old int priority (1-5) → item UUID
_INT_TO_ITEM = {
    1: _ITEM_IDS[0][0],
    2: _ITEM_IDS[1][0],
    3: _ITEM_IDS[2][0],
    4: _ITEM_IDS[3][0],
    5: _ITEM_IDS[4][0],
}


def upgrade() -> None:
    # 1. priority_schemes table
    op.create_table(
        'priority_schemes',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('project_id', UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='CASCADE'),
                  nullable=True, index=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )

    # 2. priority_scheme_items table
    op.create_table(
        'priority_scheme_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('scheme_id', UUID(as_uuid=True),
                  sa.ForeignKey('priority_schemes.id', ondelete='CASCADE'),
                  nullable=False, index=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('color', sa.String(7), nullable=False, server_default='#888888'),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )

    # 3. Seed default global scheme
    op.execute(
        f"INSERT INTO priority_schemes (id, name, is_default, created_at, updated_at) "
        f"VALUES ('{_DEFAULT_SCHEME_ID}', 'Orbit Default', true, now(), now())"
    )
    for item_id, name, color, position in _ITEM_IDS:
        op.execute(
            f"INSERT INTO priority_scheme_items (id, scheme_id, name, color, position, created_at, updated_at) "
            f"VALUES ('{item_id}', '{_DEFAULT_SCHEME_ID}', '{name}', '{color}', {position}, now(), now())"
        )

    # 4. Add priority_scheme_id to projects
    op.add_column(
        'projects',
        sa.Column('priority_scheme_id', UUID(as_uuid=True),
                  sa.ForeignKey('priority_schemes.id', ondelete='SET NULL'),
                  nullable=True),
    )
    # Assign default scheme to all existing projects
    op.execute(
        f"UPDATE projects SET priority_scheme_id = '{_DEFAULT_SCHEME_ID}'"
    )

    # 5. Add priority_id to tasks (nullable UUID FK → priority_scheme_items)
    op.add_column(
        'tasks',
        sa.Column('priority_id', UUID(as_uuid=True),
                  sa.ForeignKey('priority_scheme_items.id', ondelete='SET NULL'),
                  nullable=True),
    )
    # Migrate existing int priorities to named items
    for int_val, item_id in _INT_TO_ITEM.items():
        op.execute(
            f"UPDATE tasks SET priority_id = '{item_id}' WHERE priority = {int_val}"
        )

    # 6. Drop old integer priority column
    op.drop_column('tasks', 'priority')


def downgrade() -> None:
    op.add_column(
        'tasks',
        sa.Column('priority', sa.Integer(), nullable=False, server_default='3'),
    )
    # Restore int priorities from named items (best-effort by position)
    for int_val, item_id in _INT_TO_ITEM.items():
        op.execute(
            f"UPDATE tasks SET priority = {int_val} WHERE priority_id = '{item_id}'"
        )
    op.drop_column('tasks', 'priority_id')
    op.drop_column('projects', 'priority_scheme_id')
    op.drop_table('priority_scheme_items')
    op.drop_table('priority_schemes')
