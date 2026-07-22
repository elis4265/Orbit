import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session
from app.core.errors import AppError
from app.models.project import Project
from app.repositories.release import ReleaseRepository
from app.schemas.release import (
    ReleaseCreate,
    ReleaseResponse,
    ReleaseShipRequest,
    ReleaseShipResponse,
    ReleaseUpdate,
)
from app.services.release import is_task_done, release_progress, ship_summary

router = APIRouter(prefix="/projects/{project_id}/releases", tags=["Releases"])


async def _release_or_404(repo: ReleaseRepository, release_id: uuid.UUID, project_id: uuid.UUID):
    release = await repo.get(release_id)
    if not release or release.project_id != project_id:
        raise AppError(404, code="NOT_FOUND", message="Release not found")
    return release


def _with_progress(release, tasks, completed_ids) -> ReleaseResponse:
    resp = ReleaseResponse.model_validate(release)
    prog = release_progress(tasks, completed_ids)
    resp.total_tasks = prog["total_tasks"]
    resp.done_tasks = prog["done_tasks"]
    resp.progress_pct = prog["progress_pct"]
    return resp


@router.get("", response_model=list[ReleaseResponse])
async def list_releases(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = ReleaseRepository(session)
    releases = await repo.list_for_project(project_id)
    grouped = await repo.task_rows_by_release(project_id)
    completed_ids = await repo.completed_status_ids(project_id)
    return [_with_progress(r, grouped.get(r.id, []), completed_ids) for r in releases]


@router.post("", response_model=ReleaseResponse, status_code=201)
async def create_release(
    project_id: uuid.UUID,
    body: ReleaseCreate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    release = await ReleaseRepository(session).create(project_id, body.model_dump())
    return _with_progress(release, [], set())


@router.patch("/{release_id}", response_model=ReleaseResponse)
async def update_release(
    project_id: uuid.UUID,
    release_id: uuid.UUID,
    body: ReleaseUpdate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = ReleaseRepository(session)
    release = await _release_or_404(repo, release_id, project_id)
    release = await repo.update(release, body.model_dump(exclude_none=True))
    tasks = await repo.tasks_for_release(release_id)
    completed_ids = await repo.completed_status_ids(project_id)
    return _with_progress(release, tasks, completed_ids)


@router.delete("/{release_id}", status_code=204)
async def delete_release(
    project_id: uuid.UUID,
    release_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    repo = ReleaseRepository(session)
    release = await _release_or_404(repo, release_id, project_id)
    await repo.delete(release)


@router.post("/{release_id}/ship", response_model=ReleaseShipResponse)
async def ship_release(
    project_id: uuid.UUID,
    release_id: uuid.UUID,
    body: ReleaseShipRequest | None = None,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    """Mark a release as released. Unfinished tasks can be kept, sent to the
    backlog, or moved to another release (the Enforced complete-with-decision
    flow, mirroring Complete Sprint). Default is 'keep'."""
    repo = ReleaseRepository(session)
    release = await _release_or_404(repo, release_id, project_id)
    tasks = await repo.tasks_for_release(release_id)
    completed_ids = await repo.completed_status_ids(project_id)
    summary = ship_summary(tasks, completed_ids)  # captured before disposition

    action = body.unfinished_action if body else "keep"
    incomplete_ids = [t.id for t in tasks if not is_task_done(t, completed_ids)]
    if action == "backlog":
        await repo.reassign_tasks(incomplete_ids, None)
    elif action == "move":
        target_id = body.target_release_id if body else None
        if not target_id or target_id == release_id:
            raise AppError(422, code="INVALID_TARGET", message="Pick a different release to move unfinished tasks to.")
        target = await repo.get(target_id)
        if not target or target.project_id != project_id:
            raise AppError(404, code="NOT_FOUND", message="Target release not found.")
        await repo.reassign_tasks(incomplete_ids, target_id)

    release = await repo.update(release, {"status": "released"})
    return ReleaseShipResponse(
        id=release.id,
        status=release.status,
        total_tasks=summary["total_tasks"],
        done_tasks=summary["done_tasks"],
        incomplete_tasks=summary["incomplete_tasks"],
        clean=summary["clean"],
    )
