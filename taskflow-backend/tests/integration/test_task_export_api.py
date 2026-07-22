"""REQ-159 — CSV task export: default columns, fields= picker, round-trip with import (DD-051)."""
import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.api.dependencies import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.project_member import ProjectMember, MemberRole
from app.models.task import Task, TaskStatus, IssueType
from app.models.tag import Tag, TagVisibility
from app.models.task_tag import TaskTag
from app.models.work_log import WorkLog


@pytest.fixture(autouse=True)
def _clear_user_override():
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _auth_as(user):
    app.dependency_overrides[get_current_user] = lambda: user


def _parse_csv(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


async def _seed(db_session):
    user = User(email="exporter@taskflow.io", username="exporter", hashed_password="x",
                is_verified=True, is_active=True)
    db_session.add(user)
    await db_session.flush()
    project = Project(name="Exportia", owner_id=user.id, key="EXP", next_sequence=3)
    db_session.add(project)
    await db_session.flush()

    task = Task(project_id=project.id, title="Export me", description="<p>hi</p>",
                status=TaskStatus.in_progress, issue_type=IssueType.bug,
                sequence_number=1, estimate=8, assignee_id=user.id, created_by=user.id,
                due_date=datetime(2026, 8, 1, tzinfo=timezone.utc))
    other = Task(project_id=project.id, title="Plain", sequence_number=2)
    tag = Tag(name="backend", color="#ff0000", project_id=project.id,
              owner_id=user.id, visibility=TagVisibility.workspace)
    db_session.add_all([task, other, tag])
    await db_session.flush()
    db_session.add_all([
        TaskTag(task_id=task.id, tag_id=tag.id, added_by=user.id),
        WorkLog(task_id=task.id, user_id=user.id, minutes=90),
        WorkLog(task_id=task.id, user_id=user.id, minutes=30),
    ])
    await db_session.commit()
    return user, project, task


@pytest.mark.asyncio
async def test_export_default_columns_and_values(db_session):
    user, project, task = await _seed(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{project.id}/tasks/export")
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]

    rows = _parse_csv(resp.text)
    assert len(rows) == 2
    for col in ("key", "id", "title", "description", "issue_type", "status",
                "assignee", "created_by", "tags", "estimate", "due_date",
                "created_at", "completed_at", "time_spent_minutes"):
        assert col in rows[0], f"missing column {col}"

    by_key = {r["key"]: r for r in rows}
    r = by_key["EXP-1"]
    assert r["title"] == "Export me"
    assert r["status"] == "in_progress"
    assert r["issue_type"] == "bug"
    assert r["assignee"] == "exporter"
    assert r["tags"] == "backend"
    assert r["estimate"] == "8"
    assert r["time_spent_minutes"] == "120"
    assert r["description"] == "<p>hi</p>"


@pytest.mark.asyncio
async def test_export_fields_param_subsets_and_validates(db_session):
    user, project, task = await _seed(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{project.id}/tasks/export?fields=key,title")
        assert resp.status_code == 200
        rows = _parse_csv(resp.text)
        assert list(rows[0].keys()) == ["key", "title"]

        bogus = await ac.get(f"/api/v1/projects/{project.id}/tasks/export?fields=key,flavour")
        assert bogus.status_code == 422


@pytest.mark.asyncio
async def test_export_includes_hidden_done_tasks(db_session):
    user, project, task = await _seed(db_session)
    project.hide_done_after_days = 1
    old_done = Task(project_id=project.id, title="Ancient", status=TaskStatus.done,
                    sequence_number=3, completed_at=datetime.now(timezone.utc) - timedelta(days=30))
    project.next_sequence = 4
    db_session.add(old_done)
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(f"/api/v1/projects/{project.id}/tasks/export?fields=key,title")
        titles = [r["title"] for r in _parse_csv(resp.text)]
        assert "Ancient" in titles


@pytest.mark.asyncio
async def test_export_viewer_allowed_stranger_forbidden(db_session):
    user, project, task = await _seed(db_session)
    viewer = User(email="viewer@taskflow.io", hashed_password="x", is_verified=True, is_active=True)
    stranger = User(email="stranger@taskflow.io", hashed_password="x", is_verified=True, is_active=True)
    db_session.add_all([viewer, stranger])
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=viewer.id, role=MemberRole.viewer))
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        _auth_as(viewer)
        assert (await ac.get(f"/api/v1/projects/{project.id}/tasks/export")).status_code == 200
        _auth_as(stranger)
        assert (await ac.get(f"/api/v1/projects/{project.id}/tasks/export")).status_code in (403, 404)


@pytest.mark.asyncio
async def test_export_post_with_task_ids_exports_only_those(db_session):
    user, project, task = await _seed(db_session)
    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/tasks/export",
            json={"fields": "key,title", "task_ids": [str(task.id)]},
        )
        assert resp.status_code == 200
        rows = _parse_csv(resp.text)
        assert [r["title"] for r in rows] == ["Export me"]

        # foreign/unknown ids are ignored, never leak other projects' tasks
        resp = await ac.post(
            f"/api/v1/projects/{project.id}/tasks/export",
            json={"fields": "key,title", "task_ids": [str(uuid.uuid4())]},
        )
        assert _parse_csv(resp.text) == []


@pytest.mark.asyncio
async def test_export_import_round_trip(db_session):
    user, project, task = await _seed(db_session)
    target = Project(name="Reimport", owner_id=user.id, key="IMP", next_sequence=1)
    db_session.add(target)
    await db_session.commit()

    _auth_as(user)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(
            f"/api/v1/projects/{project.id}/tasks/export?fields=title,description,status,issue_type,due_date"
        )
        assert resp.status_code == 200

        imp = await ac.post(
            f"/api/v1/projects/{target.id}/import/csv",
            files={"file": ("export.csv", resp.text.encode(), "text/csv")},
        )
        assert imp.status_code == 200, imp.text
        body = imp.json()
        assert body["errors"] == []
        assert body["created"] == 2

    imported = (await db_session.execute(
        select(Task).where(Task.project_id == target.id)
    )).scalars().all()
    assert sorted(t.title for t in imported) == ["Export me", "Plain"]
    by_title = {t.title: t for t in imported}
    assert by_title["Export me"].status == TaskStatus.in_progress
    assert by_title["Export me"].issue_type == IssueType.bug
