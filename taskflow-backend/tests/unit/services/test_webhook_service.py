"""REQ-144 — outbound webhook signing + delivery."""
import hashlib
import hmac

import pytest
import respx
from httpx import Response

from app.services.webhook import sign_payload, _deliver


async def _public_resolver(host):
    return ['93.184.216.34']


def test_signature_matches_manual_hmac():
    body = b'{"event":"task.created"}'
    expected = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert sign_payload("s3cret", body) == expected


def test_signature_changes_with_secret():
    body = b"{}"
    assert sign_payload("a", body) != sign_payload("b", body)


@pytest.mark.asyncio
@respx.mock
async def test_deliver_posts_signed_payload(monkeypatch):
    import uuid as _uuid
    from unittest.mock import AsyncMock, MagicMock

    # Stub out the DB status write — unit test targets the HTTP contract.
    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.database.async_session_local", lambda: session)
    monkeypatch.setattr("app.services.webhook._resolve_host", _public_resolver)

    route = respx.post("https://receiver.example/hook").mock(return_value=Response(200))
    body = b'{"event":"task.created","data":{}}'
    await _deliver(_uuid.uuid4(), "https://receiver.example/hook", "s3cret", "task.created", body)

    assert route.called
    request = route.calls[0].request
    assert request.headers["X-Orbit-Event"] == "task.created"
    assert request.headers["X-Orbit-Signature"] == sign_payload("s3cret", body)
    assert request.content == body


@pytest.mark.asyncio
@respx.mock
async def test_deliver_does_not_retry_4xx(monkeypatch):
    import uuid as _uuid
    from unittest.mock import AsyncMock, MagicMock

    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.database.async_session_local", lambda: session)
    monkeypatch.setattr("app.services.webhook._resolve_host", _public_resolver)

    route = respx.post("https://receiver.example/hook").mock(return_value=Response(404))
    await _deliver(_uuid.uuid4(), "https://receiver.example/hook", "s", "task.created", b"{}")
    assert route.call_count == 1


# ── REQ-146 — Slack/Discord formats ──────────────────────────────────────────

from app.services.webhook import format_message


def test_format_message_task_events():
    task = {"project_key": "ORB", "sequence_number": 7, "title": "Fix login bug"}
    assert format_message("task.created", task) == '🆕 ORB-7 "Fix login bug" created'
    assert format_message("task.completed", task) == '✅ ORB-7 "Fix login bug" completed'
    assert format_message("task.updated", task) == '✏️ ORB-7 "Fix login bug" updated'


def test_format_message_task_deleted_and_sprint():
    assert format_message("task.deleted", {"title": "Old junk"}) == '🗑️ "Old junk" deleted'
    assert format_message("sprint.closed", {"name": "Sprint 5"}) == '🏁 Sprint "Sprint 5" closed'


def test_format_message_unknown_event_falls_back_to_event_name():
    assert format_message("something.else", {}) == "something.else"


@pytest.mark.asyncio
@respx.mock
async def test_slack_format_posts_text_without_signature(monkeypatch):
    import json
    import uuid as _uuid
    from unittest.mock import AsyncMock, MagicMock

    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.database.async_session_local", lambda: session)
    monkeypatch.setattr("app.services.webhook._resolve_host", _public_resolver)

    route = respx.post("https://hooks.slack.example/T000/B000").mock(return_value=Response(200))
    await _deliver(
        _uuid.uuid4(), "https://hooks.slack.example/T000/B000", "unused-secret",
        "task.completed",
        json.dumps({"event": "task.completed", "data": {"project_key": "ORB", "sequence_number": 7, "title": "X"}}).encode(),
        fmt="slack",
    )
    request = route.calls[0].request
    body = json.loads(request.content)
    assert body == {"text": '✅ ORB-7 "X" completed'}
    assert "X-Orbit-Signature" not in request.headers


@pytest.mark.asyncio
@respx.mock
async def test_discord_format_posts_content(monkeypatch):
    import json
    import uuid as _uuid
    from unittest.mock import AsyncMock, MagicMock

    session = MagicMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    monkeypatch.setattr("app.database.async_session_local", lambda: session)
    monkeypatch.setattr("app.services.webhook._resolve_host", _public_resolver)

    route = respx.post("https://discord.example/api/webhooks/1/x").mock(return_value=Response(204))
    await _deliver(
        _uuid.uuid4(), "https://discord.example/api/webhooks/1/x", "unused",
        "sprint.closed",
        json.dumps({"event": "sprint.closed", "data": {"name": "Sprint 5"}}).encode(),
        fmt="discord",
    )
    body = json.loads(route.calls[0].request.content)
    assert body == {"content": '🏁 Sprint "Sprint 5" closed'}


# ── REQ-153 — SSRF egress guard ──────────────────────────────────────────────

from app.services.webhook import _is_forbidden_ip, url_is_deliverable


def test_private_and_loopback_ips_forbidden():
    for ip in ("127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.9", "169.254.169.254", "::1", "0.0.0.0"):
        assert _is_forbidden_ip(ip) is True


def test_public_ips_allowed():
    for ip in ("93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"):
        assert _is_forbidden_ip(ip) is False


@pytest.mark.asyncio
async def test_url_is_deliverable_blocks_private_resolution(monkeypatch):
    async def fake_resolve(host):
        return ["192.168.0.10"]
    monkeypatch.setattr("app.services.webhook._resolve_host", fake_resolve)
    assert await url_is_deliverable("https://internal.corp/hook") is False


@pytest.mark.asyncio
async def test_url_is_deliverable_allows_public_resolution(monkeypatch):
    async def fake_resolve(host):
        return ["93.184.216.34"]
    monkeypatch.setattr("app.services.webhook._resolve_host", fake_resolve)
    assert await url_is_deliverable("https://hooks.slack.com/x") is True


@pytest.mark.asyncio
async def test_url_is_deliverable_opt_out(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "webhook_allow_private_ips", True)
    async def fake_resolve(host):
        return ["127.0.0.1"]
    monkeypatch.setattr("app.services.webhook._resolve_host", fake_resolve)
    assert await url_is_deliverable("http://localhost/hook") is True


@pytest.mark.asyncio
async def test_url_is_deliverable_blocks_unresolvable(monkeypatch):
    async def fake_resolve(host):
        raise OSError("no such host")
    monkeypatch.setattr("app.services.webhook._resolve_host", fake_resolve)
    assert await url_is_deliverable("https://nope.invalid/hook") is False


# ── dispatch runs on the caller's session and never raises ───────────────────
# Regression for the CI failure where dispatch opened async_session_local()
# itself: it bypassed the get_db_session test override (hitting the real
# DATABASE_URL) and a lookup error propagated into the originating request,
# violating REQ-144.

import asyncio
import uuid

from app.services.webhook import dispatch


@pytest.mark.asyncio
async def test_dispatch_queries_via_provided_session(monkeypatch):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock, MagicMock

    hook = SimpleNamespace(
        id=uuid.uuid4(), url="https://receiver.example/hook", secret="s",
        events=["task.created"], format="json", enabled=True,
    )
    result = MagicMock()
    result.scalars.return_value.all.return_value = [hook]
    session = MagicMock()
    session.execute = AsyncMock(return_value=result)

    delivered = []

    async def fake_deliver(webhook_id, url, secret, event, body, fmt="json"):
        delivered.append((webhook_id, url, event, fmt))

    monkeypatch.setattr("app.services.webhook._deliver", fake_deliver)

    await dispatch(session, uuid.uuid4(), "task.created", {"title": "X"})
    await asyncio.sleep(0)  # let the fire-and-forget task run

    assert session.execute.await_count == 1
    assert delivered == [(hook.id, "https://receiver.example/hook", "task.created", "json")]


@pytest.mark.asyncio
async def test_dispatch_never_raises_when_lookup_fails():
    from unittest.mock import AsyncMock, MagicMock

    session = MagicMock()
    session.execute = AsyncMock(side_effect=RuntimeError("db down"))

    # Must swallow and log — a webhook lookup failure can never 500 the request.
    await dispatch(session, uuid.uuid4(), "task.updated", {})
