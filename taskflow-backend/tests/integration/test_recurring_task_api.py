"""REQ-148 — recurring tasks: CRUD + the scheduler runner creating real tasks."""
import uuid
from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, update as sa_update

from app.main import app
from app.api.dependencies import get_current_user
from app.models.recurring_task import RecurringTask
from app.models.task import Task
from app.models.task_template import TaskTemplate
from app.repositories.user import UserRepository
from app.repositories.project import ProjectRepository
from app.repositories.board import BoardRepository
from app.services.recurrence import run_due_recurring_tasks

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def seeded(db_session):
    user = await UserRepository(db_session).create({
        "email": f"rt_{uuid.uuid4().hex[:6]}@taskflow.io", "hashed_password": "x",
    })
    project = await ProjectRepository(db_session).create({"key": "RT", "name": "P", "owner_id": user.id})
    await BoardRepository(db_session).create({"name": "B", "project_id": project.id})
    template = TaskTemplate(project_id=project.id, name="Weekly standup prep", title="Prepare standup", issue_type="task")
    db_session.add(template)
    await db_session.commit()
    await db_session.refresh(template)
    return user, project, template


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_recurring_crud(db_session, seeded):
    user, project, template = seeded
    app.dependency_overrides[get_current_user] = lambda: user
    async with _client() as ac:
        base = f"/api/v1/projects/{project.id}/recurring-tasks"

        res = await ac.post(base, json={"template_id": str(template.id), "cadence": "weekly", "weekday": 0})
        assert res.status_code == 201
        rule = res.json()
        assert rule["next_run_at"] is not None
        assert rule["created_by"] == str(user.id)

        # weekly without weekday → 422
        assert (await ac.post(base, json={"template_id": str(template.id), "cadence": "weekly"})).status_code == 422
        # template from nowhere → 404
        assert (await ac.post(base, json={"template_id": str(uuid.uuid4()), "cadence": "daily"})).status_code == 404

        assert len((await ac.get(base)).json()) == 1

        res = await ac.patch(f"{base}/{rule['id']}", json={"enabled": False})
        assert res.json()["enabled"] is False

        assert (await ac.delete(f"{base}/{rule['id']}")).status_code == 204
        assert (await ac.get(base)).json() == []
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_runner_creates_task_and_advances_schedule(db_session, seeded):
    user, project, template = seeded
    rule = RecurringTask(
        project_id=project.id, template_id=template.id, cadence="daily",
        next_run_at=date.today() - timedelta(days=1), created_by=user.id,
    )
    disabled = RecurringTask(
        project_id=project.id, template_id=template.id, cadence="daily",
        next_run_at=date.today() - timedelta(days=1), created_by=user.id, enabled=False,
    )
    db_session.add_all([rule, disabled])
    await db_session.commit()

    created = await run_due_recurring_tasks(db_session)
    assert created == 1  # disabled rule skipped

    tasks = (await db_session.execute(select(Task).where(Task.project_id == project.id))).scalars().all()
    assert len(tasks) == 1
    assert tasks[0].title == "Prepare standup"
    assert tasks[0].created_by == user.id

    await db_session.refresh(rule)
    assert rule.next_run_at == date.today() + timedelta(days=1)
