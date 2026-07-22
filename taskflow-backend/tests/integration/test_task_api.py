import pytest
import pytest_asyncio
import uuid
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    user = await UserRepository(db_session).create({
        "email": f"task_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    workspace = await ProjectRepository(db_session).create({"key": "WS", 
        "name": "Test Project",
        "owner_id": user.id,
    })
    board = await BoardRepository(db_session).create({
        "name": "Main Board",
        "project_id": workspace.id,
    })
    return user, workspace, board


@pytest.mark.asyncio
async def test_task_full_crud_lifecycle(db_session, seeded):
    user, workspace, board = seeded

    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_base = f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks"
        task_base = f"/api/v1/projects/{workspace.id}/tasks"

        # Create
        res = await ac.post(create_base, json={"title": "Ship it", "status": "todo"})
        assert res.status_code == 201
        task = res.json()
        assert task["title"] == "Ship it"
        assert task["version"] == 1
        assert task["status"] == "todo"
        assert task["project_id"] == str(workspace.id)
        task_id = task["id"]

        # List
        res = await ac.get(create_base)
        assert res.status_code == 200
        assert len(res.json()) == 1

        # Update (correct version)
        res = await ac.patch(f"{task_base}/{task_id}", json={"status": "in_progress", "version": 1})
        assert res.status_code == 200
        updated = res.json()
        assert updated["status"] == "in_progress"
        assert updated["version"] == 2

        # Delete
        res = await ac.delete(f"{task_base}/{task_id}")
        assert res.status_code == 204

        # Board is empty
        res = await ac.get(create_base)
        assert res.json() == []

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_update_stale_version_returns_409(db_session, seeded):
    user, workspace, board = seeded

    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_base = f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks"
        task_base = f"/api/v1/projects/{workspace.id}/tasks"

        res = await ac.post(create_base, json={"title": "Race bait"})
        task_id = res.json()["id"]

        # First update succeeds, bumps version to 2
        await ac.patch(f"{task_base}/{task_id}", json={"status": "in_progress", "version": 1})

        # Second client sends stale version 1 — must 409
        res = await ac.patch(f"{task_base}/{task_id}", json={"status": "done", "version": 1})
        assert res.status_code == 409

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_delete_nonexistent_task_returns_404(db_session, seeded):
    user, workspace, board = seeded

    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        fake_id = uuid.uuid4()
        res = await ac.delete(
            f"/api/v1/projects/{workspace.id}/tasks/{fake_id}"
        )
        assert res.status_code == 404

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_reorder_tasks(db_session, seeded):
    user, workspace, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_base = f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks"
        task_base = f"/api/v1/projects/{workspace.id}/tasks"

        r1 = await ac.post(create_base, json={"title": "Task A", "position": 0})
        r2 = await ac.post(create_base, json={"title": "Task B", "position": 1})
        id_a = r1.json()["id"]
        id_b = r2.json()["id"]

        # Swap positions (reorder is board-scoped)
        resp = await ac.patch(
            f"{create_base}/reorder",
            json={"tasks": [{"id": id_a, "position": 1}, {"id": id_b, "position": 0}]},
        )
        assert resp.status_code == 204

        tasks = await ac.get(create_base)
        positions = {t["id"]: t["position"] for t in tasks.json()}
        assert positions[id_a] == 1
        assert positions[id_b] == 0

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_ownership_guard_blocks_wrong_user(db_session, seeded):
    _, workspace, board = seeded
    intruder = await UserRepository(db_session).create({
        "email": f"intruder_{uuid.uuid4().hex[:6]}@taskflow.io",
        "hashed_password": "argon2hash",
    })
    app.dependency_overrides[get_current_user] = lambda: intruder

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks")

    app.dependency_overrides.clear()
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_me_returns_authenticated_user(db_session, seeded):
    user, _, __ = seeded

    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/v1/auth/me")
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == user.email
        assert "id" in data
        assert "hashed_password" not in data

    app.dependency_overrides.clear()


# ── REQ-137/REQ-138 — completed_at + hide-done-after-days board filter ────────

@pytest.mark.asyncio
async def test_completed_at_lifecycle(db_session, seeded):
    """REQ-137: set on entering done, preserved on re-assert/edit, cleared on leaving."""
    user, workspace, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_base = f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks"
        task_base = f"/api/v1/projects/{workspace.id}/tasks"

        res = await ac.post(create_base, json={"title": "Finish me"})
        task = res.json()
        assert task["completed_at"] is None
        task_id = task["id"]

        # → done: stamped
        res = await ac.patch(f"{task_base}/{task_id}", json={"status": "done", "version": 1})
        assert res.status_code == 200
        stamped = res.json()["completed_at"]
        assert stamped is not None

        # unrelated edit: preserved
        res = await ac.patch(f"{task_base}/{task_id}", json={"title": "Renamed", "version": 2})
        assert res.json()["completed_at"] == stamped

        # re-assert done (drag reorder within Done re-sends status): preserved
        res = await ac.patch(f"{task_base}/{task_id}", json={"status": "done", "version": 3})
        assert res.json()["completed_at"] == stamped

        # leave done: cleared
        res = await ac.patch(f"{task_base}/{task_id}", json={"status": "in_progress", "version": 4})
        assert res.json()["completed_at"] is None

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_task_directly_done_sets_completed_at(db_session, seeded):
    user, workspace, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post(
            f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks",
            json={"title": "Born done", "status": "done"},
        )
        assert res.status_code == 201
        assert res.json()["completed_at"] is not None

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_board_list_hides_old_done_tasks(db_session, seeded):
    """REQ-138: board list drops tasks completed before the cutoff; escape hatch and
    project-level list still return them."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update as sa_update
    from app.models.task import Task as TaskModel
    from app.models.project import Project as ProjectModel

    user, workspace, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    await db_session.execute(
        sa_update(ProjectModel).where(ProjectModel.id == workspace.id).values(hide_done_after_days=14)
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        create_base = f"/api/v1/projects/{workspace.id}/boards/{board.id}/tasks"
        task_base = f"/api/v1/projects/{workspace.id}/tasks"

        old_id = (await ac.post(create_base, json={"title": "Ancient", "status": "done"})).json()["id"]
        fresh_id = (await ac.post(create_base, json={"title": "Fresh", "status": "done"})).json()["id"]
        open_id = (await ac.post(create_base, json={"title": "Open"})).json()["id"]

        await db_session.execute(
            sa_update(TaskModel).where(TaskModel.id == uuid.UUID(old_id)).values(
                completed_at=datetime.now(timezone.utc) - timedelta(days=30)
            )
        )
        await db_session.commit()

        res = await ac.get(create_base)
        ids = {t["id"] for t in res.json()}
        assert old_id not in ids
        assert fresh_id in ids
        assert open_id in ids

        # escape hatch
        res = await ac.get(f"{create_base}?include_old_done=true")
        ids = {t["id"] for t in res.json()}
        assert old_id in ids

        # project-level list unaffected
        res = await ac.get(task_base)
        ids = {t["id"] for t in res.json()}
        assert old_id in ids

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_patch_project_hide_done_after_days(db_session, seeded):
    """REQ-138: admin can set, clear and is validated on hide_done_after_days."""
    user, workspace, _ = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        base = f"/api/v1/projects/{workspace.id}"

        res = await ac.patch(base, json={"hide_done_after_days": 30})
        assert res.status_code == 200
        assert res.json()["hide_done_after_days"] == 30

        # rename alone must not clobber the setting
        res = await ac.patch(base, json={"name": "Renamed Project"})
        assert res.status_code == 200
        assert res.json()["hide_done_after_days"] == 30

        res = await ac.patch(base, json={"hide_done_after_days": None})
        assert res.status_code == 200
        assert res.json()["hide_done_after_days"] is None

        res = await ac.patch(base, json={"hide_done_after_days": 0})
        assert res.status_code == 422

        res = await ac.patch(base, json={"hide_done_after_days": 400})
        assert res.status_code == 422

    app.dependency_overrides.clear()
