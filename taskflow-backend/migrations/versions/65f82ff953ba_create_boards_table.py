"""create_boards_table

Revision ID: 65f82ff953ba
Revises: c4ef942655f5
Create Date: 2026-06-10 21:02:33.303770

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '65f82ff953ba'
down_revision: Union[str, Sequence[str], None] = 'c4ef942655f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'boards',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('workspace_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_boards_workspace_id'), 'boards', ['workspace_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_boards_workspace_id'), table_name='boards')
    op.drop_table('boards')
