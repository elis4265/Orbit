"""Public, signature-gated inbound VCS webhook receiver.

POST /api/v1/vcs/{provider}/webhook/{connection_id}. No bearer auth — the
provider signature (verified against the connection's webhook_secret) is the
authentication. See docs/git-integration-requirements.md.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session
from app.services.vcs_service import VcsWebhookService

router = APIRouter(prefix="/vcs", tags=["Git Integration"])

_SUPPORTED = {"github", "gitlab", "bitbucket"}


@router.post("/{provider}/webhook/{connection_id}")
async def receive_webhook(
    provider: str,
    connection_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
):
    if provider not in _SUPPORTED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown provider")

    raw_body = await request.body()
    headers = {k.lower(): v for k, v in request.headers.items()}

    result = await VcsWebhookService(session).process(provider, connection_id, raw_body, headers)

    if result["status"] == "not_found":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
    if result["status"] == "invalid_signature":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature")
    return result
