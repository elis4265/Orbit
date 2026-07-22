"""Unit tests for the Bitbucket webhook → CanonicalEvent parser (pure)."""
from app.services.vcs.providers.bitbucket import parse_bitbucket


def _pr(title="Fix ORB-7"):
    return {
        "pullrequest": {
            "id": 7, "title": title, "description": "closes ORB-7",
            "links": {"html": {"href": "https://bitbucket.org/o/r/pull-requests/7"}},
            "source": {"branch": {"name": "feat/orb-7"}},
            "author": {"nickname": "dev"},
        }
    }


def test_pr_created():
    [e] = parse_bitbucket("pullrequest:created", _pr())
    assert (e.kind, e.action, e.state) == ("pr", "opened", "open")
    assert e.number == 7 and e.branch == "feat/orb-7" and e.author_login == "dev"
    assert e.url.endswith("/pull-requests/7")


def test_pr_fulfilled_merged_and_rejected_closed():
    assert parse_bitbucket("pullrequest:fulfilled", _pr())[0].action == "merged"
    assert parse_bitbucket("pullrequest:rejected", _pr())[0].action == "closed"


def test_pr_updated_ignored():
    assert parse_bitbucket("pullrequest:updated", _pr()) == []


def test_push_commits_with_raw_email():
    payload = {
        "push": {"changes": [{
            "old": {"type": "branch", "name": "main"},
            "new": {"type": "branch", "name": "main"},
            "commits": [{
                "hash": "abc", "message": "ORB-1 #comment ok",
                "links": {"html": {"href": "https://bitbucket.org/o/r/commits/abc"}},
                "author": {"raw": "Dev <dev@x.io>", "user": {"nickname": "dev"}},
            }],
        }]},
    }
    [e] = parse_bitbucket("repo:push", payload)
    assert e.kind == "commit" and e.author_email == "dev@x.io" and e.author_login == "dev"


def test_push_branch_create_old_none():
    payload = {
        "push": {"changes": [{
            "old": None,
            "new": {"type": "branch", "name": "feature/orb-9",
                    "links": {"html": {"href": "https://bitbucket.org/o/r/branch/feature/orb-9"}}},
            "commits": [],
        }]},
    }
    [e] = parse_bitbucket("repo:push", payload)
    assert e.kind == "branch" and e.branch == "feature/orb-9"


def test_unknown_event():
    assert parse_bitbucket("repo:fork", {}) == []
