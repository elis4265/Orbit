"""Unit tests for services/email.py — covers SMTP, Brevo, and no-config paths."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── _send_smtp ────────────────────────────────────────────────────────────────

def test_send_smtp_calls_sendmail():
    mock_smtp_instance = MagicMock()
    mock_smtp_cls = MagicMock(return_value=__import__('contextlib').nullcontext(mock_smtp_instance))

    with patch("app.services.email.smtplib.SMTP", mock_smtp_cls):
        with patch("app.services.email.settings") as mock_settings:
            mock_settings.smtp_host = "localhost"
            mock_settings.smtp_port = 1025
            mock_settings.email_from = "no-reply@orbit.test"
            from app.services.email import _send_smtp
            _send_smtp("user@example.com", "Subject", "<p>body</p>")

    mock_smtp_instance.sendmail.assert_called_once()


# ── _send: SMTP path ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_uses_smtp_when_configured():
    with patch("app.services.email.settings") as mock_settings, \
         patch("app.services.email._send_smtp") as mock_smtp:
        mock_settings.smtp_host = "localhost"
        mock_settings.brevo_api_key = None
        from app.services.email import _send
        await _send("u@example.com", "hi", "<p>hi</p>")
    mock_smtp.assert_called_once_with("u@example.com", "hi", "<p>hi</p>")


# ── _send: no-config path ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_logs_warning_when_no_config():
    with patch("app.services.email.settings") as mock_settings, \
         patch("app.services.email.logger") as mock_logger:
        mock_settings.smtp_host = None
        mock_settings.brevo_api_key = None
        from app.services.email import _send
        await _send("u@example.com", "hi", "<p>hi</p>")
    mock_logger.warning.assert_called_once()


# ── _send: Brevo path ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_uses_brevo_when_no_smtp():
    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.text = ""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client_ctx = MagicMock()
    mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.email.settings") as mock_settings, \
         patch("app.services.email.httpx.AsyncClient", return_value=mock_client_ctx):
        mock_settings.smtp_host = None
        mock_settings.brevo_api_key = "test-key"
        mock_settings.email_from = "no-reply@orbit.test"
        from app.services.email import _send
        await _send("u@example.com", "Subject", "<p>body</p>")

    mock_client.post.assert_called_once()


@pytest.mark.asyncio
async def test_send_brevo_logs_error_on_4xx():
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = "Bad Request"
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_resp)
    mock_client_ctx = MagicMock()
    mock_client_ctx.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client_ctx.__aexit__ = AsyncMock(return_value=False)

    with patch("app.services.email.settings") as mock_settings, \
         patch("app.services.email.httpx.AsyncClient", return_value=mock_client_ctx), \
         patch("app.services.email.logger") as mock_logger:
        mock_settings.smtp_host = None
        mock_settings.brevo_api_key = "test-key"
        mock_settings.email_from = "no-reply@orbit.test"
        from app.services.email import _send
        await _send("u@example.com", "Subject", "<p>body</p>")

    mock_logger.error.assert_called_once()


# ── Public helpers ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_verification_email_calls_send():
    with patch("app.services.email._send", new_callable=AsyncMock) as mock_send:
        from app.services.email import send_verification_email
        await send_verification_email("u@example.com", "123456")
    mock_send.assert_called_once()
    assert "123456" in mock_send.call_args[1]["html"] or "123456" in str(mock_send.call_args)


@pytest.mark.asyncio
async def test_send_notification_email_calls_send():
    with patch("app.services.email._send", new_callable=AsyncMock) as mock_send:
        from app.services.email import send_notification_email
        await send_notification_email("u@example.com", "Alert", "Something happened")
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_send_invite_email_calls_send():
    with patch("app.services.email._send", new_callable=AsyncMock) as mock_send:
        from app.services.email import send_invite_email
        await send_invite_email("u@example.com", "Acme Corp", "some-token-uuid")
    mock_send.assert_called_once()
    assert "some-token-uuid" in str(mock_send.call_args)
