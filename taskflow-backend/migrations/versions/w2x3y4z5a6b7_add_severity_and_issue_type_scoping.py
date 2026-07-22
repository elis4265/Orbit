"""add severity to tasks, issue_type scoping to project_statuses and transition_rules

Revision ID: w2x3y4z5a6b7
Revises: v1w2x3y4z5a6
Branch labels: None
Depends on: None

"""
from alembic import op
import sqlalchemy as sa

revision = 'w2x3y4z5a6b7'
down_revision = 'v1w2x3y4z5a6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical')")

    op.add_column(
        'tasks',
        sa.Column('severity', sa.Enum('low', 'medium', 'high', 'critical', name='severity_level'), nullable=True),
    )

    op.execute("CREATE TYPE issue_type_scope AS ENUM ('epic', 'story', 'task', 'bug')")

    op.add_column(
        'project_statuses',
        sa.Column('issue_type', sa.Enum('epic', 'story', 'task', 'bug', name='issue_type_scope'), nullable=True),
    )

    op.add_column(
        'project_transition_rules',
        sa.Column('issue_type', sa.Enum('epic', 'story', 'task', 'bug', name='issue_type_scope'), nullable=True),
    )

    # Drop old unique constraint that didn't include issue_type, add new one
    op.drop_constraint('uq_transition_rule', 'project_transition_rules', type_='unique')
    op.create_unique_constraint(
        'uq_transition_rule',
        'project_transition_rules',
        ['project_id', 'from_status_id', 'to_status_id', 'issue_type'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_transition_rule', 'project_transition_rules', type_='unique')
    op.create_unique_constraint(
        'uq_transition_rule',
        'project_transition_rules',
        ['project_id', 'from_status_id', 'to_status_id'],
    )

    op.drop_column('project_transition_rules', 'issue_type')
    op.drop_column('project_statuses', 'issue_type')
    op.drop_column('tasks', 'severity')

    op.execute('DROP TYPE IF EXISTS issue_type_scope')
    op.execute('DROP TYPE IF EXISTS severity_level')
