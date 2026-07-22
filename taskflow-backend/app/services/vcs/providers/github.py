"""Normalize GitHub webhooks into CanonicalEvent(s). Pure / DB-free.

Handles `pull_request` (opened/reopened/closed→merged|closed) and `push`
(branch-create + per-commit events). Other events / actions are ignored (return
empty) so the receiver no-ops cleanly.
"""
from app.services.vcs.canonical import CanonicalEvent


def parse_github(event_type: str, payload: dict) -> list[CanonicalEvent]:
    if event_type == "pull_request":
        return _parse_pr(payload)
    if event_type == "push":
        return _parse_push(payload)
    return []


def _parse_pr(payload: dict) -> list[CanonicalEvent]:
    pr = payload.get("pull_request") or {}
    action = payload.get("action")

    if action == "closed":
        merged = bool(pr.get("merged"))
        norm_action = "merged" if merged else "closed"
        state = "merged" if merged else "closed"
    elif action in ("opened", "reopened"):
        norm_action = action
        state = "open"
    else:
        return []  # edited/labeled/synchronize/etc — ignored in v2

    return [CanonicalEvent(
        provider="github",
        kind="pr",
        action=norm_action,
        external_id=str(pr.get("id") or ""),
        number=pr.get("number"),
        title=pr.get("title") or "",
        url=pr.get("html_url") or "",
        state=state,
        branch=(pr.get("head") or {}).get("ref"),
        author_login=(pr.get("user") or {}).get("login"),
        body=pr.get("body") or "",
    )]


def _parse_push(payload: dict) -> list[CanonicalEvent]:
    ref = payload.get("ref") or ""
    branch = ref.split("/", 2)[-1] if ref.startswith("refs/heads/") else None
    repo_url = (payload.get("repository") or {}).get("html_url") or ""
    events: list[CanonicalEvent] = []

    if payload.get("created") and branch:
        pusher = payload.get("pusher") or {}
        events.append(CanonicalEvent(
            provider="github",
            kind="branch",
            action="created",
            external_id=branch,
            number=None,
            title=branch,
            url=f"{repo_url}/tree/{branch}" if repo_url else "",
            state="open",
            branch=branch,
            author_email=pusher.get("email"),
            author_login=pusher.get("name"),
        ))

    for commit in payload.get("commits") or []:
        author = commit.get("author") or {}
        message = commit.get("message") or ""
        events.append(CanonicalEvent(
            provider="github",
            kind="commit",
            action="pushed",
            external_id=str(commit.get("id") or ""),
            number=None,
            title=message.splitlines()[0] if message else "",
            url=commit.get("url") or "",
            state="open",
            branch=branch,
            author_email=author.get("email"),
            author_login=author.get("username"),
            commit_message=message,
        ))

    return events
