"""REQ-164 — promote a subtask (child task, DD-027) into a standalone task."""
import uuid

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.task import Task, TaskStatus
from app.models.task_link import TaskLink


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


async def _seed(db_session):
    user = User(email="promoter@taskflow.io", username="promoter", hashed_password="x",
                is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.flush()
    project = Project(name="Promo", owner_id=user.id, key="PRM", next_sequence=3)
    db_session.add(project)
    await db_session.flush()
    parent = Task(project_id=project.id, title="Parent", sequence_number=1)
    db_session.add(parent)
    await db_session.flush()
    child = Task(project_id=project.id, title="Checklist item", status=TaskStatus.done,
                 parent_id=parent.id, sequence_number=2)
    db_session.add(child)
    await db_session.commit()
    return user, project, parent, child


@pytest.mark.asyncio
async def test_promote_detaches_child_and_links_to_parent(db_session):
    user, project, parent, child = await _seed(db_session)
    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/tasks/{parent.id}/subtasks/{child.id}/promote"
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == str(child.id)          # same task, not a copy
        assert body["sequence_number"] == 2          # keeps its key

    await db_session.refresh(child)
    assert child.parent_id is None
    assert child.status == TaskStatus.done           # status survives

    link = (await db_session.execute(
        select(TaskLink).where(TaskLink.source_id == child.id, TaskLink.target_id == parent.id)
    )).scalars().first()
    assert link is not None and link.link_type.value == "relates_to"


@pytest.mark.asyncio
async def test_promote_404_when_subtask_not_under_task(db_session):
    user, project, parent, child = await _seed(db_session)
    stranger_task = Task(project_id=project.id, title="Unrelated", sequence_number=3)
    project.next_sequence = 4
    db_session.add(stranger_task)
    await db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: user
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/tasks/{stranger_task.id}/subtasks/{child.id}/promote"
        )
        assert resp.status_code == 404
        # nothing changed
    await db_session.refresh(child)
    assert child.parent_id == parent.id
