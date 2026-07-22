"""Normalize Bitbucket Cloud webhooks into CanonicalEvent(s). Pure / DB-free.

Dispatches on the X-Event-Key (passed as event_type): pullrequest:created
/fulfilled/rejected and repo:push (branch-create + per-commit). Others → empty.
"""
from app.services.vcs.canonical import CanonicalEvent

_PR_EVENT = {
    "pullrequest:created": "opened",
    "pullrequest:fulfilled": "merged",
    "pullrequest:rejected": "closed",
}
_PR_STATE = {"opened": "open", "merged": "merged", "closed": "closed"}


def parse_bitbucket(event_type: str, payload: dict) -> list[CanonicalEvent]:
    if event_type in _PR_EVENT:
        return _parse_pr(event_type, payload)
    if event_type == "repo:push":
        return _parse_push(payload)
    return []


def _html_href(obj: dict) -> str:
    return ((obj.get("links") or {}).get("html") or {}).get("href", "")


def _parse_pr(event_type: str, payload: dict) -> list[CanonicalEvent]:
    pr = payload.get("pullrequest") or {}
    action = _PR_EVENT[event_type]
    author = pr.get("author") or {}
    return [CanonicalEvent(
        provider="bitbucket",
        kind="pr",
        action=action,
        external_id=str(pr.get("id") or ""),
        number=pr.get("id"),
        title=pr.get("title") or "",
        url=_html_href(pr),
        state=_PR_STATE[action],
        branch=((pr.get("source") or {}).get("branch") or {}).get("name"),
        author_login=author.get("nickname") or author.get("display_name"),
        body=pr.get("description") or "",
    )]


def _parse_push(payload: dict) -> list[CanonicalEvent]:
    events: list[CanonicalEvent] = []
    for change in ((payload.get("push") or {}).get("changes") or []):
        new = change.get("new") or {}
        branch = new.get("name") if new.get("type") == "branch" else None

        if change.get("old") is None and branch:
            events.append(CanonicalEvent(
                provider="bitbucket", kind="branch", action="created",
                external_id=branch, number=None, title=branch,
                url=_html_href(new), state="open", branch=branch,
            ))

        for commit in change.get("commits") or []:
            message = commit.get("message") or ""
            raw = (commit.get("author") or {}).get("raw") or ""
            email = raw[raw.find("<") + 1:raw.find(">")] if "<" in raw and ">" in raw else None
            login = ((commit.get("author") or {}).get("user") or {}).get("nickname")
            events.append(CanonicalEvent(
                provider="bitbucket", kind="commit", action="pushed",
                external_id=str(commit.get("hash") or ""), number=None,
                title=message.splitlines()[0] if message else "",
                url=_html_href(commit), state="open", branch=branch,
                author_email=email, author_login=login, commit_message=message,
            ))

    return events
