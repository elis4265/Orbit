"""Unit tests for the GitHub webhook → CanonicalEvent parser (pure)."""
from app.services.vcs.providers.github import parse_github


def _pr_payload(action, merged=False):
    return {
        "action": action,
        "pull_request": {
            "id": 999, "number": 42, "title": "Fix ORB-7", "body": "closes ORB-7",
            "html_url": "https://github.com/o/r/pull/42", "merged": merged,
            "head": {"ref": "anon/orb-7-fix"}, "user": {"login": "octocat"},
        },
    }


def test_pr_opened():
    [e] = parse_github("pull_request", _pr_payload("opened"))
    assert (e.kind, e.action, e.state) == ("pr", "opened", "open")
    assert e.number == 42 and e.title == "Fix ORB-7"
    assert e.branch == "anon/orb-7-fix" and e.author_login == "octocat"


def test_pr_reopened():
    [e] = parse_github("pull_request", _pr_payload("reopened"))
    assert (e.action, e.state) == ("reopened", "open")


def test_pr_closed_merged_becomes_merged():
    [e] = parse_github("pull_request", _pr_payload("closed", merged=True))
    assert (e.action, e.state) == ("merged", "merged")


def test_pr_closed_unmerged():
    [e] = parse_github("pull_request", _pr_payload("closed", merged=False))
    assert (e.action, e.state) == ("closed", "closed")


def test_pr_ignored_actions_return_empty():
    assert parse_github("pull_request", _pr_payload("synchronize")) == []
    assert parse_github("pull_request", _pr_payload("labeled")) == []


def test_push_with_commits():
    payload = {
        "ref": "refs/heads/main", "created": False,
        "repository": {"html_url": "https://github.com/o/r"},
        "commits": [
            {"id": "abc", "message": "ORB-1 #comment fixed\n\nbody",
             "url": "https://github.com/o/r/commit/abc",
             "author": {"email": "dev@x.io", "username": "dev"}},
        ],
    }
    [e] = parse_github("push", payload)
    assert e.kind == "commit" and e.action == "pushed"
    assert e.title == "ORB-1 #comment fixed"        # first line only
    assert e.commit_message.startswith("ORB-1 #comment fixed")
    assert e.author_email == "dev@x.io" and e.branch == "main"


def test_push_branch_create_emits_branch_event():
    payload = {
        "ref": "refs/heads/feature/orb-9", "created": True,
        "repository": {"html_url": "https://github.com/o/r"},
        "pusher": {"name": "dev", "email": "dev@x.io"},
        "commits": [],
    }
    events = parse_github("push", payload)
    assert len(events) == 1
    e = events[0]
    assert e.kind == "branch" and e.action == "created"
    assert e.branch == "feature/orb-9"
    assert e.url == "https://github.com/o/r/tree/feature/orb-9"


def test_push_branch_create_with_commits_emits_both():
    payload = {
        "ref": "refs/heads/feature/orb-9", "created": True,
        "repository": {"html_url": "https://github.com/o/r"},
        "pusher": {"name": "dev", "email": "dev@x.io"},
        "commits": [{"id": "c1", "message": "ORB-9 start", "url": "u", "author": {}}],
    }
    events = parse_github("push", payload)
    assert [e.kind for e in events] == ["branch", "commit"]


def test_tag_push_no_branch_no_events():
    payload = {"ref": "refs/tags/v1", "created": True, "commits": []}
    assert parse_github("push", payload) == []


def test_unknown_event_type():
    assert parse_github("issues", {"action": "opened"}) == []
