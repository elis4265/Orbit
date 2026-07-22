"""Integration tests for the inbound VCS webhook (GitHub, synthetic payloads).

Drives the full pipeline: signature → idempotency → parse → ref resolve →
dev-link + transition + smart-command comment. No live GitHub needed.
"""
import hashlib
import hmac
import json
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.models.vcs import VcsConnection, TaskDevLink

pytestmark = pytest.mark.integration

SECRET = "whsec_test"


@pytest_asyncio.fixture
async def seeded(db_session):
    s = uuid.uuid4().hex[:6]
    user = await UserRepository(db_session).create({
        "email": f"gh_{s}@test.io", "hashed_password": "h", "username": f"gh_{s}",
        "first_name": "Git", "last_name": "Hub", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "GH", "name": "GH Proj", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Main", "project_id": project.id})
    conn = VcsConnection(project_id=project.id, provider="github",
                         repo_identifier="o/r", webhook_secret=SECRET)
    db_session.add(conn)
    await db_session.commit()
    return user, project, board, conn


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


async def _send(ac, conn_id, event, payload, delivery=None, secret_ok=True):
    body = json.dumps(payload).encode()
    sig = _sign(body) if secret_ok else "sha256=deadbeef"
    headers = {
        "X-GitHub-Event": event,
        "X-GitHub-Delivery": delivery or uuid.uuid4().hex,
        "X-Hub-Signature-256": sig,
        "Content-Type": "application/json",
    }
    return await ac.post(f"/api/v1/vcs/github/webhook/{conn_id}", content=body, headers=headers)


def _pr(action, ref_text, merged=False, pr_id=101, number=7):
    return {
        "action": action,
        "pull_request": {
            "id": pr_id, "number": number, "title": ref_text, "body": "",
            "html_url": "https://github.com/o/r/pull/7", "merged": merged,
            "head": {"ref": "feat/x"}, "user": {"login": "octocat"},
        },
    }


@pytest.mark.asyncio
async def test_pr_opened_links_and_transitions_then_merge_done(seeded, db_session):
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks",
                json={"title": "wire it up"})).json()
            ref = f"GH-{task['sequence_number']}"

            # PR opened referencing the task → linked + moved to in_progress (Flow)
            r = await _send(ac, conn.id, "pull_request", _pr("opened", f"Fix {ref}"))
            assert r.status_code == 200
            assert r.json()["linked"] == 1 and r.json()["transitions"] == 1

            fresh = (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()
            moved = next(t for t in fresh if t["id"] == task["id"])
            assert moved["status"] == "in_progress"

            # PR merged → done
            r2 = await _send(ac, conn.id, "pull_request", _pr("closed", f"Fix {ref}", merged=True))
            assert r2.status_code == 200 and r2.json()["transitions"] == 1
            fresh = (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()
            assert next(t for t in fresh if t["id"] == task["id"])["status"] == "done"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_invalid_signature_rejected(seeded, db_session):
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            r = await _send(ac, conn.id, "pull_request", _pr("opened", "GH-1"), secret_ok=False)
            assert r.status_code == 401
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_duplicate_delivery_is_noop(seeded, db_session):
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks",
                json={"title": "dup"})).json()
            ref = f"GH-{task['sequence_number']}"
            d = uuid.uuid4().hex
            r1 = await _send(ac, conn.id, "pull_request", _pr("opened", ref), delivery=d)
            r2 = await _send(ac, conn.id, "pull_request", _pr("opened", ref), delivery=d)
            assert r1.json()["status"] == "ok"
            assert r2.json()["status"] == "duplicate"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_push_commit_smart_comment(seeded, db_session):
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks",
                json={"title": "commit me"})).json()
            ref = f"GH-{task['sequence_number']}"
            payload = {
                "ref": "refs/heads/main", "created": False,
                "repository": {"html_url": "https://github.com/o/r"},
                "commits": [{
                    "id": "abc123", "message": f"{ref} #comment fixed via push",
                    "url": "https://github.com/o/r/commit/abc123",
                    "author": {"email": user.email, "username": "octocat"},
                }],
            }
            r = await _send(ac, conn.id, "push", payload)
            assert r.status_code == 200 and r.json()["comments"] == 1

            comments = (await ac.get(f"/api/v1/projects/{project.id}/tasks/{task['id']}/comments")).json()
            assert any("fixed via push" in c["content"] for c in comments)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest_asyncio.fixture
async def conn_for(db_session):
    async def _make(project_id, provider):
        c = VcsConnection(project_id=project_id, provider=provider,
                          repo_identifier="o/r", webhook_secret=SECRET)
        db_session.add(c)
        await db_session.commit()
        return c
    return _make


@pytest.mark.asyncio
async def test_gitlab_mr_opened_transitions(seeded, conn_for, db_session):
    user, project, board, _ = seeded
    conn = await conn_for(project.id, "gitlab")
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks",
                json={"title": "gl"})).json()
            ref = f"GH-{task['sequence_number']}"
            payload = {
                "object_kind": "merge_request", "user": {"username": "dev"},
                "object_attributes": {
                    "id": 1, "iid": 3, "title": f"Fix {ref}", "description": "",
                    "url": "https://gitlab.com/o/r/-/merge_requests/3",
                    "action": "open", "source_branch": "feat/x",
                },
            }
            body = json.dumps(payload).encode()
            r = await ac.post(f"/api/v1/vcs/gitlab/webhook/{conn.id}", content=body, headers={
                "X-Gitlab-Event": "Merge Request Hook",
                "X-Gitlab-Event-UUID": uuid.uuid4().hex,
                "X-Gitlab-Token": SECRET,
                "Content-Type": "application/json",
            })
            assert r.status_code == 200 and r.json()["transitions"] == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_bitbucket_pr_merged_done(seeded, conn_for, db_session):
    user, project, board, _ = seeded
    conn = await conn_for(project.id, "bitbucket")
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks",
                json={"title": "bb"})).json()
            ref = f"GH-{task['sequence_number']}"
            payload = {"pullrequest": {
                "id": 5, "title": f"Fix {ref}", "description": "",
                "links": {"html": {"href": "https://bitbucket.org/o/r/pull-requests/5"}},
                "source": {"branch": {"name": "feat/x"}}, "author": {"nickname": "dev"},
            }}
            body = json.dumps(payload).encode()
            sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
            r = await ac.post(f"/api/v1/vcs/bitbucket/webhook/{conn.id}", content=body, headers={
                "X-Event-Key": "pullrequest:fulfilled",
                "X-Request-UUID": uuid.uuid4().hex,
                "X-Hub-Signature": sig,
                "Content-Type": "application/json",
            })
            assert r.status_code == 200 and r.json()["transitions"] == 1
            fresh = (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()
            assert next(t for t in fresh if t["id"] == task["id"])["status"] == "done"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_guided_set_status_command_moves_to_named_status(seeded, db_session):
    """Guided = YouTrack: a commit `#{In Review}` moves the task to that named status."""
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            await ac.patch(f"/api/v1/projects/{project.id}/mode", json={"mode": "guided"})
            ir = (await ac.post(f"/api/v1/projects/{project.id}/statuses",
                                json={"name": "In Review", "category": "started", "color": "#abcdef"})).json()
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks", json={"title": "yt"})).json()
            ref = f"GH-{task['sequence_number']}"
            payload = {
                "ref": "refs/heads/main", "created": False,
                "repository": {"html_url": "https://github.com/o/r"},
                "commits": [{"id": "c1", "message": f"{ref} #{{In Review}}",
                             "url": "https://github.com/o/r/commit/c1",
                             "author": {"email": user.email, "username": "octocat"}}],
            }
            r = await _send(ac, conn.id, "push", payload)
            assert r.status_code == 200 and r.json()["transitions"] == 1
            tasks = (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()
            assert next(t for t in tasks if t["id"] == task["id"])["custom_status_id"] == ir["id"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_enforced_pr_merge_defers_to_rules_no_autotransition(seeded, db_session):
    """Enforced = Jira: PR-merged does NOT auto-transition (rules own it); still links."""
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            await ac.patch(f"/api/v1/projects/{project.id}/mode", json={"mode": "enforced"})
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks", json={"title": "jira"})).json()
            ref = f"GH-{task['sequence_number']}"
            r = await _send(ac, conn.id, "pull_request", _pr("closed", f"Fix {ref}", merged=True))
            assert r.status_code == 200
            assert r.json()["linked"] == 1
            assert r.json()["transitions"] == 0   # no blind auto-transition in Enforced
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_enforced_rule_gates_on_all_prs_merged_multi_repo(seeded, conn_for, db_session):
    """Enforced = Jira: a rule 'pr_merged + no open PRs → act' fires only once every
    repo's PR has merged (the multi-repo close-gate)."""
    user, project, board, conn_a = seeded
    conn_b = await conn_for(project.id, "github")
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            await ac.patch(f"/api/v1/projects/{project.id}/mode", json={"mode": "enforced"})
            await ac.post(f"/api/v1/projects/{project.id}/automation-rules", json={
                "name": "close when all merged", "trigger": "pr_merged",
                "conditions": [{"field": "open_prs", "op": "is_empty"}],
                "actions": [{"type": "comment", "text": "all repos merged"}],
            })
            task = (await ac.post(
                f"/api/v1/projects/{project.id}/boards/{board.id}/tasks", json={"title": "multi"})).json()
            ref = f"GH-{task['sequence_number']}"

            # two PRs on the task, one per repo
            await _send(ac, conn_a.id, "pull_request", _pr("opened", ref, pr_id=1, number=11))
            await _send(ac, conn_b.id, "pull_request", _pr("opened", ref, pr_id=2, number=22))

            r1 = await _send(ac, conn_a.id, "pull_request", _pr("closed", ref, merged=True, pr_id=1, number=11))
            r2 = await _send(ac, conn_b.id, "pull_request", _pr("closed", ref, merged=True, pr_id=2, number=22))

            assert r1.json()["rules"] == 0   # one PR still open → gate holds
            assert r2.json()["rules"] == 1   # all merged → rule fires

            comments = (await ac.get(f"/api/v1/projects/{project.id}/tasks/{task['id']}/comments")).json()
            assert sum(1 for c in comments if c["content"] == "all repos merged") == 1
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_unmatched_ref_is_noop(seeded, db_session):
    user, project, board, conn = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            r = await _send(ac, conn.id, "pull_request", _pr("opened", "ZZ-999 nothing here"))
            assert r.status_code == 200
            assert r.json()["linked"] == 0 and r.json()["transitions"] == 0
    finally:
        app.dependency_overrides.pop(get_current_user, None)
