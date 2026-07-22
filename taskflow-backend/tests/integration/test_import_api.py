"""REQ-149 — CSV import: valid rows created, bad rows reported, batch survives."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.task import Task
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository

pytestmark = pytest.mark.integration

CSV = (
    "title,description,status,issue_type,due_date\n"
    "Fix login,broken since v2,in_progress,bug,2026-08-01\n"
    ",no title here,todo,task,\n"
    "Write docs,,done,task,\n"
    "Bad status,x,flying,task,\n"
)


@pytest_asyncio.fixture
async def seeded(db_session):
    user = await UserRepository(db_session).create({
        "email": f"imp_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x",
    })
    project = await ProjectRepository(db_session).create({"key": "IMP", "name": "P", "owner_id": user.id})
    await BoardRepository(db_session).create({"name": "B", "project_id": project.id})
    return user, project


@pytest.mark.asyncio
async def test_csv_import_mixed_rows(db_session, seeded):
    user, project = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post(
            f"/api/v1/projects/{project.id}/import/csv",
            files={"file": ("tasks.csv", CSV.encode(), "text/csv")},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["created"] == 2
        assert len(data["errors"]) == 2
        assert data["errors"][0]["row"] == 3  # missing title
        assert "status" in data["errors"][1]["error"]

        # done-status import gets completed_at stamped by the normal create path
        tasks = (await db_session.execute(select(Task).where(Task.project_id == project.id))).scalars().all()
        by_title = {t.title: t for t in tasks}
        assert by_title["Write docs"].completed_at is not None
        assert by_title["Fix login"].created_by == user.id

        # garbage file → 422
        res = await ac.post(
            f"/api/v1/projects/{project.id}/import/csv",
            files={"file": ("x.csv", b"no,header,titles\n1,2,3\n", "text/csv")},
        )
        assert res.status_code == 422
    app.dependency_overrides.pop(get_current_user, None)
