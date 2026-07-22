"""Outbound webhook dispatch (REQ-144).

Fire-and-forget: `dispatch()` schedules delivery on the event loop and returns
immediately — a dead receiver can never fail or delay the originating request.
Payloads are HMAC-SHA256-signed with the per-webhook secret (mirror of the
inbound VCS verification in services/vcs/signatures.py).
"""
import asyncio
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger

logger = get_logger("webhooks")

_TIMEOUT_S = 5.0
_RETRY_DELAYS_S = (1, 5)  # after the first attempt → 3 attempts total


def sign_payload(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ── REQ-153: SSRF egress guard ────────────────────────────────────────────────
# Deliveries refuse hosts resolving to private/loopback/link-local space so an
# admin-supplied URL can't probe the operator's internal network. Self-hosters
# with LAN receivers (e.g. internal Mattermost) opt out via
# WEBHOOK_ALLOW_PRIVATE_IPS=true — secure default, user choice.

def _is_forbidden_ip(ip: str) -> bool:
    import ipaddress

    addr = ipaddress.ip_address(ip)
    return (
        addr.is_private or addr.is_loopback or addr.is_link_local
        or addr.is_multicast or addr.is_reserved or addr.is_unspecified
    )


async def _resolve_host(host: str) -> list[str]:
    import asyncio as _asyncio
    import socket

    loop = _asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


async def url_is_deliverable(url: str) -> bool:
    """False when the URL's host resolves (only) to forbidden address space or not at all."""
    from urllib.parse import urlparse

    from app.core.config import settings

    if settings.webhook_allow_private_ips:
        return True
    host = urlparse(url).hostname
    if not host:
        return False
    try:
        ips = await _resolve_host(host)
    except OSError:
        return False
    return bool(ips) and not any(_is_forbidden_ip(ip) for ip in ips)


# REQ-146: human-readable one-liners for chat formats. Pure — unit-tested per event.
_MESSAGE_TEMPLATES = {
    "task.created": ("🆕", "created"),
    "task.updated": ("✏️", "updated"),
    "task.completed": ("✅", "completed"),
}


def format_message(event: str, data: dict) -> str:
    if event in _MESSAGE_TEMPLATES:
        icon, verb = _MESSAGE_TEMPLATES[event]
        return f'{icon} {data.get("project_key", "?")}-{data.get("sequence_number", "?")} "{data.get("title", "")}" {verb}'
    if event == "task.deleted":
        return f'🗑️ "{data.get("title", data.get("task_id", ""))}" deleted'
    if event == "comment.created":
        return f'💬 New comment on task {data.get("task_id", "")}'
    if event == "sprint.closed":
        return f'🏁 Sprint "{data.get("name", "")}" closed'
    return event


async def _deliver(webhook_id: uuid.UUID, url: str, secret: str, event: str, body: bytes, fmt: str = "json") -> None:
    from app.database import async_session_local
    from app.models.outbound_webhook import OutboundWebhook

    if not await url_is_deliverable(url):
        # `event` kwarg would collide with structlog's positional event arg
        logger.warning("webhook_blocked_forbidden_host", url=url, event_type=event)
        return

    headers = {
        "Content-Type": "application/json",
        "X-Orbit-Event": event,
        "X-Orbit-Delivery": str(uuid.uuid4()),
    }
    if fmt == "json":
        headers["X-Orbit-Signature"] = sign_payload(secret, body)
    else:
        # Slack/Discord incoming webhooks: the URL is the credential; they expect
        # their own JSON shape, not our signed envelope (REQ-146).
        data = json.loads(body).get("data", {})
        message = format_message(event, data)
        key = "text" if fmt == "slack" else "content"
        body = json.dumps({key: message}).encode()
    status_code: int | None = None
    for attempt, delay in enumerate((0, *_RETRY_DELAYS_S)):
        if delay:
            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, content=body, headers=headers, timeout=_TIMEOUT_S)
            status_code = resp.status_code
            if resp.status_code < 500:
                break  # success or a 4xx that retrying won't fix
        except httpx.HTTPError as exc:
            logger.warning("webhook_delivery_failed", url=url, event_type=event, attempt=attempt, error=str(exc))

    async with async_session_local() as session:
        await session.execute(
            update(OutboundWebhook)
            .where(OutboundWebhook.id == webhook_id)
            .values(last_status=status_code, last_delivery_at=datetime.now(timezone.utc))
        )
        await session.commit()


async def dispatch(session: AsyncSession, project_id: uuid.UUID, event: str, payload: dict) -> None:
    """Queue delivery to every enabled webhook of the project subscribed to `event`.

    The lookup runs on the caller's request session — a private engine here
    would bypass the get_db_session DI override in tests and query the wrong
    database. Like delivery, the lookup can never raise into the originating
    request (REQ-144).
    """
    from app.models.outbound_webhook import OutboundWebhook

    try:
        result = await session.execute(
            select(OutboundWebhook).where(
                OutboundWebhook.project_id == project_id,
                OutboundWebhook.enabled.is_(True),
            )
        )
        hooks = [h for h in result.scalars().all() if event in (h.events or [])]
    except Exception as exc:
        logger.error("webhook_lookup_failed", project_id=str(project_id), event_type=event, error=str(exc))
        return

    if not hooks:
        return
    body = json.dumps({"event": event, "project_id": str(project_id), "data": payload}).encode()
    for h in hooks:
        asyncio.create_task(_deliver(h.id, h.url, h.secret, event, body, fmt=h.format or "json"))
