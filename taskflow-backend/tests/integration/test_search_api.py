"""Integration tests for GET /projects/{id}/tasks/search and GET /projects/{id}/tasks/{tid}.

Search runs on Postgres FTS (websearch_to_tsquery + pg_trgm similarity) —
the tasks.search_vector generated column comes from the Task model, so
metadata.create_all in conftest builds everything these tests need.
"""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    suffix = uuid.uuid4().hex[:6]
    user = await UserRepository(db_session).create({
        "email": f"search_{suffix}@test.io",
        "hashed_password": "argon2hash",
        "username": f"searcher_{suffix}",
        "first_name": "Search",
        "last_name": "User",
        "is_verified": True,
    })
    # Hex chars 0-f each map to A-P, ensuring an all-letter key that passes
    # the ticket-number regex ([A-Za-z]{2,10}).
    _alpha = "ABCDEFGHIJKLMNOP"
    key = "".join(_alpha[int(c, 16)] for c in suffix[:3])
    project = await ProjectRepository(db_session).create({"key": "WS", 
        "name": "Search Project",
        "key": key,
        "owner_id": user.id,
    })
    board = await BoardRepository(db_session).create({
        "name": "Main",
        "project_id": project.id,
    })
    task_repo = TaskRepository(db_session)
    t1 = await task_repo.create({
        "title": "Fix login page",
        "description": "The login button is broken on mobile",
        "status": "todo",
        "project_id": project.id,
        "sequence_number": 1,
        "position": 0,
        "version": 1,
    })
    t2 = await task_repo.create({
        "title": "Design game UI",
        "description": "Create mockups for the main screen",
        "status": "in_progress",
        "project_id": project.id,
        "sequence_number": 2,
        "position": 1,
        "version": 1,
    })
    t3 = await task_repo.create({
        "title": "Write unit tests",
        "description": "Cover the game engine module with tests",
        "status": "done",
        "project_id": project.id,
        "sequence_number": 3,
        "position": 2,
        "version": 1,
    })
    # sequence_number 10 is needed so bare-number query "10" (2 chars) passes the min-length guard
    t10 = await task_repo.create({
        "title": "Deploy to production",
        "description": "Production deployment checklist",
        "status": "todo",
        "project_id": project.id,
        "sequence_number": 10,
        "position": 3,
        "version": 1,
    })
    return user, project, board, [t1, t2, t3, t10]


@pytest.mark.asyncio
async def test_search_by_title_fts(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": "login"})

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["title"] == "Fix login page"
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_by_description_fts(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": "game"})

    assert res.status_code == 200
    data = res.json()
    titles = {r["title"] for r in data}
    # "game" appears in t2 title and t3 description
    assert "Design game UI" in titles
    assert "Write unit tests" in titles
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_ticket_number_key_format(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    ticket = f"{project.key}-2"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": ticket})

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["sequence_number"] == 2
    assert data[0]["title"] == "Design game UI"
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_ticket_bare_number(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    # Use "10" (2 chars) — single-digit bare numbers are blocked by the min-length guard
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": "10"})

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["sequence_number"] == 10
    assert data[0]["title"] == "Deploy to production"
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_short_query_returns_empty(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": "f"})

    assert res.status_code == 200
    assert res.json() == []
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_no_match_returns_empty(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": "xyzxyzxyz"})

    assert res.status_code == 200
    assert res.json() == []
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_result_includes_sequence_number_and_project_key(db_session, seeded):
    user, project, board, tasks = seeded
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/search", params={"q": "login"})

    assert res.status_code == 200
    hit = res.json()[0]
    assert hit["sequence_number"] == 1
    assert hit["project_key"] == project.key
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_task_by_id(db_session, seeded):
    user, project, board, tasks = seeded
    t1 = tasks[0]
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/tasks/{t1.id}")

    assert res.status_code == 200
    data = res.json()
    assert data["id"] == str(t1.id)
    assert data["title"] == "Fix login page"
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_task_by_id_wrong_project_returns_404(db_session, seeded):
    user, project, board, tasks = seeded
    t1 = tasks[0]
    app.dependency_overrides[get_current_user] = lambda: user

    other_project = await ProjectRepository(db_session).create({"key": "WS", 
        "name": "Other",
        "key": "OTH",
        "owner_id": user.id,
    })

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{other_project.id}/tasks/{t1.id}")

    assert res.status_code == 404
    app.dependency_overrides.clear()
