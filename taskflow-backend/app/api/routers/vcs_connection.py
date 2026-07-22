"""Admin-managed VCS connection CRUD + task dev-links read.

A connection generates a webhook_secret returned ONCE on create so the admin can
paste the webhook URL + secret into the provider. No OAuth/token needed for the
inbound feature — the connection only carries the secret. See
docs/git-integration-requirements.md.
"""
import secrets
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_viewer_project, get_db_session, get_current_user
from app.core import crypto
from app.core.config import settings
from app.core.errors import AppError
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.models.vcs import TaskDevLink, VcsConnection
from app.schemas.vcs import (
    DevicePollRequest,
    TaskDevLinkResponse,
    VcsConnectionCreate,
    VcsConnectionCreated,
    VcsConnectionResponse,
    VcsConnectionUpdate,
)
from app.services.vcs import oauth

router = APIRouter(prefix="/projects/{project_id}/vcs-connections", tags=["Git Integration"])
dev_links_router = APIRouter(
    prefix="/projects/{project_id}/tasks/{task_id}/dev-links", tags=["Git Integration"]
)
integrations_router = APIRouter(prefix="/integrations", tags=["Git Integration"])

SUPPORTED = {"github", "gitlab", "bitbucket"}


def _webhook_url(conn: VcsConnection) -> str:
    return f"{settings.base_url}/api/v1/vcs/{conn.provider}/webhook/{conn.id}"


def _response(conn: VcsConnection) -> VcsConnectionResponse:
    resp = VcsConnectionResponse.model_validate(conn)
    resp.webhook_url = _webhook_url(conn)
    resp.connected = bool(conn.refresh_token_encrypted)
    return resp


@integrations_router.get("/providers")
async def list_providers(_user: User = Depends(get_current_user)):
    """Which providers can be connected on this instance (for the UI)."""
    return {
        "encryption_configured": crypto.is_configured(),
        "providers": {
            "github": {"auth": "device", "device_flow": oauth.supports_device_flow("github")},
            "gitlab": {"auth": "device", "device_flow": oauth.supports_device_flow("gitlab")},
            "bitbucket": {"auth": "token", "device_flow": False},
        },
    }


@router.get("", response_model=list[VcsConnectionResponse])
async def list_connections(
    project_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    rows = (await session.execute(
        select(VcsConnection).where(VcsConnection.project_id == project_id)
    )).scalars().all()
    return [_response(c) for c in rows]


@router.post("", response_model=VcsConnectionCreated, status_code=201)
async def create_connection(
    project_id: uuid.UUID,
    body: VcsConnectionCreate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    if body.provider not in SUPPORTED:
        raise AppError(422, code="UNSUPPORTED_PROVIDER", message=f"Unknown provider '{body.provider}'")
    conn = VcsConnection(
        project_id=project_id,
        provider=body.provider,
        repo_identifier=body.repo_identifier,
        base_url=body.base_url,
        settings=body.settings,
        webhook_secret=secrets.token_urlsafe(32),
    )
    # Bitbucket has no device flow → store the supplied access token (encrypted).
    if body.provider == "bitbucket" and body.token:
        conn.refresh_token_encrypted = crypto.encrypt(body.token)
    session.add(conn)
    await session.commit()
    await session.refresh(conn)
    resp = VcsConnectionCreated.model_validate(conn)
    resp.webhook_url = _webhook_url(conn)
    resp.webhook_secret = conn.webhook_secret
    resp.connected = bool(conn.refresh_token_encrypted)
    return resp


@router.post("/{connection_id}/device/start")
async def device_start(
    project_id: uuid.UUID,
    connection_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    """Begin Device Flow (GitHub/GitLab). Returns the code + URL to show the admin;
    the device_code is echoed back for the client to poll with."""
    conn = await _conn_or_404(session, connection_id, project_id)
    if not crypto.is_configured():
        raise AppError(503, code="ENCRYPTION_NOT_CONFIGURED",
                       message="Set ENCRYPTION_KEY to connect via OAuth.")
    return await oauth.start_device_flow(conn.provider)


@router.post("/{connection_id}/device/poll")
async def device_poll(
    project_id: uuid.UUID,
    connection_id: uuid.UUID,
    body: DevicePollRequest,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    """Poll once. On success stores the encrypted token and marks the connection connected."""
    conn = await _conn_or_404(session, connection_id, project_id)
    result = await oauth.poll_device_flow(conn.provider, body.device_code)
    if result["status"] != "ok":
        return {"status": "pending", "error": result.get("error")}
    conn.refresh_token_encrypted = crypto.encrypt(result["access_token"])
    await session.commit()
    return {"status": "connected"}


@router.patch("/{connection_id}", response_model=VcsConnectionResponse)
async def update_connection(
    project_id: uuid.UUID,
    connection_id: uuid.UUID,
    body: VcsConnectionUpdate,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    conn = await _conn_or_404(session, connection_id, project_id)
    if body.settings is not None:
        conn.settings = body.settings
    await session.commit()
    await session.refresh(conn)
    return _response(conn)


@router.delete("/{connection_id}", status_code=204)
async def delete_connection(
    project_id: uuid.UUID,
    connection_id: uuid.UUID,
    _project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    conn = await _conn_or_404(session, connection_id, project_id)
    await session.delete(conn)
    await session.commit()


@dev_links_router.get("", response_model=list[TaskDevLinkResponse])
async def list_dev_links(
    project_id: uuid.UUID,
    task_id: uuid.UUID,
    _project: Project = Depends(get_viewer_project),
    session: AsyncSession = Depends(get_db_session),
):
    task = await session.get(Task, task_id)
    if task is None or task.project_id != project_id:
        raise AppError(404, code="NOT_FOUND", message="Task not found")
    rows = (await session.execute(
        select(TaskDevLink, VcsConnection.provider, VcsConnection.repo_identifier)
        .join(VcsConnection, TaskDevLink.connection_id == VcsConnection.id)
        .where(TaskDevLink.task_id == task_id)
        .order_by(VcsConnection.repo_identifier, TaskDevLink.created_at)
    )).all()
    out = []
    for dl, provider, repo in rows:
        resp = TaskDevLinkResponse.model_validate(dl)
        resp.provider = provider
        resp.repo_identifier = repo
        out.append(resp)
    return out


async def _conn_or_404(session, connection_id, project_id) -> VcsConnection:
    conn = await session.get(VcsConnection, connection_id)
    if conn is None or conn.project_id != project_id:
        raise AppError(404, code="NOT_FOUND", message="Connection not found")
    return conn
