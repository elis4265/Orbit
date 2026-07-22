"""REQ-152 — related-to-me id sets for identity filters."""
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.api.dependencies import get_current_user
from app.models.comment import Comment
from app.models.notification import Notification, NotificationType
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.repositories.task import TaskRepository

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    users = UserRepository(db_session)
    me = await users.create({"email": f"rel_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    other = await users.create({"email": f"oth_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x"})
    project = await ProjectRepository(db_session).create({"key": "REL", "name": "P", "owner_id": me.id})
    await BoardRepository(db_session).create({"name": "B", "project_id": project.id})
    tasks = TaskRepository(db_session)
    t1 = await tasks.create_with_sequence(project.id, {"project_id": project.id, "title": "T1"})
    t2 = await tasks.create_with_sequence(project.id, {"project_id": project.id, "title": "T2"})
    t3 = await tasks.create_with_sequence(project.id, {"project_id": project.id, "title": "T3"})
    db_session.add_all([
        Comment(task_id=t1.id, author_id=me.id, content="mine"),
        Comment(task_id=t2.id, author_id=other.id, content="not mine"),
        Notification(
            user_id=me.id, task_id=t3.id, project_id=project.id,
            type=NotificationType.mentioned, payload={"note": "you were mentioned"},
        ),
    ])
    await db_session.commit()
    return me, project, t1, t2, t3


@pytest.mark.asyncio
async def test_related_to_me_sets(db_session, seeded):
    me, project, t1, t2, t3 = seeded
    app.dependency_overrides[get_current_user] = lambda: me
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.get(f"/api/v1/projects/{project.id}/related-to-me")
        assert res.status_code == 200
        data = res.json()
        assert data["commented"] == [str(t1.id)]
        assert data["mentioned"] == [str(t3.id)]
    app.dependency_overrides.pop(get_current_user, None)
