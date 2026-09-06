"""Task-creation status policy (Jira Create-transition model) + Enforced-mode
bypass holes: from=None teleport and the unmapped-category skip."""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.project_status import ProjectStatus
from app.models.task import Task, TaskStatus
from app.models.user import User
from app.models.project import Project
from app.models.board import Board
from app.repositories.project_status import ProjectStatusRepository
from app.services.project_status import ProjectStatusService


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session, mode="guided", policy="any", with_statuses=True):
    user = User(email=f"cp_{uuid.uuid4().hex[:6]}@taskflow.io", hashed_password="x",
                is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.flush()
    project = Project(name="Policy", owner_id=user.id, key="POL", next_sequence=1,
                      mode=mode, creation_status_policy=policy)
    db_session.add(project)
    await db_session.flush()
    board = Board(name="Board", project_id=project.id)
    db_session.add(board)
    statuses = {}
    if with_statuses:
        for i, (name, cat, extra) in enumerate([
            ("Backlog", "unstarted", {"is_default": True, "allow_on_create": True}),
            ("Doing", "started", {}),
            ("Shipped", "completed", {}),
        ]):
            s = ProjectStatus(project_id=project.id, name=name, category=cat, position=i, **extra)
            db_session.add(s)
            statuses[name] = s
    await db_session.commit()
    return user, project, board, statuses


def _create_url(project, board):
    return f"/api/v1/projects/{project.id}/boards/{board.id}/tasks"


@pytest.mark.asyncio
async def test_any_policy_creates_in_requested_status(db_session):
    user, project, board, statuses = await _seed(db_session, policy="any")
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_create_url(project, board), json={
            "title": "born done", "custom_status_id": str(statuses["Shipped"].id), "status": "done",
        })
    assert resp.status_code == 201
    assert resp.json()["custom_status_id"] == str(statuses["Shipped"].id)


@pytest.mark.asyncio
async def test_initial_policy_coerces_birth_status(db_session):
    user, project, board, statuses = await _seed(db_session, policy="initial")
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_create_url(project, board), json={
            "title": "tried to be born done", "custom_status_id": str(statuses["Shipped"].id), "status": "done",
        })
    assert resp.status_code == 201
    body = resp.json()
    assert body["custom_status_id"] == str(statuses["Backlog"].id)  # coerced to initial
    assert body["status"] == "todo"


@pytest.mark.asyncio
async def test_curated_policy_accepts_allowed_rejects_rest(db_session):
    user, project, board, statuses = await _seed(db_session, policy="curated")
    # allow "Doing" as well
    statuses["Doing"].allow_on_create = True
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        ok = await ac.post(_create_url(project, board), json={
            "title": "allowed", "custom_status_id": str(statuses["Doing"].id), "status": "in_progress",
        })
        assert ok.status_code == 201
        assert ok.json()["custom_status_id"] == str(statuses["Doing"].id)
        assert ok.json()["status"] == "in_progress"

        rejected = await ac.post(_create_url(project, board), json={
            "title": "not allowed", "custom_status_id": str(statuses["Shipped"].id), "status": "done",
        })
        assert rejected.status_code == 422

        defaulted = await ac.post(_create_url(project, board), json={"title": "no status asked"})
        assert defaulted.status_code == 201
        assert defaulted.json()["custom_status_id"] == str(statuses["Backlog"].id)


@pytest.mark.asyncio
async def test_initial_policy_in_open_mode_coerces_to_todo(db_session):
    user, project, board, _ = await _seed(db_session, mode="open", policy="initial", with_statuses=False)
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_create_url(project, board), json={"title": "wannabe done", "status": "done"})
    assert resp.status_code == 201
    assert resp.json()["status"] == "todo"


@pytest.mark.asyncio
async def test_mode_switch_resets_policy(db_session):
    user, project, board, statuses = await _seed(db_session, mode="guided", policy="curated")
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(f"/api/v1/projects/{project.id}/mode", json={"mode": "enforced"})
        assert resp.status_code == 200
    await db_session.refresh(project)
    assert project.creation_status_policy == "initial"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.patch(f"/api/v1/projects/{project.id}/mode", json={"mode": "guided"})
    await db_session.refresh(project)
    assert project.creation_status_policy == "any"


@pytest.mark.asyncio
async def test_project_created_with_mode_seeds_policy_and_rules(db_session):
    """Regression: ProjectCreate.mode was silently dropped by the endpoint."""
    user = User(email="modecreator@taskflow.io", hashed_password="x", is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post("/api/v1/projects", json={"name": "Strict Shop", "mode": "enforced"})
        assert resp.status_code == 201
        body = resp.json()
        assert body["mode"] == "enforced"
        assert body["creation_status_policy"] == "initial"
        transitions = await ac.get(f"/api/v1/projects/{body['id']}/transitions")
        assert len(transitions.json()) > 0  # linear workflow seeded at birth


@pytest.mark.asyncio
async def test_enforced_null_status_task_cannot_teleport(db_session):
    """P0: a task with no custom status used to skip validation entirely."""
    user, project, board, statuses = await _seed(db_session, mode="enforced", policy="initial")
    await ProjectStatusService(ProjectStatusRepository(db_session)).seed_enforced_transitions(project.id)
    task = Task(project_id=project.id, title="imported", sequence_number=1,
                status=TaskStatus.todo, custom_status_id=None)
    db_session.add(task)
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        base = f"/api/v1/projects/{project.id}/tasks/{task.id}"
        # straight to Shipped: initial→Shipped has no seeded rule → blocked
        teleport = await ac.patch(base, json={
            "custom_status_id": str(statuses["Shipped"].id), "version": 1,
        })
        assert teleport.status_code == 409
        # one step to Doing: initial→Doing is a seeded consecutive rule → allowed
        step = await ac.patch(base, json={
            "custom_status_id": str(statuses["Doing"].id), "version": 1,
        })
        assert step.status_code == 200


@pytest.mark.asyncio
async def test_enforced_unmapped_category_blocked(db_session):
    """P0: enum status change whose category has no mapped project status used
    to skip validation and sail through."""
    user, project, board, statuses = await _seed(db_session, mode="enforced", policy="initial")
    # Only unstarted+started exist — no completed-category status
    await db_session.delete(statuses["Shipped"])
    await db_session.commit()
    await ProjectStatusService(ProjectStatusRepository(db_session)).seed_enforced_transitions(project.id)
    task = Task(project_id=project.id, title="stuck", sequence_number=1,
                status=TaskStatus.in_progress, custom_status_id=None)
    db_session.add(task)
    await db_session.commit()
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.patch(
            f"/api/v1/projects/{project.id}/tasks/{task.id}",
            json={"status": "done", "version": 1},
        )
    assert resp.status_code == 409
