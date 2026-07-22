"""Task full-text search — PostgreSQL FTS + pg_trgm (Elasticsearch removed).

Match semantics: websearch_to_tsquery('english', q) against the STORED
generated column tasks.search_vector (title + description, English stemming),
OR trigram similarity(title, q) above SIMILARITY_THRESHOLD for typo tolerance.
Ranked by ts_rank desc, then similarity desc. Archived tasks are always
excluded (REQ-161).

Runs on the request's AsyncSession — no external service, no index sync.
Endpoint-level concerns (min-2-chars rule, ticket-number lookup, scoping to
one project vs all accessible projects) stay in the routers, unchanged.
"""
import uuid
from typing import Sequence

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.task import Task

# 0.3 mirrors pg_trgm's default similarity_threshold.
SIMILARITY_THRESHOLD = 0.3


def build_task_search_stmt(query: str, project_ids: list[uuid.UUID], limit: int) -> Select:
    """Pure statement builder — unit-testable without a database."""
    ts_query = func.websearch_to_tsquery("english", query)
    title_similarity = func.similarity(Task.title, query)
    return (
        select(Task)
        .where(
            Task.project_id.in_(project_ids),
            Task.archived_at.is_(None),  # REQ-161: archived tasks are out of search
            or_(
                Task.search_vector.bool_op("@@")(ts_query),
                title_similarity > SIMILARITY_THRESHOLD,
            ),
        )
        .options(selectinload(Task.project))  # TaskSearchResult.project_key
        .order_by(
            func.ts_rank(Task.search_vector, ts_query).desc(),
            title_similarity.desc(),
        )
        .limit(limit)
    )


async def search_tasks(
    session: AsyncSession,
    query: str,
    project_id: uuid.UUID,
    limit: int = 20,
) -> Sequence[Task]:
    """Full-text search within a single project."""
    return await search_tasks_multi_project(session, query, [project_id], limit)


async def search_tasks_multi_project(
    session: AsyncSession,
    query: str,
    project_ids: list[uuid.UUID],
    limit: int = 20,
) -> Sequence[Task]:
    """Like search_tasks but scoped to a SET of projects (cross-project search)."""
    if not project_ids:
        return []
    result = await session.execute(build_task_search_stmt(query, project_ids, limit))
    return result.scalars().all()
