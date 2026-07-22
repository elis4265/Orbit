"""Integration tests for /projects/{id}/releases — CRUD, progress rollup, ship."""
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
        "email": f"rel_{s}@test.io", "hashed_password": "h", "username": f"rel_{s}",
        "first_name": "Rel", "last_name": "User", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "REL", "name": "Rel Proj", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Main", "project_id": project.id})
    return user, project, board


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_release_crud_progress_and_ship_backlog(seeded, db_session):
    user, project, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/releases"
            r = await ac.post(base, json={"name": "v1.0", "release_date": "2026-08-01"})
            assert r.status_code == 201
            body = r.json()
            rid = body["id"]
            assert body["status"] == "planned"
            assert body["progress_pct"] == 0

            assert len((await ac.get(base)).json()) == 1

            # two tasks → assign both, complete one → 50%
            t1 = (await ac.post(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks", json={"title": "done one"})).json()
            t2 = (await ac.post(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks", json={"title": "open one"})).json()
            await ac.patch(f"/api/v1/projects/{project.id}/tasks/{t1['id']}", json={"release_id": rid, "status": "done", "version": t1["version"]})
            await ac.patch(f"/api/v1/projects/{project.id}/tasks/{t2['id']}", json={"release_id": rid, "version": t2["version"]})

            prog = (await ac.get(base)).json()[0]
            assert (prog["total_tasks"], prog["done_tasks"], prog["progress_pct"]) == (2, 1, 50)

            up = await ac.patch(f"{base}/{rid}", json={"name": "v1.0.1"})
            assert up.status_code == 200 and up.json()["name"] == "v1.0.1"

            ship = await ac.post(f"{base}/{rid}/ship", json={"unfinished_action": "backlog"})
            assert ship.status_code == 200
            assert ship.json()["status"] == "released"
            assert ship.json()["incomplete_tasks"] == 1
            assert ship.json()["clean"] is False

            tasks = {t["id"]: t for t in (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()}
            assert tasks[t2["id"]]["release_id"] is None      # moved to backlog
            assert tasks[t1["id"]]["release_id"] == rid       # done one stays

            assert (await ac.delete(f"{base}/{rid}")).status_code == 204
            assert (await ac.get(base)).json() == []
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_release_404_and_ship_move(seeded, db_session):
    user, project, board = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            base = f"/api/v1/projects/{project.id}/releases"
            assert (await ac.patch(f"{base}/{uuid.uuid4()}", json={"name": "x"})).status_code == 404
            assert (await ac.delete(f"{base}/{uuid.uuid4()}")).status_code == 404
            assert (await ac.post(f"{base}/{uuid.uuid4()}/ship")).status_code == 404

            r1 = (await ac.post(base, json={"name": "v1"})).json()
            r2 = (await ac.post(base, json={"name": "v2"})).json()
            t = (await ac.post(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks", json={"title": "carryover"})).json()
            await ac.patch(f"/api/v1/projects/{project.id}/tasks/{t['id']}", json={"release_id": r1["id"], "version": t["version"]})

            # move with no/own target → 422
            assert (await ac.post(f"{base}/{r1['id']}/ship", json={"unfinished_action": "move"})).status_code == 422
            assert (await ac.post(f"{base}/{r1['id']}/ship", json={"unfinished_action": "move", "target_release_id": r1["id"]})).status_code == 422

            ok = await ac.post(f"{base}/{r1['id']}/ship", json={"unfinished_action": "move", "target_release_id": r2["id"]})
            assert ok.status_code == 200
            tasks = {x["id"]: x for x in (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()}
            assert tasks[t["id"]]["release_id"] == r2["id"]   # carried over to v2

            # ship v2 with NO body → default "keep" leaves its tasks on the release
            keep = await ac.post(f"{base}/{r2['id']}/ship")
            assert keep.status_code == 200 and keep.json()["status"] == "released"
            tasks = {x["id"]: x for x in (await ac.get(f"/api/v1/projects/{project.id}/boards/{board.id}/tasks")).json()}
            assert tasks[t["id"]]["release_id"] == r2["id"]   # kept on v2
    finally:
        app.dependency_overrides.pop(get_current_user, None)
