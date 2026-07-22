"""OAuth Device Authorization Flow for GitHub + GitLab (the VS Code model).

A vendor-owned, public client_id is baked into config, so every self-hosted
instance shares it with NO callback URL and NO per-deployer app registration —
the user authorizes a short code in their browser. Bitbucket has no device flow
(handled via a pasted token elsewhere). All calls go over httpx → respx-testable.
"""
import httpx

from app.core.config import settings
from app.core.errors import AppError

_GITHUB_DEVICE = "https://github.com/login/device/code"
_GITHUB_TOKEN = "https://github.com/login/oauth/access_token"
_DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"


def _gitlab_base() -> str:
    return (settings.gitlab_base_url or "https://gitlab.com").rstrip("/")


def client_id(provider: str) -> str | None:
    return {
        "github": settings.github_oauth_client_id,
        "gitlab": settings.gitlab_oauth_client_id,
    }.get(provider)


def supports_device_flow(provider: str) -> bool:
    return provider in ("github", "gitlab") and bool(client_id(provider))


def _endpoints(provider: str, cid: str):
    if provider == "github":
        return _GITHUB_DEVICE, _GITHUB_TOKEN, "repo"
    if provider == "gitlab":
        base = _gitlab_base()
        return f"{base}/oauth/authorize_device", f"{base}/oauth/token", "api"
    raise AppError(422, code="UNSUPPORTED_PROVIDER",
                   message=f"Device flow unavailable for '{provider}'")


async def start_device_flow(provider: str) -> dict:
    cid = client_id(provider)
    if not cid:
        raise AppError(503, code="PROVIDER_NOT_CONFIGURED",
                       message=f"No OAuth client id configured for '{provider}'.")
    device_url, _, scope = _endpoints(provider, cid)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(device_url, data={"client_id": cid, "scope": scope},
                         headers={"Accept": "application/json"})
        r.raise_for_status()
        body = r.json()
    # device_code held by us (the polling client); user_code/verification_uri shown to user
    return {
        "device_code": body.get("device_code"),
        "user_code": body.get("user_code"),
        "verification_uri": body.get("verification_uri") or body.get("verification_uri_complete"),
        "interval": body.get("interval", 5),
        "expires_in": body.get("expires_in", 900),
    }


async def poll_device_flow(provider: str, device_code: str) -> dict:
    """One poll. Returns {status: 'ok', access_token, refresh_token} or
    {status: 'pending', error} (authorization_pending / slow_down / etc)."""
    cid = client_id(provider)
    if not cid:
        raise AppError(503, code="PROVIDER_NOT_CONFIGURED",
                       message=f"No OAuth client id configured for '{provider}'.")
    _, token_url, _ = _endpoints(provider, cid)
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(token_url,
                         data={"client_id": cid, "device_code": device_code, "grant_type": _DEVICE_GRANT},
                         headers={"Accept": "application/json"})
        body = r.json()
    if body.get("error"):
        return {"status": "pending", "error": body["error"]}
    return {
        "status": "ok",
        "access_token": body.get("access_token"),
        "refresh_token": body.get("refresh_token"),
    }
