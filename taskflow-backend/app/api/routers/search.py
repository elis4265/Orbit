"""Cross-project (global) search — spans every project the user can access."""
import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import get_current_user, get_db_session
from app.models.task import Task
from app.models.user import User
from app.repositories.project import ProjectRepository
from app.schemas.task_link import TaskSearchResult
from app.services.search import search_tasks_multi_project

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("/tasks", response_model=list[TaskSearchResult])
async def search_tasks_cross_project(
    q: str = Query("", min_length=0),
    limit: int = Query(10, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    """Full-text task search across all of the caller's projects (owned + member)."""
    if not q or len(q) < 2:
        return []

    accessible = await ProjectRepository(session).get_accessible(current_user.id)
    project_ids = [p.id for p in accessible]
    if not project_ids:
        return []

    # Ticket-number lookup (KEY-42 or a bare number) across accessible projects.
    ticket = re.match(r'^[A-Za-z]{2,10}-(\d+)$', q.strip())
    plain = re.match(r'^(\d+)$', q.strip())
    seq_number = int(ticket.group(1)) if ticket else (int(plain.group(1)) if plain else None)
    if seq_number is not None:
        result = await session.execute(
            select(Task)
            .where(Task.project_id.in_(project_ids), Task.sequence_number == seq_number)
            .options(selectinload(Task.project))
            .limit(limit)
        )
        rows = list(result.scalars().all())
        if rows:
            return rows

    return list(await search_tasks_multi_project(session, q, project_ids, limit))
