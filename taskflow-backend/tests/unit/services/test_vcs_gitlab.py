"""Unit tests for the GitLab webhook → CanonicalEvent parser (pure)."""
from app.services.vcs.providers.gitlab import parse_gitlab


def _mr(action, title="Fix ORB-7"):
    return {
        "object_kind": "merge_request",
        "user": {"username": "dev"},
        "object_attributes": {
            "id": 1001, "iid": 7, "title": title, "description": "closes ORB-7",
            "url": "https://gitlab.com/o/r/-/merge_requests/7",
            "action": action, "source_branch": "feat/orb-7",
        },
    }


def test_mr_opened():
    [e] = parse_gitlab("Merge Request Hook", _mr("open"))
    assert (e.kind, e.action, e.state) == ("pr", "opened", "open")
    assert e.number == 7 and e.branch == "feat/orb-7" and e.author_login == "dev"


def test_mr_merge_and_reopen_and_close():
    assert parse_gitlab("x", _mr("merge"))[0].action == "merged"
    assert parse_gitlab("x", _mr("reopen"))[0].action == "reopened"
    assert parse_gitlab("x", _mr("close"))[0].action == "closed"
    assert parse_gitlab("x", _mr("merge"))[0].state == "merged"


def test_mr_update_ignored():
    assert parse_gitlab("x", _mr("update")) == []


def test_push_commits():
    payload = {
        "object_kind": "push", "ref": "refs/heads/main",
        "before": "a1b2c3", "user_username": "dev",
        "project": {"web_url": "https://gitlab.com/o/r"},
        "commits": [{"id": "sha1", "message": "ORB-1 #close done",
                     "url": "https://gitlab.com/o/r/-/commit/sha1",
                     "author": {"email": "d@x.io", "name": "Dev"}}],
    }
    [e] = parse_gitlab("Push Hook", payload)
    assert e.kind == "commit" and e.commit_message.startswith("ORB-1")
    assert e.author_email == "d@x.io" and e.branch == "main"


def test_push_branch_create_zero_sha():
    payload = {
        "object_kind": "push", "ref": "refs/heads/feature/orb-9",
        "before": "0000000000000000000000000000000000000000",
        "user_username": "dev", "project": {"web_url": "https://gitlab.com/o/r"},
        "commits": [],
    }
    [e] = parse_gitlab("Push Hook", payload)
    assert e.kind == "branch" and e.branch == "feature/orb-9"
    assert e.url == "https://gitlab.com/o/r/-/tree/feature/orb-9"


def test_unknown_kind():
    assert parse_gitlab("x", {"object_kind": "issue"}) == []
