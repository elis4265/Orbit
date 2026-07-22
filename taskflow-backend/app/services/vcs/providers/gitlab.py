"""Normalize GitLab webhooks into CanonicalEvent(s). Pure / DB-free.

Dispatches on the payload's `object_kind` (more reliable than the
X-Gitlab-Event header). Handles merge_request (open/reopen/merge/close) and
push (branch-create + per-commit). Other kinds/actions → empty.
"""
from app.services.vcs.canonical import CanonicalEvent

_MR_ACTION = {"open": "opened", "reopen": "reopened", "merge": "merged", "close": "closed"}
_MR_STATE = {"opened": "open", "reopened": "open", "merged": "merged", "closed": "closed"}


def parse_gitlab(event_type: str, payload: dict) -> list[CanonicalEvent]:
    kind = payload.get("object_kind")
    if kind == "merge_request":
        return _parse_mr(payload)
    if kind == "push":
        return _parse_push(payload)
    return []


def _parse_mr(payload: dict) -> list[CanonicalEvent]:
    attrs = payload.get("object_attributes") or {}
    action = _MR_ACTION.get(attrs.get("action"))
    if action is None:
        return []  # update / approval / etc — ignored in v2
    return [CanonicalEvent(
        provider="gitlab",
        kind="pr",
        action=action,
        external_id=str(attrs.get("id") or ""),
        number=attrs.get("iid"),
        title=attrs.get("title") or "",
        url=attrs.get("url") or "",
        state=_MR_STATE[action],
        branch=attrs.get("source_branch"),
        author_login=(payload.get("user") or {}).get("username"),
        body=attrs.get("description") or "",
    )]


def _parse_push(payload: dict) -> list[CanonicalEvent]:
    ref = payload.get("ref") or ""
    branch = ref.split("/", 2)[-1] if ref.startswith("refs/heads/") else None
    before = payload.get("before") or ""
    created = len(before) > 0 and set(before) <= {"0"}  # all-zero SHA → new branch
    web_url = (payload.get("project") or {}).get("web_url") or ""
    events: list[CanonicalEvent] = []

    if created and branch:
        events.append(CanonicalEvent(
            provider="gitlab", kind="branch", action="created",
            external_id=branch, number=None, title=branch,
            url=f"{web_url}/-/tree/{branch}" if web_url else "",
            state="open", branch=branch, author_login=payload.get("user_username"),
        ))

    for commit in payload.get("commits") or []:
        author = commit.get("author") or {}
        message = commit.get("message") or ""
        events.append(CanonicalEvent(
            provider="gitlab", kind="commit", action="pushed",
            external_id=str(commit.get("id") or ""), number=None,
            title=message.splitlines()[0] if message else "",
            url=commit.get("url") or "", state="open", branch=branch,
            author_email=author.get("email"), author_login=author.get("name"),
            commit_message=message,
        ))

    return events
