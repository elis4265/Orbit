"""Integration tests for the automation engine — rules fire on task events."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    s = uuid.uuid4().hex[:6]
    user = await UserRepository(db_session).create({
        "email": f"auto_{s}@test.io", "hashed_password": "h", "username": f"auto_{s}",
        "first_name": "Auto", "last_name": "User", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "AUT", "name": "Auto Proj", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Main", "project_id": project.id})
    return user, project, board


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_automation_assigns_on_create_in_guided_mode(seeded, db_session):
    user, project, board = seeded
    pid, bid = project.id, board.id
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            await ac.patch(f"/api/v1/projects/{pid}/mode", json={"mode": "guided"})

            rule = await ac.post(f"/api/v1/projects/{pid}/automation-rules", json={
                "name": "auto-assign bugs",
                "trigger": "task_created",
                "conditions": [{"field": "issue_type", "op": "eq", "value": "bug"}],
                "actions": [{"type": "assign", "assignee_id": str(user.id)}],
            })
            assert rule.status_code == 201

            # a bug matches → assigned by the engine
            bug = (await ac.post(f"/api/v1/projects/{pid}/boards/{bid}/tasks", json={"title": "crash", "issue_type": "bug"})).json()
            assert bug["assignee_id"] == str(user.id)

            # a plain task doesn't match the condition → left unassigned
            plain = (await ac.post(f"/api/v1/projects/{pid}/boards/{bid}/tasks", json={"title": "chore", "issue_type": "task"})).json()
            assert plain["assignee_id"] is None
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_automation_applies_priority_tag_and_comment(seeded, db_session):
    user, project, board = seeded
    pid, bid = project.id, board.id
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            await ac.patch(f"/api/v1/projects/{pid}/mode", json={"mode": "guided"})
            tag = (await ac.post(f"/api/v1/projects/{pid}/tags", json={"name": "auto", "color": "#ffaa00"})).json()

            # One rule exercising every action handler in the engine.
            r = await ac.post(f"/api/v1/projects/{pid}/automation-rules", json={
                "name": "triage", "trigger": "task_created",
                "actions": [
                    {"type": "assign", "assignee_id": str(user.id)},
                    {"type": "add_tag", "tag_id": tag["id"]},
                    {"type": "comment", "text": "auto-triaged"},
                ],
            })
            assert r.status_code == 201

            t = (await ac.post(f"/api/v1/projects/{pid}/boards/{bid}/tasks", json={"title": "incoming"})).json()
            assert t["assignee_id"] == str(user.id)   # the action batch ran

            # add_tag persisted? (check the DB-backed tags endpoint, not the create response)
            tags = (await ac.get(f"/api/v1/projects/{pid}/tasks/{t['id']}/tags")).json()
            assert any(x["id"] == tag["id"] for x in tags), f"add_tag did not persist: {tags}"

            # comment persisted?
            comments = (await ac.get(f"/api/v1/projects/{pid}/tasks/{t['id']}/comments")).json()
            assert any(c["content"] == "auto-triaged" for c in comments), f"comment did not persist: {comments}"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_set_status_action_moves_task(seeded, db_session):
    """The new set_status action transitions the task (here in Guided, by status name)."""
    user, project, board = seeded
    pid, bid = project.id, board.id
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            await ac.patch(f"/api/v1/projects/{pid}/mode", json={"mode": "guided"})
            ir = (await ac.post(f"/api/v1/projects/{pid}/statuses",
                                json={"name": "In Review", "category": "started", "color": "#abcdef"})).json()
            rule = await ac.post(f"/api/v1/projects/{pid}/automation-rules", json={
                "name": "auto in review", "trigger": "task_created",
                "actions": [{"type": "set_status", "status": "In Review"}],
            })
            assert rule.status_code == 201
            t = (await ac.post(f"/api/v1/projects/{pid}/boards/{bid}/tasks", json={"title": "x"})).json()
            tasks = (await ac.get(f"/api/v1/projects/{pid}/boards/{bid}/tasks")).json()
            assert next(x for x in tasks if x["id"] == t["id"])["custom_status_id"] == ir["id"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_automation_skipped_in_flow_mode(seeded, db_session):
    user, project, board = seeded
    pid, bid = project.id, board.id
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            # project stays in Flow (open) mode → engine runs nothing
            rule = await ac.post(f"/api/v1/projects/{pid}/automation-rules", json={
                "name": "noop in flow", "trigger": "task_created",
                "actions": [{"type": "assign", "assignee_id": str(user.id)}],
            })
            # automation rules are admin-managed but only *run* in guided/enforced
            if rule.status_code == 201:
                t = (await ac.post(f"/api/v1/projects/{pid}/boards/{bid}/tasks", json={"title": "x"})).json()
                assert t["assignee_id"] is None
    finally:
        app.dependency_overrides.pop(get_current_user, None)
