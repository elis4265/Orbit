import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("email")

_BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def _send_smtp(to: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as s:
        s.ehlo()
        if settings.smtp_user and settings.smtp_password:
            s.starttls()
            s.ehlo()
            s.login(settings.smtp_user, settings.smtp_password)
        s.sendmail(settings.email_from, [to], msg.as_string())
    logger.info("email_sent_smtp", to=to, subject=subject)


async def _send(to: str, subject: str, html: str) -> None:
    if settings.smtp_host:
        try:
            _send_smtp(to, subject, html)
        except OSError as exc:
            # Same contract as the Brevo path: a dead mail server (e.g. MailHog
            # not running) logs an error instead of failing the caller's request.
            logger.error("email_failed_smtp", to=to, error=str(exc))
        return

    if not settings.brevo_api_key:
        logger.warning("email_not_sent", reason="no SMTP_HOST or BREVO_API_KEY", to=to)
        return

    payload = {
        "sender": {"name": "Orbit", "email": settings.email_from},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            _BREVO_URL,
            json=payload,
            headers={"api-key": settings.brevo_api_key},
            timeout=10.0,
        )

    if resp.status_code >= 400:
        logger.error("email_failed", to=to, status=resp.status_code, body=resp.text)
    else:
        logger.info("email_sent", to=to, subject=subject)


async def send_verification_email(to: str, code: str) -> None:
    await _send(
        to=to,
        subject="Your Orbit verification code",
        html=(
            f"<p>Your verification code is:</p>"
            f"<h2 style='letter-spacing:0.2em'>{code}</h2>"
            f"<p>Expires in 15 minutes.</p>"
        ),
    )


async def send_password_reset_email(to: str, code: str) -> None:
    await _send(
        to=to,
        subject="Your Orbit password reset code",
        html=(
            f"<p>Your password reset code is:</p>"
            f"<h2 style='letter-spacing:0.2em'>{code}</h2>"
            f"<p>Expires in 15 minutes. If you didn't request this, ignore this email.</p>"
        ),
    )


async def send_notification_email(to: str, subject: str, body: str) -> None:
    await _send(to=to, subject=subject, html=f"<p>{body}</p>")


async def send_password_changed_email(to: str, tokens_revoked: bool) -> None:
    tokens_line = (
        "All API tokens were also revoked."
        if tokens_revoked
        else "API tokens were not affected."
    )
    await _send(
        to=to,
        subject="Your Orbit password was changed",
        html=(
            f"<p>Your password was just changed. All other sessions were signed out. {tokens_line}</p>"
            f"<p>If this wasn't you, reset your password immediately via "
            f"<a href='{settings.frontend_url}/login'>Forgot password</a> and revoke your API tokens.</p>"
        ),
    )


async def send_invite_email(to: str, workspace_name: str, token: str) -> None:
    accept_url = f"{settings.frontend_url}/invites/{token}"
    await _send(
        to=to,
        subject=f"You've been invited to {workspace_name} on Orbit",
        html=(
            f"<p>You've been invited to join <strong>{workspace_name}</strong>.</p>"
            f"<p><a href='{accept_url}'>Accept invitation</a></p>"
            f"<p>This link expires in 7 days.</p>"
        ),
    )
