"""Integration tests for GET /search/tasks — cross-project (global) search."""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.task import TaskRepository

pytestmark = pytest.mark.integration


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _user(db_session, tag):
    return await UserRepository(db_session).create({
        "email": f"{tag}_{uuid.uuid4().hex[:6]}@test.io", "hashed_password": "h",
        "username": f"{tag}_{uuid.uuid4().hex[:6]}", "is_verified": True,
    })


async def _task(db_session, project_id, title, seq=1):
    return await TaskRepository(db_session).create({
        "title": title, "project_id": project_id, "sequence_number": seq,
        "position": 0, "version": 1, "status": "todo",
    })


@pytest.mark.asyncio
async def test_global_search_spans_caller_projects_and_isolates(db_session):
    kw = f"zqx{uuid.uuid4().hex[:6]}"
    a = await _user(db_session, "ga")
    b = await _user(db_session, "gb")
    p1 = await ProjectRepository(db_session).create({"key": "AAA", "name": "P1", "owner_id": a.id})
    p2 = await ProjectRepository(db_session).create({"key": "BBB", "name": "P2", "owner_id": a.id})
    p3 = await ProjectRepository(db_session).create({"key": "CCC", "name": "P3", "owner_id": b.id})
    await _task(db_session, p1.id, f"{kw} alpha")
    await _task(db_session, p2.id, f"{kw} beta")
    await _task(db_session, p3.id, f"{kw} gamma")

    # A sees both of A's projects' tasks (two distinct projects), never B's.
    app.dependency_overrides[get_current_user] = lambda: a
    try:
        async with _client() as ac:
            res = await ac.get("/api/v1/search/tasks", params={"q": kw})
            assert res.status_code == 200
            rows = res.json()
            assert sorted(r["title"] for r in rows) == [f"{kw} alpha", f"{kw} beta"]
            assert len({r["project_id"] for r in rows}) == 2
            assert all(r["project_id"] for r in rows)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # B sees only B's task.
    app.dependency_overrides[get_current_user] = lambda: b
    try:
        async with _client() as ac:
            res = await ac.get("/api/v1/search/tasks", params={"q": kw})
            assert [r["title"] for r in res.json()] == [f"{kw} gamma"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_global_search_short_query_and_ticket_lookup(db_session):
    a = await _user(db_session, "gs")
    p = await ProjectRepository(db_session).create({"key": "ORB", "name": "P", "owner_id": a.id})
    t = await _task(db_session, p.id, "find me by number", seq=42)

    app.dependency_overrides[get_current_user] = lambda: a
    try:
        async with _client() as ac:
            # under 2 chars → empty
            assert (await ac.get("/api/v1/search/tasks", params={"q": "z"})).json() == []
            # bare sequence number → direct hit
            by_num = (await ac.get("/api/v1/search/tasks", params={"q": "42"})).json()
            assert any(r["id"] == str(t.id) for r in by_num)
            # KEY-N ticket form
            by_key = (await ac.get("/api/v1/search/tasks", params={"q": "ORB-42"})).json()
            assert any(r["id"] == str(t.id) for r in by_key)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
