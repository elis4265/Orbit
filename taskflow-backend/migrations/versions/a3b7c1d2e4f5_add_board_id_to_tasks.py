"""add_board_id_to_tasks

Revision ID: a3b7c1d2e4f5
Revises: 65f82ff953ba
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3b7c1d2e4f5'
down_revision: Union[str, Sequence[str], None] = '65f82ff953ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column('board_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_board_id', 'tasks', 'boards', ['board_id'], ['id'], ondelete='CASCADE'
    )
    op.drop_index('idx_tasks_workspace_status_position', table_name='tasks')
    op.create_index('idx_tasks_board_status_position', 'tasks', ['board_id', 'status', 'position'])


def downgrade() -> None:
    op.drop_index('idx_tasks_board_status_position', table_name='tasks')
    op.create_index('idx_tasks_workspace_status_position', 'tasks', ['workspace_id', 'status', 'position'])
    op.drop_constraint('fk_tasks_board_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'board_id')
