"""Outbound webhooks CRUD (REQ-144). Admin-gated; secret shown once (DD-046)."""
import secrets
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_admin_project, get_db_session
from app.core.errors import AppError
from app.models.outbound_webhook import OutboundWebhook
from app.models.project import Project
from app.schemas.webhook import WebhookCreate, WebhookCreated, WebhookResponse, WebhookUpdate

router = APIRouter(prefix="/projects/{project_id}/webhooks", tags=["Webhooks"])

_MAX_WEBHOOKS_PER_PROJECT = 10


async def _get_owned(session: AsyncSession, project_id: uuid.UUID, webhook_id: uuid.UUID) -> OutboundWebhook:
    result = await session.execute(
        select(OutboundWebhook).where(
            OutboundWebhook.id == webhook_id, OutboundWebhook.project_id == project_id
        )
    )
    row = result.scalars().first()
    if row is None:
        raise AppError(404, "NOT_FOUND", "Webhook not found.")
    return row


@router.post("", response_model=WebhookCreated, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    payload: WebhookCreate,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    count = len((await session.execute(
        select(OutboundWebhook.id).where(OutboundWebhook.project_id == project.id)
    )).all())
    if count >= _MAX_WEBHOOKS_PER_PROJECT:
        raise AppError(400, "WEBHOOK_LIMIT", f"Maximum {_MAX_WEBHOOKS_PER_PROJECT} webhooks per project.")

    row = OutboundWebhook(
        project_id=project.id,
        url=payload.url,
        secret=secrets.token_urlsafe(32),
        events=list(payload.events),
        format=payload.format,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return WebhookCreated(secret=row.secret, **WebhookResponse.model_validate(row).model_dump())


@router.get("", response_model=list[WebhookResponse])
async def list_webhooks(
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    result = await session.execute(
        select(OutboundWebhook).where(OutboundWebhook.project_id == project.id).order_by(OutboundWebhook.created_at)
    )
    return result.scalars().all()


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: uuid.UUID,
    payload: WebhookUpdate,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    row = await _get_owned(session, project.id, webhook_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(row, field, value)
    await session.commit()
    await session.refresh(row)
    return row


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    webhook_id: uuid.UUID,
    project: Project = Depends(get_admin_project),
    session: AsyncSession = Depends(get_db_session),
):
    row = await _get_owned(session, project.id, webhook_id)
    await session.delete(row)
    await session.commit()
