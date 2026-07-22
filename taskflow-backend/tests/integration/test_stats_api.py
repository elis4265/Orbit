"""Integration tests for /projects/{id}/stats/* — exercises the stats repository
(burndown, CFD, time-in-status, cycle-time, aggregates, forecast)."""
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
        "email": f"stats_{s}@test.io", "hashed_password": "h", "username": f"stats_{s}",
        "first_name": "Stat", "last_name": "User", "is_verified": True,
    })
    project = await ProjectRepository(db_session).create({"key": "STT", "name": "Stats Proj", "owner_id": user.id})
    board = await BoardRepository(db_session).create({"name": "Main", "project_id": project.id})
    return user, project, board


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create(ac, pid, bid, **fields):
    return (await ac.post(f"/api/v1/projects/{pid}/boards/{bid}/tasks", json={"title": "t", **fields})).json()


async def _set_status(ac, pid, task, status):
    return (await ac.patch(f"/api/v1/projects/{pid}/tasks/{task['id']}",
                           json={"status": status, "version": task["version"]})).json()


@pytest.mark.asyncio
async def test_stats_endpoints_all_return_shapes(seeded, db_session):
    user, project, board = seeded
    pid, bid = project.id, board.id
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        async with _client() as ac:
            # an optional priority to populate the by-priority breakdown
            pris = (await ac.get(f"/api/v1/projects/{pid}/priorities")).json()
            priority_id = pris[0]["id"] if isinstance(pris, list) and pris else None

            # t1: todo → in_progress → done (generates status-change activity + a completed task)
            t1 = await _create(ac, pid, bid, title="login bug")
            t1 = await _set_status(ac, pid, t1, "in_progress")
            await _set_status(ac, pid, t1, "done")

            # t2: in progress, assigned, estimated, past-due (overdue + points)
            extra = {"title": "build feature", "assignee_id": str(user.id), "due_date": "2020-01-01T00:00:00Z"}
            if priority_id:
                extra["priority_id"] = priority_id
            t2 = await _create(ac, pid, bid, **extra)
            await ac.patch(f"/api/v1/projects/{pid}/tasks/{t2['id']}", json={"estimate": 5, "version": t2["version"]})
            t2 = (await ac.get(f"/api/v1/projects/{pid}/boards/{bid}/tasks")).json()
            t2 = next(t for t in t2 if t["title"] == "build feature")
            await _set_status(ac, pid, t2, "in_progress")

            # t3: stays todo
            await _create(ac, pid, bid, title="backlog item")

            # several completed tasks so cycle-time / throughput percentile branches run
            for i in range(4):
                tc = await _create(ac, pid, bid, title=f"shipped {i}")
                tc = await _set_status(ac, pid, tc, "in_progress")
                await _set_status(ac, pid, tc, "done")

            # ── every stats endpoint ──
            assert (await ac.get(f"/api/v1/projects/{pid}/stats")).status_code == 200
            assert (await ac.get(f"/api/v1/projects/{pid}/stats", params={"board_id": str(bid), "date_from": "2020-01-01", "date_to": "2030-01-01"})).status_code == 200

            bd = await ac.get(f"/api/v1/projects/{pid}/stats/burndown", params={"unit": "count"})
            assert bd.status_code == 200 and isinstance(bd.json(), list)
            assert (await ac.get(f"/api/v1/projects/{pid}/stats/burndown", params={"unit": "points", "board_id": str(bid)})).status_code == 200

            fc = await ac.get(f"/api/v1/projects/{pid}/stats/forecast", params={"weeks": 6})
            assert fc.status_code == 200
            assert (await ac.get(f"/api/v1/projects/{pid}/stats/forecast", params={"remaining": 10})).status_code == 200

            assert (await ac.get(f"/api/v1/projects/{pid}/stats/cfd")).status_code == 200
            assert (await ac.get(f"/api/v1/projects/{pid}/stats/time-in-status")).status_code == 200

            ct = await ac.get(f"/api/v1/projects/{pid}/stats/cycle-time")
            assert ct.status_code == 200

            # the aggregate stats should reflect the seeded tasks
            stats = (await ac.get(f"/api/v1/projects/{pid}/stats")).json()
            assert sum(s["count"] for s in stats["by_status"]) >= 3
            assert "completion_rate" in stats and "overdue_count" in stats
    finally:
        app.dependency_overrides.pop(get_current_user, None)
